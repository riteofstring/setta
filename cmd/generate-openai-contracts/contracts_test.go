package main

import (
	"strings"
	"testing"
)

func TestBuildGenerationModelExtractsSupportedOpenAIContracts(t *testing.T) {
	document, supported := validContractFixture()

	model, err := buildGenerationModel(document, supported, strings.Repeat("a", 40))
	if err != nil {
		t.Fatalf("build generation model: %v", err)
	}
	if model.ServerURL != "https://api.openai.test/v1" || model.MaximumSynthesisCharacters != 4096 {
		t.Fatalf("generated model metadata = %+v", model)
	}
	if len(model.Operations) != 3 || len(model.ClientEvents) != 1 || len(model.Events) != len(supported.RealtimeServerEvents) {
		t.Fatalf("generated contract counts = operations %d, client events %d, server events %d", len(model.Operations), len(model.ClientEvents), len(model.Events))
	}
	completed := eventNamed(t, model.Events, "transcriptionCompleted")
	if !containsAll(completed.Required, "usage", "transcript", "content_index") {
		t.Fatalf("completed required fields = %v", completed.Required)
	}
}

func TestBuildGenerationModelRejectsSelectedContractDrift(t *testing.T) {
	tests := []struct {
		mutate func(*openAPIDocument)
		name   string
		want   string
	}{
		{
			name: "event discriminator",
			mutate: func(document *openAPIDocument) {
				document.Components.Schemas["RealtimeServerEventSessionCreated"].Properties["type"].Enum = []any{"session.started"}
			},
			want: "type is not the constant",
		},
		{
			name: "speech response format",
			mutate: func(document *openAPIDocument) {
				document.Components.Schemas["CreateSpeechRequest"].Properties["response_format"].Enum = []any{"wav"}
			},
			want: "does not support response format",
		},
		{
			name: "realtime response media type",
			mutate: func(document *openAPIDocument) {
				delete(document.Paths["/realtime/calls"].Post.Responses["201"].Content, "application/sdp")
			},
			want: "missing media type application/sdp",
		},
		{
			name: "manual turn boundary",
			mutate: func(document *openAPIDocument) {
				document.Components.Schemas["RealtimeTurnDetection"].AnyOf = nil
			},
			want: "does not accept null",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document, supported := validContractFixture()
			test.mutate(document)
			_, err := buildGenerationModel(document, supported, strings.Repeat("a", 40))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func TestBuildGenerationModelRejectsWireMediaTypesWithoutOpenAPIMediaType(t *testing.T) {
	document, supported := validContractFixture()
	supported.Operations[1].WireResponseMediaTypes = []string{"text/plain"}

	_, err := buildGenerationModel(document, supported, strings.Repeat("a", 40))
	if err == nil || !strings.Contains(err.Error(), "omit OpenAPI media type") {
		t.Fatalf("error = %v, want missing OpenAPI media type", err)
	}
}

func eventNamed(t *testing.T, events []realtimeEventContract, name string) realtimeEventContract {
	t.Helper()
	for _, event := range events {
		if event.Name == name {
			return event
		}
	}
	t.Fatalf("event %s is missing", name)
	return realtimeEventContract{}
}

func validContractFixture() (*openAPIDocument, supportedContracts) {
	supported := supportedContractFixture()
	document := &openAPIDocument{
		Info:    openAPIInfo{Version: "fixture-version"},
		OpenAPI: "3.1.0",
		Paths: map[string]openAPIPath{
			"/audio/speech":            operationPath("createSpeech", "200", "application/json", "application/octet-stream", "CreateSpeechRequest"),
			"/realtime/calls":          operationPath("create-realtime-call", "201", "application/sdp", "application/sdp", ""),
			"/realtime/client_secrets": operationPath("create-realtime-client-secret", "200", "application/json", "application/json", "RealtimeCreateClientSecretRequest"),
		},
		Servers: []openAPIServer{{URL: "https://api.openai.test/v1"}},
	}
	document.Components.Schemas = fixtureComponentSchemas(supported.RealtimeServerEvents)
	return document, supported
}

func operationPath(operationID, status, requestMediaType, responseMediaType, requestSchema string) openAPIPath {
	request := &openAPISchema{Type: "string"}
	if requestSchema != "" {
		request = &openAPISchema{Ref: componentRef(requestSchema)}
	}
	return openAPIPath{Post: &openAPIOperation{
		OperationID: operationID,
		RequestBody: &openAPIRequestBody{Content: map[string]openAPIMediaType{
			requestMediaType: {Schema: request},
		}},
		Responses: map[string]openAPIResponse{
			status: {Content: map[string]openAPIMediaType{responseMediaType: {Schema: &openAPISchema{Type: "string"}}}},
		},
	}}
}

func fixtureComponentSchemas(events []supportedRealtimeEvent) map[string]*openAPISchema {
	schemas := map[string]*openAPISchema{
		"AudioTranscription": {
			Type: "object",
			Properties: map[string]*openAPISchema{
				"delay": {Type: "string", Enum: []any{"minimal", "medium"}},
				"model": {AnyOf: []*openAPISchema{{Type: "string"}, {Type: "string", Enum: []any{"gpt-realtime-whisper"}}}},
			},
		},
		"CreateSpeechRequest": {
			Type:     "object",
			Required: []string{"model", "input", "voice"},
			Properties: map[string]*openAPISchema{
				"input":           {Type: "string", MaxLength: intPointer(4096)},
				"model":           {AnyOf: []*openAPISchema{{Type: "string"}, {Type: "string", Enum: []any{"gpt-4o-mini-tts"}}}},
				"response_format": {Type: "string", Enum: []any{"pcm", "wav"}},
				"voice":           {Ref: componentRef("Voice")},
			},
		},
		"RealtimeCreateClientSecretRequest": {
			Type: "object",
			Properties: map[string]*openAPISchema{
				"expires_after": {
					Type: "object",
					Properties: map[string]*openAPISchema{
						"anchor":  {Type: "string", Enum: []any{"created_at"}},
						"seconds": {Type: "integer", Minimum: floatPointer(10), Maximum: floatPointer(7200)},
					},
				},
				"session": {OneOf: []*openAPISchema{{Ref: componentRef("RealtimeTranscriptionSessionCreateRequestGA")}}},
			},
		},
		"RealtimeTranscriptionSessionCreateRequestGA": {
			Type:     "object",
			Required: []string{"type"},
			Properties: map[string]*openAPISchema{
				"type": {Type: "string", Enum: []any{"transcription"}},
				"audio": {
					Type: "object",
					Properties: map[string]*openAPISchema{"input": {
						Type: "object",
						Properties: map[string]*openAPISchema{
							"transcription":  {Ref: componentRef("AudioTranscription")},
							"turn_detection": {Ref: componentRef("RealtimeTurnDetection")},
						},
					}},
				},
			},
		},
		"RealtimeTurnDetection": {AnyOf: []*openAPISchema{{Type: "object"}, {Type: "null"}}},
		"RealtimeClientEventInputAudioBufferCommit": {
			Type:     "object",
			Required: []string{"type"},
			Properties: map[string]*openAPISchema{
				"event_id": {Type: "string"},
				"type":     {Type: "string", Enum: []any{"input_audio_buffer.commit"}},
			},
		},
		"Voice": {AnyOf: []*openAPISchema{{Type: "string", Enum: []any{"alloy", "marin"}}, {Type: "object"}}},
	}
	for _, event := range events {
		schemas[event.Schema] = fixtureEventSchema(event.Type)
	}
	return schemas
}

func fixtureEventSchema(eventType string) *openAPISchema {
	schema := &openAPISchema{
		Type:     "object",
		Required: []string{"event_id", "type"},
		Properties: map[string]*openAPISchema{
			"event_id": {Type: "string"},
			"type":     {Type: "string", Enum: []any{eventType}},
		},
	}
	switch eventType {
	case "session.created":
		addEventProperty(schema, "session", &openAPISchema{OneOf: []*openAPISchema{{Type: "object"}}}, true)
	case "input_audio_buffer.committed":
		addEventProperty(schema, "item_id", &openAPISchema{Type: "string"}, true)
	case "conversation.item.added", "conversation.item.done":
		addEventProperty(schema, "item", &openAPISchema{Ref: componentRef("ConversationItem")}, true)
	case "conversation.item.input_audio_transcription.delta":
		addEventProperty(schema, "item_id", &openAPISchema{Type: "string"}, true)
		addEventProperty(schema, "content_index", &openAPISchema{Type: "integer"}, false)
		addEventProperty(schema, "delta", &openAPISchema{Type: "string"}, false)
	case "conversation.item.input_audio_transcription.completed":
		addEventProperty(schema, "item_id", &openAPISchema{Type: "string"}, true)
		addEventProperty(schema, "content_index", &openAPISchema{Type: "integer"}, true)
		addEventProperty(schema, "transcript", &openAPISchema{Type: "string"}, true)
		addEventProperty(schema, "usage", &openAPISchema{OneOf: []*openAPISchema{{Type: "object"}}}, true)
	case "conversation.item.input_audio_transcription.failed":
		addEventProperty(schema, "item_id", &openAPISchema{Type: "string"}, true)
		addEventProperty(schema, "content_index", &openAPISchema{Type: "integer"}, true)
		addEventProperty(schema, "error", &openAPISchema{Type: "object"}, true)
	case "error":
		addEventProperty(schema, "error", &openAPISchema{Type: "object"}, true)
	case "rate_limits.updated":
		addEventProperty(schema, "rate_limits", &openAPISchema{Type: "array"}, true)
	}
	return schema
}

func addEventProperty(schema *openAPISchema, name string, property *openAPISchema, required bool) {
	schema.Properties[name] = property
	if required {
		schema.Required = append(schema.Required, name)
	}
}

func supportedContractFixture() supportedContracts {
	return supportedContracts{
		RealtimeClientEvents: []supportedRealtimeEvent{
			{Name: "inputAudioBufferCommit", Schema: "RealtimeClientEventInputAudioBufferCommit", Type: "input_audio_buffer.commit"},
		},
		Operations: []supportedOperation{
			{
				Name: "createSpeech", Method: "post", OperationID: "createSpeech", Path: "/audio/speech",
				RequestMediaType: "application/json", RequestSchema: "CreateSpeechRequest",
				ResponseMediaType: "application/octet-stream", SuccessStatus: "200",
				WireResponseMediaTypes: []string{"application/octet-stream", "audio/pcm"},
			},
			{
				Name: "createRealtimeCall", Method: "post", OperationID: "create-realtime-call", Path: "/realtime/calls",
				RequestMediaType: "application/sdp", ResponseMediaType: "application/sdp", SuccessStatus: "201",
				WireResponseMediaTypes: []string{"application/sdp", "text/plain"},
			},
			{
				Name: "createRealtimeClientSecret", Method: "post", OperationID: "create-realtime-client-secret", Path: "/realtime/client_secrets",
				RequestMediaType: "application/json", RequestSchema: "RealtimeCreateClientSecretRequest",
				ResponseMediaType: "application/json", SuccessStatus: "200",
				WireResponseMediaTypes: []string{"application/json"},
			},
		},
		RealtimeServerEvents: []supportedRealtimeEvent{
			{Name: "sessionCreated", Schema: "RealtimeServerEventSessionCreated", Type: "session.created"},
			{Name: "inputAudioBufferCommitted", Schema: "RealtimeServerEventInputAudioBufferCommitted", Type: "input_audio_buffer.committed"},
			{Name: "conversationItemAdded", Schema: "RealtimeServerEventConversationItemAdded", Type: "conversation.item.added"},
			{Name: "conversationItemDone", Schema: "RealtimeServerEventConversationItemDone", Type: "conversation.item.done"},
			{Name: "transcriptionDelta", Schema: "RealtimeServerEventConversationItemInputAudioTranscriptionDelta", Type: "conversation.item.input_audio_transcription.delta"},
			{Name: "transcriptionCompleted", Schema: "RealtimeServerEventConversationItemInputAudioTranscriptionCompleted", Type: "conversation.item.input_audio_transcription.completed"},
			{Name: "transcriptionFailed", Schema: "RealtimeServerEventConversationItemInputAudioTranscriptionFailed", Type: "conversation.item.input_audio_transcription.failed"},
			{Name: "error", Schema: "RealtimeServerEventError", Type: "error"},
			{Name: "rateLimitsUpdated", Schema: "RealtimeServerEventRateLimitsUpdated", Type: "rate_limits.updated"},
		},
		Speech: supportedSpeech{Model: "gpt-4o-mini-tts", ResponseFormat: "pcm", Voice: "marin", Voices: []string{"marin"}},
		Transcription: supportedTranscription{
			ClientSecretTTLSeconds: 600,
			Delay:                  "medium",
			Model:                  "gpt-realtime-whisper",
			SessionSchema:          "RealtimeTranscriptionSessionCreateRequestGA",
			WebRTCOperation:        "createRealtimeCall",
		},
	}
}

func intPointer(value int) *int {
	return &value
}

func floatPointer(value float64) *float64 {
	return &value
}
