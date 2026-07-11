package main

import (
	"errors"
	"fmt"
	"strings"
)

func validateSpeechContract(document *openAPIDocument, operations []operationContract, speech supportedSpeech) (int, error) {
	operation, err := operationNamed(operations, "createSpeech")
	if err != nil {
		return 0, err
	}
	request, err := componentSchema(document, operation.RequestSchema)
	if err != nil {
		return 0, err
	}
	if !containsAll(request.Required, "model", "input", "voice") {
		return 0, errors.New("OpenAI CreateSpeechRequest must require model, input, and voice")
	}
	if !schemaPropertyDocumentsValue(document, request, speech.Model, "model") {
		return 0, fmt.Errorf("OpenAI CreateSpeechRequest does not document model %q", speech.Model)
	}
	if !schemaPropertyDocumentsValue(document, request, speech.Voice, "voice") {
		return 0, fmt.Errorf("OpenAI CreateSpeechRequest does not document voice %q", speech.Voice)
	}
	if len(speech.Voices) == 0 {
		return 0, errors.New("OpenAI speech voice catalog must not be empty")
	}
	seenVoices := map[string]bool{}
	for _, voice := range speech.Voices {
		if strings.TrimSpace(voice) == "" || strings.TrimSpace(voice) != voice {
			return 0, fmt.Errorf("OpenAI speech voice catalog contains invalid id %q", voice)
		}
		if seenVoices[voice] {
			return 0, fmt.Errorf("OpenAI speech voice catalog duplicates %q", voice)
		}
		seenVoices[voice] = true
	}
	if !seenVoices[speech.Voice] {
		return 0, fmt.Errorf("OpenAI default speech voice %q is absent from the catalog", speech.Voice)
	}
	if !schemaPropertyDocumentsValue(document, request, speech.ResponseFormat, "response_format") {
		return 0, fmt.Errorf("OpenAI CreateSpeechRequest does not support response format %q", speech.ResponseFormat)
	}
	return positiveSchemaMaxLength(document, request, "input")
}

func validateTranscriptionContract(document *openAPIDocument, operations []operationContract, transcription supportedTranscription) error {
	if _, err := operationNamed(operations, transcription.WebRTCOperation); err != nil {
		return fmt.Errorf("OpenAI transcription WebRTC operation: %w", err)
	}
	session, err := componentSchema(document, transcription.SessionSchema)
	if err != nil {
		return err
	}
	if !containsAll(session.Required, "type") {
		return fmt.Errorf("OpenAI %s must require type", transcription.SessionSchema)
	}
	if !schemaPropertyIsConstant(document, session, "transcription", "type") {
		return fmt.Errorf("OpenAI %s type must be the constant transcription", transcription.SessionSchema)
	}
	transcriptionConfig, err := schemaProperty(document, session, "audio", "input", "transcription")
	if err != nil {
		return fmt.Errorf("OpenAI %s audio transcription: %w", transcription.SessionSchema, err)
	}
	if !schemaPropertyDocumentsValue(document, transcriptionConfig, transcription.Model, "model") {
		return fmt.Errorf("OpenAI transcription schema does not document model %q", transcription.Model)
	}
	if !schemaPropertyDocumentsValue(document, transcriptionConfig, transcription.Delay, "delay") {
		return fmt.Errorf("OpenAI transcription schema does not support delay %q", transcription.Delay)
	}
	if !schemaPropertyAcceptsNull(document, session, "audio", "input", "turn_detection") {
		return errors.New("OpenAI transcription turn_detection schema does not accept null")
	}
	return validateClientSecretContract(document, operations, transcription)
}

func validateClientSecretContract(document *openAPIDocument, operations []operationContract, transcription supportedTranscription) error {
	operation, err := operationNamed(operations, "createRealtimeClientSecret")
	if err != nil {
		return err
	}
	request, err := componentSchema(document, operation.RequestSchema)
	if err != nil {
		return err
	}
	if !schemaPropertyReferencesComponent(document, request, transcription.SessionSchema, "session") {
		return fmt.Errorf("OpenAI client secret request does not reference %s", transcription.SessionSchema)
	}
	expiresAfter, err := schemaProperty(document, request, "expires_after")
	if err != nil {
		return fmt.Errorf("OpenAI client secret expiry: %w", err)
	}
	if !schemaPropertyDocumentsValue(document, expiresAfter, "created_at", "anchor") {
		return errors.New("OpenAI client secret expiry does not support the created_at anchor")
	}
	return validateClientSecretTTL(document, expiresAfter, transcription.ClientSecretTTLSeconds)
}

func validateClientSecretTTL(document *openAPIDocument, expiresAfter *openAPISchema, ttlSeconds int) error {
	seconds, err := schemaProperty(document, expiresAfter, "seconds")
	if err != nil || seconds.Minimum == nil || seconds.Maximum == nil {
		return errors.New("OpenAI client secret expiry has no numeric bounds")
	}
	ttl := float64(ttlSeconds)
	if ttl < *seconds.Minimum || ttl > *seconds.Maximum {
		return fmt.Errorf("OpenAI client secret TTL %d is outside documented range %.0f..%.0f", ttlSeconds, *seconds.Minimum, *seconds.Maximum)
	}
	return nil
}

