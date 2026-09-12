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
	if !utf8.Valid(data) {
		return errors.New("contracts: JSON is not valid UTF-8")
	}
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
		return consumeUniqueJSONObject(decoder)
	case '[':
		return consumeUniqueJSONArray(decoder)
	default:
		return errors.New("contracts: JSON compound value is invalid")
	}
}

func consumeUniqueJSONObject(decoder *json.Decoder) error {
	fields := make(map[string]struct{})
	for decoder.More() {
		name, err := consumeUniqueJSONField(decoder, fields)
		if err != nil {
			return err
		}
		fields[name] = struct{}{}
		if err := consumeUniqueJSONValue(decoder); err != nil {
			return err
		}
	}
	return consumeJSONClosingDelimiter(decoder, '}', "contracts: JSON object is not closed")
}

func consumeUniqueJSONField(decoder *json.Decoder, fields map[string]struct{}) (string, error) {
	nameToken, err := decoder.Token()
	if err != nil {
		return "", err
	}
	name, ok := nameToken.(string)
	if !ok {
		return "", errors.New("contracts: JSON object field name is invalid")
	}
	if _, exists := fields[name]; exists {
		return "", fmt.Errorf("contracts: JSON object repeats field %q", name)
	}
	return name, nil
}

func consumeUniqueJSONArray(decoder *json.Decoder) error {
	for decoder.More() {
		if err := consumeUniqueJSONValue(decoder); err != nil {
			return err
		}
	}
	return consumeJSONClosingDelimiter(decoder, ']', "contracts: JSON array is not closed")
}

func consumeJSONClosingDelimiter(decoder *json.Decoder, expected byte, message string) error {
	closing, err := decoder.Token()
	if err != nil {
		return err
	}
	if closing != json.Delim(expected) {
		return errors.New(message)
	}
	return nil
}

func (project Project) Validate() error {
	if err := project.validateIdentity(); err != nil {
		return err
	}
	if err := project.validateCollections(); err != nil {
		return err
	}
	if err := validateConfiguration(project.Configuration); err != nil {
		return err
	}
	if err := validateSections(project.Sections, project.Layout); err != nil {
		return err
	}
	_, err := CompilePipeline(project)
	return err
}

func (project Project) validateIdentity() error {
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
	return nil
}

func (project Project) validateCollections() error {
	if project.Sections == nil || len(project.Sections) > maximumSections {
		return errors.New("contracts: sections are missing or exceed the limit")
	}
	if project.Bindings == nil || len(project.Bindings) > maximumBindings {
		return errors.New("contracts: bindings are missing or exceed the limit")
	}
	if project.Configuration == nil || len(project.Configuration) > maximumConfiguration {
		return errors.New("contracts: configuration is missing or exceeds the limit")
	}
	return nil
}

