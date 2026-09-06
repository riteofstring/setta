package contracts

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

const (
	maximumSections      = 1024
	maximumBindings      = 1024
	maximumChildren      = 1024
	maximumArguments     = 128
	maximumOutputs       = 128
	maximumConfiguration = 512
	maximumJSONDepth     = 32
	maximumStringBytes   = 1 << 20
)

var (
	ErrInvalidSize = errors.New("contracts: size must be a positive number or auto")
	idPattern      = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	handlerPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
	runtimePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
)

func DecodeStrict(data []byte, target any) error {
	if err := validateUniqueJSON(data); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("contracts: multiple JSON values")
		}
		return err
	}
	return nil
}

func validateUniqueJSON(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeUniqueJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("contracts: multiple JSON values")
		}
		return err
	}
	return nil
}

func consumeUniqueJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, compound := token.(json.Delim)
	if !compound {
		return nil
	}
	switch delimiter {
	case '{':
		fields := make(map[string]struct{})
		for decoder.More() {
			nameToken, err := decoder.Token()
			if err != nil {
				return err
			}
			name, ok := nameToken.(string)
			if !ok {
				return errors.New("contracts: JSON object field name is invalid")
			}
			if _, exists := fields[name]; exists {
				return fmt.Errorf("contracts: JSON object repeats field %q", name)
			}
			fields[name] = struct{}{}
			if err := consumeUniqueJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil {
			return err
		}
		if closing != json.Delim('}') {
			return errors.New("contracts: JSON object is not closed")
		}
		return nil
	case '[':
		for decoder.More() {
			if err := consumeUniqueJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil {
			return err
		}
		if closing != json.Delim(']') {
			return errors.New("contracts: JSON array is not closed")
		}
		return nil
	default:
		return errors.New("contracts: JSON compound value is invalid")
	}
}

func (project Project) Validate() error {
	if project.Version != ProjectVersion {
		return fmt.Errorf("contracts: unsupported project version %d", project.Version)
	}
	if !validID(project.ID) {
		return errors.New("contracts: project id is invalid")
	}
	if err := validateText(project.Name, true); err != nil {
		return fmt.Errorf("contracts: project name: %w", err)
	}
	if err := project.Runtime.Validate(); err != nil {
		return err
	}
	if project.Sections == nil || len(project.Sections) > maximumSections {
		return errors.New("contracts: sections are missing or exceed the limit")
	}
	if project.Bindings == nil || len(project.Bindings) > maximumBindings {
		return errors.New("contracts: bindings are missing or exceed the limit")
	}
	if project.Configuration == nil || len(project.Configuration) > maximumConfiguration {
		return errors.New("contracts: configuration is missing or exceeds the limit")
	}
	for key, value := range project.Configuration {
		if !validID(key) {
			return fmt.Errorf("contracts: configuration key %q is invalid", key)
		}
		if err := validateJSON(value); err != nil {
			return fmt.Errorf("contracts: configuration %q: %w", key, err)
		}
	}
	if err := validateSections(project.Sections, project.Layout); err != nil {
		return err
	}
	seenBindings := make(map[string]struct{}, len(project.Bindings))
	for index, binding := range project.Bindings {
		if _, exists := seenBindings[binding.ID]; exists {
			return fmt.Errorf("contracts: duplicate binding id %q", binding.ID)
		}
		seenBindings[binding.ID] = struct{}{}
		if err := binding.Validate(project.Sections); err != nil {
			return fmt.Errorf("contracts: binding %d: %w", index, err)
		}
	}
	return nil
}

func (runtime RuntimeDeclaration) Validate() error {
	if !runtimePattern.MatchString(runtime.Kind) {
		return errors.New("contracts: runtime kind is invalid")
	}
	if strings.TrimSpace(runtime.Entrypoint) == "" || runtime.Entrypoint != strings.TrimSpace(runtime.Entrypoint) || !utf8.ValidString(runtime.Entrypoint) || strings.ContainsRune(runtime.Entrypoint, '\x00') {
		return errors.New("contracts: runtime entrypoint is invalid")
	}
	if filepath.IsAbs(runtime.Entrypoint) || filepath.Clean(runtime.Entrypoint) != runtime.Entrypoint || runtime.Entrypoint == "." || runtime.Entrypoint == ".." || strings.HasPrefix(runtime.Entrypoint, ".."+string(filepath.Separator)) {
		return errors.New("contracts: runtime entrypoint must be a normalized relative path")
	}
	return nil
}

func validateSections(sections map[string]Section, layout Layout) error {
	if layout.TopLevelSections == nil {
		return errors.New("contracts: top-level layout is missing")
	}
	parents := make(map[string]string, len(sections))
	for id, section := range sections {
		if id != section.ID || !validID(id) {
			return fmt.Errorf("contracts: section key %q does not match a valid id", id)
		}
		if err := section.Validate(); err != nil {
			return fmt.Errorf("contracts: section %q: %w", id, err)
		}
		for _, childID := range section.Children {
			if _, exists := sections[childID]; !exists {
				return fmt.Errorf("contracts: section %q has missing child %q", id, childID)
			}
			if parent, exists := parents[childID]; exists {
				return fmt.Errorf("contracts: section %q has multiple parents %q and %q", childID, parent, id)
			}
			parents[childID] = id
		}
	}
	for id, top := range layout.TopLevelSections {
		if _, exists := sections[id]; !exists {
			return fmt.Errorf("contracts: top-level layout references missing section %q", id)
		}
		if _, exists := parents[id]; exists {
			return fmt.Errorf("contracts: child section %q also has top-level layout", id)
		}
		if err := top.Validate(); err != nil {
			return fmt.Errorf("contracts: top-level layout %q: %w", id, err)
		}
	}
	for id := range sections {
		_, child := parents[id]
		_, top := layout.TopLevelSections[id]
		if child == top {
			return fmt.Errorf("contracts: section %q must appear exactly once in the forest", id)
		}
	}
	visiting := make(map[string]bool, len(sections))
	visited := make(map[string]bool, len(sections))
	var visit func(string) error
	visit = func(id string) error {
		if visiting[id] {
			return fmt.Errorf("contracts: section forest contains a cycle at %q", id)
		}
		if visited[id] {
			return nil
		}
		visiting[id] = true
		for _, child := range sections[id].Children {
			if err := visit(child); err != nil {
				return err
			}
		}
		delete(visiting, id)
		visited[id] = true
		return nil
	}
	for id := range layout.TopLevelSections {
		if err := visit(id); err != nil {
			return err
		}
	}
	for id := range sections {
		if !visited[id] {
			if err := visit(id); err != nil {
				return err
			}
		}
	}
	if layout.Viewport != nil {
		if !finite(layout.Viewport.X) || !finite(layout.Viewport.Y) || !finite(layout.Viewport.Zoom) || layout.Viewport.Zoom <= 0 {
			return errors.New("contracts: viewport is invalid")
		}
	}
	return nil
}

func (section Section) Validate() error {
	if !validID(section.ID) {
		return errors.New("section id is invalid")
	}
	if !slices.Contains([]string{"input", "output", "button", "status", "drawing"}, section.Kind) {
		return errors.New("section kind is unsupported")
	}
	if err := validateText(section.Name, true); err != nil {
		return fmt.Errorf("section name: %w", err)
	}
	if err := section.Width.Validate(); err != nil {
		return err
	}
	if err := section.Height.Validate(); err != nil {
		return err
	}
	if section.Children == nil || len(section.Children) > maximumChildren {
		return errors.New("section children are missing or exceed the limit")
	}
	seen := make(map[string]struct{}, len(section.Children))
	for _, child := range section.Children {
		if !validID(child) {
			return errors.New("section child id is invalid")
		}
		if _, exists := seen[child]; exists {
			return errors.New("section child id is duplicated")
		}
		seen[child] = struct{}{}
	}
	for _, color := range []*string{section.StyleColor, section.TagColor} {
		if color != nil && !regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`).MatchString(*color) {
			return errors.New("section color is invalid")
		}
	}
	return validateSectionData(section.Kind, section.Data)
}

func (value SizeValue) Validate() error {
	if value.Auto {
		if value.Value != 0 {
			return ErrInvalidSize
		}
		return nil
	}
	if !finite(value.Value) || value.Value <= 0 {
		return ErrInvalidSize
	}
	return nil
}

func (layout TopLevelSectionLayout) Validate() error {
	if !finite(layout.X) || !finite(layout.Y) {
		return errors.New("position is invalid")
	}
	for _, dimension := range []*float64{layout.Width, layout.Height} {
		if dimension != nil && (!finite(*dimension) || *dimension <= 0) {
			return errors.New("dimension is invalid")
		}
	}
	return nil
}

func (binding Binding) Validate(sections map[string]Section) error {
	if !validID(binding.ID) {
		return errors.New("binding id is invalid")
	}
	source, exists := sections[binding.Trigger.SectionID]
	if !exists {
		return errors.New("binding source section is missing")
	}
	if !validEvent(source.Kind, binding.Trigger.Event) {
		return errors.New("binding source event is unsupported")
	}
	if !handlerPattern.MatchString(binding.Handler) {
		return errors.New("binding handler is invalid")
	}
	if binding.Arguments == nil || len(binding.Arguments) > maximumArguments {
		return errors.New("binding arguments are missing or exceed the limit")
	}
	for name, value := range binding.Arguments {
		if !handlerPattern.MatchString(name) {
			return fmt.Errorf("argument name %q is invalid", name)
		}
		if err := validateJSON(value); err != nil {
			return fmt.Errorf("argument %q: %w", name, err)
		}
		if err := validateReference(value, sections); err != nil {
			return fmt.Errorf("argument %q: %w", name, err)
		}
	}
	if err := binding.Scheduling.Validate(); err != nil {
		return err
	}
	if binding.Outputs == nil || len(binding.Outputs) > maximumOutputs {
		return errors.New("binding outputs are missing or exceed the limit")
	}
	for name, output := range binding.Outputs {
		if !handlerPattern.MatchString(name) {
			return fmt.Errorf("output name %q is invalid", name)
		}
		target, exists := sections[output.SectionID]
		if !exists {
			return fmt.Errorf("output %q target is missing", name)
		}
		if !validOutputField(target.Kind, output.Field) {
			return fmt.Errorf("output %q field is unsupported", name)
		}
	}
	return nil
}

func (policy SchedulingPolicy) Validate() error {
	if !slices.Contains([]string{"once", "latest", "parallel"}, policy.Mode) {
		return errors.New("scheduling mode is unsupported")
	}
	if !validID(policy.ConcurrencyGroup) {
		return errors.New("scheduling concurrency group is invalid")
	}
	if policy.ConcurrencyLimit < 1 || policy.ConcurrencyLimit > 64 {
		return errors.New("scheduling concurrency limit is invalid")
	}
	if policy.DebounceMilliseconds > 60_000 {
		return errors.New("scheduling debounce exceeds the limit")
	}
	return nil
}

func validateSectionData(kind string, data json.RawMessage) error {
	switch kind {
	case "input":
		var value InputSectionData
		if err := DecodeStrict(data, &value); err != nil {
			return fmt.Errorf("input data: %w", err)
		}
		if !slices.Contains([]string{"text", "number", "boolean"}, value.InputKind) {
			return errors.New("input data kind is unsupported")
		}
		if err := validateText(value.Label, false); err != nil {
			return fmt.Errorf("input label: %w", err)
		}
		return validateJSON(value.Value)
	case "button":
		var value ButtonSectionData
		if err := DecodeStrict(data, &value); err != nil {
			return fmt.Errorf("button data: %w", err)
		}
		return validateText(value.Label, true)
	case "output":
		var value OutputSectionData
		if err := DecodeStrict(data, &value); err != nil {
			return fmt.Errorf("output data: %w", err)
		}
		return validateJSON(value.Value)
	case "status":
		var value StatusSectionData
		if err := DecodeStrict(data, &value); err != nil {
			return fmt.Errorf("status data: %w", err)
		}
		if !slices.Contains([]string{"idle", "info", "success", "error"}, value.Level) {
			return errors.New("status level is unsupported")
		}
		return validateText(value.Message, false)
	case "drawing":
		var value DrawingSectionData
		if err := DecodeStrict(data, &value); err != nil {
			return fmt.Errorf("drawing data: %w", err)
		}
		if value.Width < 1 || value.Width > 8192 || value.Height < 1 || value.Height > 8192 {
			return errors.New("drawing dimensions are invalid")
		}
		if !regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`).MatchString(value.Background) {
			return errors.New("drawing background is invalid")
		}
		return validateJSON(value.Scene)
	default:
		return errors.New("section kind is unsupported")
	}
}

