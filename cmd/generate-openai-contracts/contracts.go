package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var contractNamePattern = regexp.MustCompile(`^[a-z][A-Za-z0-9]*$`)

func loadGenerationModel(schemaPath, supportedPath, upstreamPath string) (generationModel, error) {
	document, err := loadOpenAPIDocument(schemaPath)
	if err != nil {
		return generationModel{}, err
	}
	supported, err := loadSupportedContracts(supportedPath)
	if err != nil {
		return generationModel{}, err
	}
	commit, err := loadUpstreamCommit(upstreamPath)
	if err != nil {
		return generationModel{}, err
	}
	return buildGenerationModel(document, supported, commit)
}

func loadOpenAPIDocument(path string) (*openAPIDocument, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read OpenAPI snapshot: %w", err)
	}
	var document openAPIDocument
	if err := yaml.Unmarshal(content, &document); err != nil {
		return nil, fmt.Errorf("decode OpenAPI snapshot: %w", err)
	}
	return &document, nil
}

func loadSupportedContracts(path string) (supportedContracts, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return supportedContracts{}, fmt.Errorf("read supported contract registry: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	var supported supportedContracts
	if err := decoder.Decode(&supported); err != nil {
		return supportedContracts{}, fmt.Errorf("decode supported contract registry: %w", err)
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return supportedContracts{}, errors.New("supported contract registry contains trailing JSON")
	}
	return supported, nil
}

func loadUpstreamCommit(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read upstream metadata: %w", err)
	}
	for _, line := range strings.Split(string(content), "\n") {
		key, value, found := strings.Cut(line, ":")
		if found && strings.TrimSpace(key) == "commit" {
			commit := strings.TrimSpace(value)
			if matched, _ := regexp.MatchString(`^[0-9a-f]{40}$`, commit); !matched {
				return "", fmt.Errorf("upstream commit must be a 40-character lowercase Git SHA: %q", commit)
			}
			return commit, nil
		}
	}
	return "", errors.New("upstream metadata has no commit")
}

func buildGenerationModel(document *openAPIDocument, supported supportedContracts, commit string) (generationModel, error) {
	if !strings.HasPrefix(document.OpenAPI, "3.1.") {
		return generationModel{}, fmt.Errorf("OpenAPI version = %q, want 3.1.x", document.OpenAPI)
	}
	if len(document.Servers) != 1 || document.Servers[0].URL == "" {
		return generationModel{}, errors.New("OpenAPI snapshot must declare exactly one API server")
	}
	operations, err := validateOperations(document, supported.Operations)
	if err != nil {
		return generationModel{}, err
	}
	clientEvents, err := validateRealtimeClientEvents(document, supported.RealtimeClientEvents)
	if err != nil {
		return generationModel{}, err
	}
	events, err := validateRealtimeEvents(document, supported.RealtimeServerEvents)
	if err != nil {
		return generationModel{}, err
	}
	maximumSynthesisCharacters, err := validateSpeechContract(document, operations, supported.Speech)
	if err != nil {
		return generationModel{}, err
	}
	if err := validateTranscriptionContract(document, operations, supported.Transcription); err != nil {
		return generationModel{}, err
	}
	return generationModel{
		APIVersion:                 document.Info.Version,
		ClientEvents:               clientEvents,
		Events:                     events,
		MaximumSynthesisCharacters: maximumSynthesisCharacters,
		Operations:                 operations,
		ServerURL:                  document.Servers[0].URL,
		SourceCommit:               commit,
		Speech:                     supported.Speech,
		Transcription:              supported.Transcription,
	}, nil
}

func validateOperations(document *openAPIDocument, supported []supportedOperation) ([]operationContract, error) {
	if len(supported) == 0 {
		return nil, errors.New("supported contract registry has no operations")
	}
	seenNames := make(map[string]struct{}, len(supported))
	operations := make([]operationContract, 0, len(supported))
	for _, candidate := range supported {
		if err := validateContractName(candidate.Name, "operation"); err != nil {
			return nil, err
		}
		if _, duplicate := seenNames[candidate.Name]; duplicate {
			return nil, fmt.Errorf("duplicate supported operation name %q", candidate.Name)
		}
		seenNames[candidate.Name] = struct{}{}
		operation, err := validateOperation(document, candidate)
		if err != nil {
			return nil, err
		}
		operations = append(operations, operation)
	}
	return operations, nil
}