func validateConfiguration(configuration map[string]json.RawMessage) error {
	for key, value := range configuration {
		if !validID(key) {
			return fmt.Errorf("contracts: configuration key %q is invalid", key)
		}
		if err := validateJSON(value); err != nil {
			return fmt.Errorf("contracts: configuration %q: %w", key, err)
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
	parents, err := validateSectionParents(sections)
	if err != nil {
		return err
	}
	if err := validateTopLevelSections(sections, parents, layout.TopLevelSections); err != nil {
		return err
	}
	if err := validateForestMembership(sections, parents, layout.TopLevelSections); err != nil {
		return err
	}
	codeSections := 0
	for _, section := range sections {
		if section.Kind == "code" {
			codeSections++
		}
	}
	if codeSections > 1 {
		return errors.New("contracts: project has multiple entrypoint code sections")
	}
	if err := validateSectionCycles(sections, layout.TopLevelSections); err != nil {
		return err
	}
	return validateViewport(layout.Viewport)
}

func validateSectionParents(sections map[string]Section) (map[string]string, error) {
	parents := make(map[string]string, len(sections))
	for id, section := range sections {
		if id != section.ID || !validID(id) {
			return nil, fmt.Errorf("contracts: section key %q does not match a valid id", id)
		}
		if err := section.Validate(); err != nil {
			return nil, fmt.Errorf("contracts: section %q: %w", id, err)
		}
		for _, childID := range section.Children {
			if _, exists := sections[childID]; !exists {
				return nil, fmt.Errorf("contracts: section %q has missing child %q", id, childID)
			}
			if parent, exists := parents[childID]; exists {
				return nil, fmt.Errorf("contracts: section %q has multiple parents %q and %q", childID, parent, id)
			}
			parents[childID] = id
		}
	}
	return parents, nil
}

func validateTopLevelSections(sections map[string]Section, parents map[string]string, topLevel map[string]TopLevelSectionLayout) error {
	for id, top := range topLevel {
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
	return nil
}

func validateForestMembership(sections map[string]Section, parents map[string]string, topLevel map[string]TopLevelSectionLayout) error {
	for id := range sections {
		_, child := parents[id]
		_, top := topLevel[id]
		if child == top {
			return fmt.Errorf("contracts: section %q must appear exactly once in the forest", id)
		}
	}
	return nil
}

func validateSectionCycles(sections map[string]Section, topLevel map[string]TopLevelSectionLayout) error {
	visiting := make(map[string]bool, len(sections))
	visited := make(map[string]bool, len(sections))
	for id := range topLevel {
		if err := visitSection(id, sections, visiting, visited); err != nil {
			return err
		}
	}
	for id := range sections {
		if !visited[id] {
			if err := visitSection(id, sections, visiting, visited); err != nil {
				return err
			}
		}
	}
	return nil
}

func visitSection(id string, sections map[string]Section, visiting map[string]bool, visited map[string]bool) error {
	if visiting[id] {
		return fmt.Errorf("contracts: section forest contains a cycle at %q", id)
	}
	if visited[id] {
		return nil
	}
	visiting[id] = true
	for _, child := range sections[id].Children {
		if err := visitSection(child, sections, visiting, visited); err != nil {
			return err
		}
	}
	delete(visiting, id)
	visited[id] = true
	return nil
}

func validateViewport(viewport *Viewport) error {
	if viewport != nil && (!finite(viewport.X) || !finite(viewport.Y) || !finite(viewport.Zoom) || viewport.Zoom <= 0) {
		return errors.New("contracts: viewport is invalid")
	}
	return nil
}

func (section Section) Validate() error {
	if err := section.validateIdentityAndSize(); err != nil {
		return err
	}
	if err := validateSectionChildren(section.Children); err != nil {
		return err
	}
	if err := validateSectionColors(section.StyleColor, section.TagColor); err != nil {
		return err
	}
	return validateSectionData(section.Kind, section.Data)
}

func (section Section) validateIdentityAndSize() error {
	if !validID(section.ID) {
		return errors.New("section id is invalid")
	}
	if !slices.Contains([]string{"input", "output", "button", "status", "drawing", "code", "handler"}, section.Kind) {
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
	return nil
}

func validateSectionChildren(children []string) error {
	if children == nil || len(children) > maximumChildren {
		return errors.New("section children are missing or exceed the limit")
	}
	seen := make(map[string]struct{}, len(children))
	for _, child := range children {
		if !validID(child) {
			return errors.New("section child id is invalid")
		}
		if _, exists := seen[child]; exists {
			return errors.New("section child id is duplicated")
		}
		seen[child] = struct{}{}
	}
	return nil
}

func validateSectionColors(colors ...*string) error {
	for _, color := range colors {
		if color != nil && !regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`).MatchString(*color) {
			return errors.New("section color is invalid")
		}
	}
	return nil
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
	if err := binding.validateIdentity(sections); err != nil {
		return err
	}
	if err := validateBindingArguments(binding.Arguments, sections); err != nil {
		return err
	}
	if err := binding.Scheduling.Validate(); err != nil {
		return err
	}
	if binding.Materialization != nil {
		if err := binding.Materialization.Validate(); err != nil {
			return err
		}
	}
	return validateBindingOutputs(binding.Outputs, sections)
}

func (policy MaterializationPolicy) Validate() error {
	if !slices.Contains([]string{"session", "lastSuccessful"}, policy.Retention) {
		return errors.New("binding materialization retention is invalid")
	}
	if !slices.Contains([]string{"always", "whenStale", "ifMissing", "manual"}, policy.Startup) {
		return errors.New("binding materialization startup is invalid")
	}
	return nil
}

func (binding Binding) validateIdentity(sections map[string]Section) error {
	if !validID(binding.ID) {
		return errors.New("binding id is invalid")
	}
	if !handlerPattern.MatchString(binding.Handler) {
		return errors.New("binding handler is invalid")
	}
	return binding.validateTrigger(sections)
}

func (binding Binding) validateTrigger(sections map[string]Section) error {
	trigger := binding.Trigger
	switch trigger.Kind {
	case "event":
		if trigger.Mode != "" || trigger.Inputs != nil {
			return errors.New("event binding trigger has join fields")
		}
		source, exists := sections[trigger.SectionID]
		if !exists {
			return errors.New("binding source section is missing")
		}
		if !validEvent(source.Kind, trigger.Event) {
			return errors.New("binding source event is unsupported")
		}
	case "join":
		if trigger.SectionID != "" || trigger.Event != "" {
			return errors.New("join binding trigger has event fields")
		}
		if trigger.Mode != "all" {
			return errors.New("binding join mode is unsupported")
		}
		if len(trigger.Inputs) == 0 || len(trigger.Inputs) > maximumArguments {
			return errors.New("binding join inputs are missing or exceed the limit")
		}
		for name, input := range trigger.Inputs {
			if !handlerPattern.MatchString(name) {
				return fmt.Errorf("binding join input name %q is invalid", name)
			}
			if _, exists := binding.Arguments[name]; exists {
				return fmt.Errorf("binding join input %q collides with an argument", name)
			}
			if !validID(input.BindingID) || !handlerPattern.MatchString(input.Output) {
				return fmt.Errorf("binding join input %q reference is invalid", name)
			}
		}
	case "disconnected":
		if trigger.SectionID != "" || trigger.Event != "" || trigger.Mode != "" || trigger.Inputs != nil {
			return errors.New("disconnected binding trigger has connected fields")
		}
	default:
		return errors.New("binding trigger kind is unsupported")
	}
	return nil
}

func validateBindingArguments(arguments map[string]json.RawMessage, sections map[string]Section) error {
	if arguments == nil || len(arguments) > maximumArguments {
		return errors.New("binding arguments are missing or exceed the limit")
	}
	for name, value := range arguments {
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
	return nil
}

func validateBindingOutputs(outputs map[string]BindingOutput, sections map[string]Section) error {
	if outputs == nil || len(outputs) > maximumOutputs {
		return errors.New("binding outputs are missing or exceed the limit")
	}
	for name, output := range outputs {
		if !handlerPattern.MatchString(name) {
			return fmt.Errorf("output name %q is invalid", name)
		}
		if output.Target == nil {
			continue
		}
		target, exists := sections[output.Target.SectionID]
		if !exists {
			return fmt.Errorf("output %q target is missing", name)
		}
		if !validOutputField(target.Kind, output.Target.Field) {
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
		return validateInputSectionData(data)
	case "button":
		return validateButtonSectionData(data)
	case "output":
		return validateOutputSectionData(data)
	case "status":
		return validateStatusSectionData(data)
	case "drawing":
		return validateDrawingSectionData(data)
	case "code":
		return validateCodeSectionData(data)
	case "handler":
		return validateHandlerSectionData(data)
	default:
		return errors.New("section kind is unsupported")
	}
}

func validateInputSectionData(data json.RawMessage) error {
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
}

func validateButtonSectionData(data json.RawMessage) error {
	var value ButtonSectionData
	if err := DecodeStrict(data, &value); err != nil {
		return fmt.Errorf("button data: %w", err)
	}
	return validateText(value.Label, true)
}

func validateOutputSectionData(data json.RawMessage) error {
	var value OutputSectionData
	if err := DecodeStrict(data, &value); err != nil {
		return fmt.Errorf("output data: %w", err)
	}
	return validateJSON(value.Value)
}

func validateStatusSectionData(data json.RawMessage) error {
	var value StatusSectionData
	if err := DecodeStrict(data, &value); err != nil {
		return fmt.Errorf("status data: %w", err)
	}
	if !slices.Contains([]string{"idle", "info", "success", "error"}, value.Level) {
		return errors.New("status level is unsupported")
	}
	return validateText(value.Message, false)
}

func validateDrawingSectionData(data json.RawMessage) error {
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
}

func validateCodeSectionData(data json.RawMessage) error {
	var value CodeSectionData
	if err := DecodeStrict(data, &value); err != nil {
		return fmt.Errorf("code data: %w", err)
	}
	if value.Source != "entrypoint" {
		return errors.New("code data source is unsupported")
	}
	return nil
}

func validateHandlerSectionData(data json.RawMessage) error {
	var value HandlerSectionData
	if err := DecodeStrict(data, &value); err != nil {
		return fmt.Errorf("handler data: %w", err)
	}
	if !validID(value.BindingID) {
		return errors.New("handler data binding id is invalid")
	}
	return nil
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
		return validateJSONNumber(typed)
	case []any:
		return validateJSONArray(typed, depth)
	case map[string]any:
		return validateJSONObject(typed, depth)
	default:
		return errors.New("JSON value has an unsupported type")
	}
}

func validateJSONNumber(value json.Number) error {
	if _, err := value.Int64(); err == nil {
		return nil
	}
	parsed, err := value.Float64()
	if err != nil || !finite(parsed) {
		return errors.New("JSON number is invalid")
	}
	return nil
}

func validateJSONArray(value []any, depth int) error {
	for _, item := range value {
		if err := validateJSONValue(item, depth+1); err != nil {
			return err
		}
	}
	return nil
}

func validateJSONObject(value map[string]any, depth int) error {
	for key, item := range value {
		if err := validateText(key, false); err != nil {
			return err
		}
		if err := validateJSONValue(item, depth+1); err != nil {
			return err
		}
	}
	return nil
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
	if !slices.Contains([]string{"interaction", "startup"}, event.Cause) {
		return errors.New("contracts: runtime event cause is invalid")
	}
	if !slices.Contains([]string{"change", "submit", "press", "snapshot"}, event.Event) {
		return errors.New("contracts: runtime event name is invalid")
	}
	if event.Cause == "startup" && !slices.Contains([]string{"change", "snapshot"}, event.Event) {
		return errors.New("contracts: startup runtime event name is invalid")
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
	if !validID(identity.SessionID) || !validID(identity.RunID) || !validID(identity.BindingID) || !validID(identity.InvocationID) || identity.Sequence == 0 {
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

func (document RuntimeSourceDocument) Validate() error {
	if !validID(document.ProjectID) {
		return errors.New("contracts: entrypoint source project id is invalid")
	}
	if err := (RuntimeDeclaration{Kind: "python", Entrypoint: document.Entrypoint}).Validate(); err != nil {
		return err
	}
	if !validSourceVersion(document.Version) {
		return errors.New("contracts: entrypoint source version is invalid")
	}
	if err := validateText(document.Source, false); err != nil {
		return fmt.Errorf("contracts: entrypoint source: %w", err)
	}
	return nil
}

func (request ApplyRuntimeSourceRequest) Validate() error {
	document := RuntimeSourceDocument{
		ProjectID: request.ProjectID, Entrypoint: request.Entrypoint,
		Version: request.ExpectedVersion, Source: request.Source,
	}
	return document.Validate()
}

func (result ApplyRuntimeSourceResult) Validate() error {
	if err := result.Source.Validate(); err != nil {
		return err
	}
	switch result.Activation.State {
	case "activated":
		if result.Activation.Error != nil {
			return errors.New("contracts: activated entrypoint source has an error")
		}
	case "rejected":
		if result.Activation.Error == nil || !handlerPattern.MatchString(result.Activation.Error.Code) || validateText(result.Activation.Error.Message, true) != nil {
			return errors.New("contracts: rejected entrypoint source error is invalid")
		}
	default:
		return errors.New("contracts: entrypoint source activation is invalid")
	}
	return nil
}

func validSourceVersion(value string) bool {
	digest, err := hex.DecodeString(value)
	return err == nil && len(digest) == 32 && value == strings.ToLower(value)
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