func schemaPropertyDocumentsValue(document *openAPIDocument, schema *openAPISchema, expected string, path ...string) bool {
	property, err := schemaProperty(document, schema, path...)
	return err == nil && enumContains(document, property, expected)
}

func schemaPropertyIsConstant(document *openAPIDocument, schema *openAPISchema, expected string, path ...string) bool {
	property, err := schemaProperty(document, schema, path...)
	return err == nil && hasOnlyStringEnum(property, expected)
}

func schemaPropertyAcceptsNull(document *openAPIDocument, schema *openAPISchema, path ...string) bool {
	property, err := schemaProperty(document, schema, path...)
	return err == nil && schemaAcceptsNull(document, property, make(map[*openAPISchema]bool))
}

func schemaPropertyReferencesComponent(document *openAPIDocument, schema *openAPISchema, expected string, path ...string) bool {
	property, err := schemaProperty(document, schema, path...)
	return err == nil && schemaReferencesComponent(property, expected, make(map[*openAPISchema]bool))
}

func positiveSchemaMaxLength(document *openAPIDocument, schema *openAPISchema, path ...string) (int, error) {
	property, err := schemaProperty(document, schema, path...)
	if err != nil || property.MaxLength == nil || *property.MaxLength < 1 {
		return 0, errors.New("OpenAI CreateSpeechRequest input has no positive maxLength")
	}
	return *property.MaxLength, nil
}

func operationNamed(operations []operationContract, name string) (operationContract, error) {
	for _, operation := range operations {
		if operation.Name == name {
			return operation, nil
		}
	}
	return operationContract{}, fmt.Errorf("supported operation %q is missing", name)
}

func componentSchema(document *openAPIDocument, name string) (*openAPISchema, error) {
	if name == "" {
		return nil, errors.New("component schema name is empty")
	}
	schema, ok := document.Components.Schemas[name]
	if !ok {
		return nil, fmt.Errorf("OpenAPI component schema %q is missing", name)
	}
	return schema, nil
}

func schemaProperty(document *openAPIDocument, schema *openAPISchema, path ...string) (*openAPISchema, error) {
	current := schema
	for _, name := range path {
		resolved, err := resolveSchema(document, current)
		if err != nil {
			return nil, err
		}
		property, ok := resolved.Properties[name]
		if !ok {
			return nil, fmt.Errorf("schema property %s is missing", strings.Join(path, "."))
		}
		current = property
	}
	return resolveSchema(document, current)
}

func resolveSchema(document *openAPIDocument, schema *openAPISchema) (*openAPISchema, error) {
	if schema == nil {
		return nil, errors.New("schema is missing")
	}
	if schema.Ref == "" {
		return schema, nil
	}
	name, ok := strings.CutPrefix(schema.Ref, "#/components/schemas/")
	if !ok || name == "" {
		return nil, fmt.Errorf("unsupported schema reference %q", schema.Ref)
	}
	return componentSchema(document, name)
}

func enumContains(document *openAPIDocument, schema *openAPISchema, expected string) bool {
	values := make(map[string]struct{})
	collectStringEnums(document, schema, values, make(map[*openAPISchema]bool))
	_, ok := values[expected]
	return ok
}

func collectStringEnums(document *openAPIDocument, schema *openAPISchema, values map[string]struct{}, visited map[*openAPISchema]bool) {
	if schema == nil || visited[schema] {
		return
	}
	visited[schema] = true
	if schema.Ref != "" {
		resolved, err := resolveSchema(document, schema)
		if err == nil {
			collectStringEnums(document, resolved, values, visited)
		}
		return
	}
	for _, value := range schema.Enum {
		if text, ok := value.(string); ok {
			values[text] = struct{}{}
		}
	}
	for _, branch := range schemaBranches(schema) {
		collectStringEnums(document, branch, values, visited)
	}
}

func schemaAcceptsNull(document *openAPIDocument, schema *openAPISchema, visited map[*openAPISchema]bool) bool {
	if schema == nil || visited[schema] {
		return false
	}
	visited[schema] = true
	if schema.Ref != "" {
		resolved, err := resolveSchema(document, schema)
		return err == nil && schemaAcceptsNull(document, resolved, visited)
	}
	if schemaType(schema) == "null" {
		return true
	}
	for _, branch := range schemaBranches(schema) {
		if schemaAcceptsNull(document, branch, visited) {
			return true
		}
	}
	return false
}

func schemaReferencesComponent(schema *openAPISchema, expected string, visited map[*openAPISchema]bool) bool {
	if schema == nil || visited[schema] {
		return false
	}
	visited[schema] = true
	if schema.Ref == componentRef(expected) {
		return true
	}
	for _, branch := range schemaBranches(schema) {
		if schemaReferencesComponent(branch, expected, visited) {
			return true
		}
	}
	return false
}

func schemaBranches(schema *openAPISchema) []*openAPISchema {
	branches := make([]*openAPISchema, 0, len(schema.AnyOf)+len(schema.OneOf)+len(schema.AllOf))
	branches = append(branches, schema.AnyOf...)
	branches = append(branches, schema.OneOf...)
	branches = append(branches, schema.AllOf...)
	return branches
}