func validateOperation(document *openAPIDocument, supported supportedOperation) (operationContract, error) {
	if supported.Method != "post" {
		return operationContract{}, fmt.Errorf("supported operation %s method = %q, only post is supported", supported.Name, supported.Method)
	}
	operation, err := selectedPostOperation(document, supported)
	if err != nil {
		return operationContract{}, err
	}
	if err := validateOperationRequest(operation, supported); err != nil {
		return operationContract{}, err
	}
	if err := validateOperationResponse(operation, supported); err != nil {
		return operationContract{}, err
	}
	return operationContract(supported), nil
}

func selectedPostOperation(document *openAPIDocument, supported supportedOperation) (*openAPIOperation, error) {
	path, ok := document.Paths[supported.Path]
	if !ok || path.Post == nil {
		return nil, fmt.Errorf("OpenAPI operation %s is missing POST %s", supported.Name, supported.Path)
	}
	operation := path.Post
	if operation.OperationID != supported.OperationID {
		return nil, fmt.Errorf("OpenAPI POST %s operationId = %q, want %q", supported.Path, operation.OperationID, supported.OperationID)
	}
	return operation, nil
}

func validateOperationRequest(operation *openAPIOperation, supported supportedOperation) error {
	requestMedia, ok := mediaType(operation.RequestBody, supported.RequestMediaType)
	if !ok || requestMedia.Schema == nil {
		return fmt.Errorf("OpenAPI POST %s is missing request media type %s", supported.Path, supported.RequestMediaType)
	}
	if supported.RequestSchema != "" && requestMedia.Schema.Ref != componentRef(supported.RequestSchema) {
		return fmt.Errorf("OpenAPI POST %s request schema = %q, want %q", supported.Path, requestMedia.Schema.Ref, componentRef(supported.RequestSchema))
	}
	return nil
}

func validateOperationResponse(operation *openAPIOperation, supported supportedOperation) error {
	response, ok := operation.Responses[supported.SuccessStatus]
	if !ok {
		return fmt.Errorf("OpenAPI POST %s is missing response status %s", supported.Path, supported.SuccessStatus)
	}
	if _, ok := response.Content[supported.ResponseMediaType]; !ok {
		return fmt.Errorf("OpenAPI POST %s response %s is missing media type %s", supported.Path, supported.SuccessStatus, supported.ResponseMediaType)
	}
	if err := validateWireResponseMediaTypes(supported); err != nil {
		return err
	}
	return nil
}

func validateWireResponseMediaTypes(operation supportedOperation) error {
	if len(operation.WireResponseMediaTypes) == 0 {
		return fmt.Errorf("supported operation %s has no wire response media types", operation.Name)
	}
	seen := make(map[string]struct{}, len(operation.WireResponseMediaTypes))
	includesOpenAPIType := false
	for _, candidate := range operation.WireResponseMediaTypes {
		mediaType, parameters, err := mime.ParseMediaType(candidate)
		if err != nil || mediaType != candidate || len(parameters) != 0 {
			return fmt.Errorf("supported operation %s has invalid wire response media type %q", operation.Name, candidate)
		}
		if _, duplicate := seen[candidate]; duplicate {
			return fmt.Errorf("supported operation %s repeats wire response media type %q", operation.Name, candidate)
		}
		seen[candidate] = struct{}{}
		includesOpenAPIType = includesOpenAPIType || candidate == operation.ResponseMediaType
	}
	if !includesOpenAPIType {
		return fmt.Errorf("supported operation %s wire response media types omit OpenAPI media type %q", operation.Name, operation.ResponseMediaType)
	}
	return nil
}

func mediaType(body *openAPIRequestBody, name string) (openAPIMediaType, bool) {
	if body == nil {
		return openAPIMediaType{}, false
	}
	media, ok := body.Content[name]
	return media, ok
}