func validateReference(value json.RawMessage, sections map[string]Section) error {
	var reference string
	if err := json.Unmarshal(value, &reference); err != nil || !strings.HasPrefix(reference, "$") {
		return nil
	}
	if strings.HasPrefix(reference, "$event.") && len(strings.TrimPrefix(reference, "$event.")) > 0 {
		return nil
	}
	if strings.HasPrefix(reference, "$sections.") {
		parts := strings.Split(reference, ".")
		if len(parts) >= 3 {
			if _, exists := sections[parts[1]]; exists && parts[2] != "" {
				return nil
			}
		}
	}
	return errors.New("argument reference is invalid")
}

func validEvent(kind string, event string) bool {
	switch kind {
	case "input":
		return event == "change" || event == "submit"
	case "button":
		return event == "press"
	case "drawing":
		return event == "snapshot"
	default:
		return false
	}
}

func validOutputField(kind string, field string) bool {
	switch kind {
	case "output":
		return field == "value" || field == "contentRef"
	case "status":
		return field == "message" || field == "level" || field == "progress"
	case "drawing":
		return field == "scene" || field == "contentRef"
	default:
		return false
	}
}

func validateJSON(raw json.RawMessage) error {
	if len(raw) == 0 || len(raw) > maximumStringBytes {
		return errors.New("JSON value is missing or exceeds the byte limit")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("JSON value is invalid: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("JSON value has trailing content")
	}
	return validateJSONValue(value, 0)
}

func validateJSONValue(value any, depth int) error {
	if depth > maximumJSONDepth {
		return errors.New("JSON value exceeds the depth limit")
	}
	switch typed := value.(type) {
	case nil, bool:
		return nil
	case string:
		return validateText(typed, false)
	case json.Number:
		if _, err := typed.Int64(); err == nil {
			return nil
		}
		parsed, err := typed.Float64()
		if err != nil || !finite(parsed) {
			return errors.New("JSON number is invalid")
		}
		return nil
	case []any:
		for _, item := range typed {
			if err := validateJSONValue(item, depth+1); err != nil {
				return err
			}
		}
		return nil
	case map[string]any:
		for key, item := range typed {
			if err := validateText(key, false); err != nil {
				return err
			}
			if err := validateJSONValue(item, depth+1); err != nil {
				return err
			}
		}
		return nil
	default:
		return errors.New("JSON value has an unsupported type")
	}
}

func (reference ContentReference) Validate() error {
	if !validID(reference.ID) || !validID(reference.InvocationID) {
		return errors.New("content reference identity is invalid")
	}
	if strings.TrimSpace(reference.MediaType) == "" || reference.MediaType != strings.TrimSpace(reference.MediaType) || strings.ContainsAny(reference.MediaType, "\r\n") {
		return errors.New("content reference media type is invalid")
	}
	if reference.ByteLength < 0 || reference.ByteLength > 256<<20 {
		return errors.New("content reference byte length is invalid")
	}
	digest, err := hex.DecodeString(reference.SHA256)
	if err != nil || len(digest) != 32 || reference.SHA256 != strings.ToLower(reference.SHA256) {
		return errors.New("content reference digest is invalid")
	}
	return nil
}

func (event RuntimeEvent) Validate() error {
	if event.Type != "event" || !validID(event.SessionID) || !validID(event.SectionID) {
		return errors.New("contracts: runtime event identity is invalid")
	}
	if !slices.Contains([]string{"change", "submit", "press", "snapshot"}, event.Event) {
		return errors.New("contracts: runtime event name is invalid")
	}
	return validateJSON(event.Payload)
}

func (request RuntimeCancelRequest) Validate() error {
	if request.Type != "cancel" {
		return errors.New("contracts: runtime cancellation type is invalid")
	}
	return validateInvocationIdentity(request.Identity)
}

func validateInvocationIdentity(identity InvocationIdentity) error {
	if !validID(identity.SessionID) || !validID(identity.BindingID) || !validID(identity.InvocationID) || identity.Sequence == 0 {
		return errors.New("contracts: invocation identity is invalid")
	}
	return nil
}

func (request DirectInvokeRequest) Validate() error {
	if request.Arguments == nil || request.Content == nil || len(request.Arguments) > maximumArguments || len(request.Content) > maximumArguments {
		return errors.New("contracts: direct invocation collections are missing or exceed the limit")
	}
	for name, value := range request.Arguments {
		if !handlerPattern.MatchString(name) {
			return errors.New("contracts: direct invocation argument name is invalid")
		}
		if err := validateJSON(value); err != nil {
			return err
		}
	}
	for _, reference := range request.Content {
		if err := reference.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func validID(value string) bool {
	return idPattern.MatchString(value)
}

func validateText(value string, required bool) error {
	if !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') || len(value) > maximumStringBytes {
		return errors.New("text is invalid")
	}
	if required && (strings.TrimSpace(value) == "" || value != strings.TrimSpace(value)) {
		return errors.New("text is required without surrounding whitespace")
	}
	return nil
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