func validateRealtimeEvents(document *openAPIDocument, supported []supportedRealtimeEvent) ([]realtimeEventContract, error) {
	if len(supported) == 0 {
		return nil, errors.New("supported contract registry has no Realtime server events")
	}
	seenNames := make(map[string]struct{}, len(supported))
	seenTypes := make(map[string]struct{}, len(supported))
	events := make([]realtimeEventContract, 0, len(supported))
	for _, candidate := range supported {
		if err := validateContractName(candidate.Name, "Realtime event"); err != nil {
			return nil, err
		}
		if _, duplicate := seenNames[candidate.Name]; duplicate {
			return nil, fmt.Errorf("duplicate supported Realtime event name %q", candidate.Name)
		}
		if _, duplicate := seenTypes[candidate.Type]; duplicate {
			return nil, fmt.Errorf("duplicate supported Realtime event type %q", candidate.Type)
		}
		seenNames[candidate.Name] = struct{}{}
		seenTypes[candidate.Type] = struct{}{}
		event, err := validateRealtimeEvent(document, candidate)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func validateRealtimeClientEvents(document *openAPIDocument, supported []supportedRealtimeEvent) ([]realtimeEventContract, error) {
	if len(supported) == 0 {
		return nil, errors.New("supported contract registry has no Realtime client events")
	}
	seenNames := make(map[string]struct{}, len(supported))
	seenTypes := make(map[string]struct{}, len(supported))
	events := make([]realtimeEventContract, 0, len(supported))
	for _, candidate := range supported {
		if err := validateContractName(candidate.Name, "Realtime client event"); err != nil {
			return nil, err
		}
		if _, duplicate := seenNames[candidate.Name]; duplicate {
			return nil, fmt.Errorf("duplicate supported Realtime client event name %q", candidate.Name)
		}
		if _, duplicate := seenTypes[candidate.Type]; duplicate {
			return nil, fmt.Errorf("duplicate supported Realtime client event type %q", candidate.Type)
		}
		seenNames[candidate.Name] = struct{}{}
		seenTypes[candidate.Type] = struct{}{}
		event, err := validateRealtimeEventSchema(document, candidate, []string{"type"})
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func validateRealtimeEvent(document *openAPIDocument, supported supportedRealtimeEvent) (realtimeEventContract, error) {
	return validateRealtimeEventSchema(document, supported, []string{"event_id", "type"})
}

func validateRealtimeEventSchema(document *openAPIDocument, supported supportedRealtimeEvent, envelopeFields []string) (realtimeEventContract, error) {
	schema, ok := document.Components.Schemas[supported.Schema]
	if !ok {
		return realtimeEventContract{}, fmt.Errorf("OpenAPI Realtime event schema %q is missing", supported.Schema)
	}
	if schemaType(schema) != "object" {
		return realtimeEventContract{}, fmt.Errorf("OpenAPI Realtime event schema %s is not an object", supported.Schema)
	}
	if !containsAll(schema.Required, envelopeFields...) {
		return realtimeEventContract{}, fmt.Errorf("OpenAPI Realtime event schema %s must require %s", supported.Schema, strings.Join(envelopeFields, " and "))
	}
	typeSchema, ok := schema.Properties["type"]
	if !ok || !hasOnlyStringEnum(typeSchema, supported.Type) {
		return realtimeEventContract{}, fmt.Errorf("OpenAPI Realtime event schema %s type is not the constant %q", supported.Schema, supported.Type)
	}
	properties := make([]realtimeEventProperty, 0, len(schema.Properties))
	for name, propertySchema := range schema.Properties {
		properties = append(properties, realtimeEventProperty{Name: name, Shape: schemaShape(propertySchema)})
	}
	sort.Slice(properties, func(left, right int) bool { return properties[left].Name < properties[right].Name })
	required := append([]string(nil), schema.Required...)
	sort.Strings(required)
	for _, field := range required {
		if _, ok := schema.Properties[field]; !ok {
			return realtimeEventContract{}, fmt.Errorf("OpenAPI Realtime event schema %s requires missing property %s", supported.Schema, field)
		}
	}
	return realtimeEventContract{
		Name:       supported.Name,
		Properties: properties,
		Required:   required,
		Schema:     supported.Schema,
		Type:       supported.Type,
	}, nil
}

func validateContractName(name, context string) error {
	if !contractNamePattern.MatchString(name) {
		return fmt.Errorf("%s name must be a lower camel-case identifier: %q", context, name)
	}
	return nil
}

func schemaShape(schema *openAPISchema) string {
	if schema == nil {
		return "unknown"
	}
	if schema.Ref != "" {
		return "reference"
	}
	if len(schema.AnyOf)+len(schema.OneOf)+len(schema.AllOf) > 0 {
		return "union"
	}
	if value, ok := schema.Type.(string); ok && value != "" {
		return value
	}
	return "unknown"
}

func schemaType(schema *openAPISchema) string {
	if schema == nil {
		return ""
	}
	value, _ := schema.Type.(string)
	return value
}

func hasOnlyStringEnum(schema *openAPISchema, expected string) bool {
	return schemaType(schema) == "string" && len(schema.Enum) == 1 && schema.Enum[0] == expected
}

func containsAll(values []string, required ...string) bool {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	for _, value := range required {
		if _, ok := set[value]; !ok {
			return false
		}
	}
	return true
}

func componentRef(name string) string {
	return "#/components/schemas/" + name
}
