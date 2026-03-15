package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
)

func TestRegisterTranscriptionProfileRoutesListsProfiles(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{
		{
			ID:                       "profile-supported",
			Name:                     "Realtime",
			TranscriptionLLMConfigID: "openai-realtime",
			TransportMode:            transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                  1200,
		},
		{
			ID:                       "profile-missing",
			Name:                     "Missing",
			TranscriptionLLMConfigID: "missing-config",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetTranscriptionProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var profiles []transcriptionprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode profiles: %v", err)
	}
	if len(profiles) != 2 {
		t.Fatalf("expected two profiles, got %#v", profiles)
	}
	if !profiles[0].SupportsRealtimeTranscription {
		t.Fatalf("expected first profile to be supported, got %#v", profiles[0])
	}
	if profiles[1].SupportsRealtimeTranscription {
		t.Fatalf("expected missing-config profile to be unsupported, got %#v", profiles[1])
	}
}

func TestRegisterTranscriptionProfileRoutesReturnsEmptyList(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{}, map[string]llmconfig.Config{})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetTranscriptionProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var profiles []transcriptionprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode profiles: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected empty profile list, got %#v", profiles)
	}
}

func TestRegisterTranscriptionProfileRoutesCreatesProfile(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1200,"language":" en "}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var created transcriptionprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created profile: %v", err)
	}
	if created.ID == "" || created.Name != "Realtime" {
		t.Fatalf("unexpected created profile %#v", created)
	}
	if !created.SupportsRealtimeTranscription {
		t.Fatalf("expected realtime support, got %#v", created)
	}
	if created.Language == nil || *created.Language != "en" {
		t.Fatalf("expected trimmed language, got %#v", created)
	}
}

func TestRegisterTranscriptionProfileRoutesUpdatesProfile(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateTranscriptionProfile,
		strings.NewReader(`{"profile":{"id":"profile-1","name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1600}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var updated transcriptionprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated profile: %v", err)
	}
	if updated.ID != "profile-1" || updated.Name != "Realtime" {
		t.Fatalf("unexpected updated profile %#v", updated)
	}
	if !updated.SupportsRealtimeTranscription {
		t.Fatalf("expected realtime support, got %#v", updated)
	}
}

func TestRegisterTranscriptionProfileRoutesDeletesProfile(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteTranscriptionProfile,
		strings.NewReader(`{"profileId":"profile-1"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	profiles, err := service.List()
	if err != nil {
		t.Fatalf("list profiles after delete: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected no profiles after delete, got %#v", profiles)
	}
}

func TestRegisterTranscriptionProfileRoutesBroadcastsSnapshotUpdates(t *testing.T) {
	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
	})
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	server := newTranscriptionProfileRouteTestWebsocketServer(t, hub)
	defer server.Close()

	conn := dialTranscriptionProfileRouteTestWebsocketClient(t, server.URL)
	defer conn.CloseNow()
	waitForTranscriptionProfileRouteTestHubConnection(t, hub, "frontend-a")

	handler := newTranscriptionProfileRouteTestHandlerWithHub(t, config.ModeIDE, service, hub, nil)

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1200}`),
	)
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create 200, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	createEnvelope := readTranscriptionProfileRouteTestEnvelope(t, conn)
	if createEnvelope.MessageType != realtime.MessageTypeTranscriptionProfilesUpdated {
		t.Fatalf("expected transcription profiles updated message type, got %q", createEnvelope.MessageType)
	}
	var createPayload realtime.TranscriptionProfilesUpdatedContent
	if err := json.Unmarshal(createEnvelope.Content, &createPayload); err != nil {
		t.Fatalf("decode create websocket payload: %v", err)
	}
	if len(createPayload.Profiles) != 2 {
		t.Fatalf("expected two profiles after create, got %#v", createPayload.Profiles)
	}
	if createPayload.Profiles[1].ID == "" || createPayload.Profiles[1].Name != "Realtime" {
		t.Fatalf("expected created transcription profile in snapshot, got %#v", createPayload.Profiles)
	}

	updateRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateTranscriptionProfile,
		strings.NewReader(`{"profile":{"id":"profile-1","name":"Realtime v2","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1600}}`),
	)
	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected update 200, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	updateEnvelope := readTranscriptionProfileRouteTestEnvelope(t, conn)
	var updatePayload realtime.TranscriptionProfilesUpdatedContent
	if err := json.Unmarshal(updateEnvelope.Content, &updatePayload); err != nil {
		t.Fatalf("decode update websocket payload: %v", err)
	}
	if len(updatePayload.Profiles) != 2 {
		t.Fatalf("expected two profiles after update, got %#v", updatePayload.Profiles)
	}
	if updatePayload.Profiles[0].Name != "Realtime v2" {
		t.Fatalf("expected updated profile name in snapshot, got %#v", updatePayload.Profiles[0])
	}

	deleteRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteTranscriptionProfile,
		strings.NewReader(`{"profileId":"profile-1"}`),
	)
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected delete 200, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
	}

	deleteEnvelope := readTranscriptionProfileRouteTestEnvelope(t, conn)
	var deletePayload realtime.TranscriptionProfilesUpdatedContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deletePayload); err != nil {
		t.Fatalf("decode delete websocket payload: %v", err)
	}
	if len(deletePayload.Profiles) != 1 {
		t.Fatalf("expected one profile after delete, got %#v", deletePayload.Profiles)
	}
	if deletePayload.Profiles[0].Name != "Realtime" {
		t.Fatalf("expected deleted snapshot to keep remaining profile, got %#v", deletePayload.Profiles)
	}
}

func TestRegisterTranscriptionProfileRoutesReturnsNotFoundForUpdatingMissingProfile(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateTranscriptionProfile,
		strings.NewReader(`{"profile":{"id":"missing-profile","name":"Missing","transcriptionLlmConfigId":"openai-file","transportMode":"file","chunkMs":1200}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "transcription_profile_not_found" {
		t.Fatalf("expected transcription_profile_not_found, got %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesReturnsNotFoundForDeletingMissingProfile(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteTranscriptionProfile,
		strings.NewReader(`{"profileId":"missing-profile"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "transcription_profile_not_found" {
		t.Fatalf("expected transcription_profile_not_found, got %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesRejectsInvalidJSON(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateTranscriptionProfile, strings.NewReader(`{"name"`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	var payload validationErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validation envelope: %v", err)
	}
	if payload.StatusCode != 10422 {
		t.Fatalf("expected validation status code 10422, got %#v", payload)
	}
	if payload.Message == "" {
		t.Fatalf("expected validation message, got %#v", payload)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
	}
}

func TestRegisterTranscriptionProfileRoutesRejectMissingProfilePayloads(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateTranscriptionProfile, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	var payload validationErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validation envelope: %v", err)
	}
	if payload.StatusCode != 10422 {
		t.Fatalf("expected validation status code 10422, got %#v", payload)
	}
	if payload.Message != "profile: Field required" {
		t.Fatalf("expected missing profile validation message, got %#v", payload)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
	}
}

func TestRegisterTranscriptionProfileRoutesRejectMissingDeleteProfileID(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTranscriptionProfile, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	var payload validationErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validation envelope: %v", err)
	}
	if payload.StatusCode != 10422 {
		t.Fatalf("expected validation status code 10422, got %#v", payload)
	}
	if payload.Message != "profileId: Field required" {
		t.Fatalf("expected missing profileId validation message, got %#v", payload)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
	}
}

func TestRegisterTranscriptionProfileRoutesRejectInvalidChunkBounds(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)

	testCases := []struct {
		name            string
		body            string
		expectedMessage string
	}{
		{
			name:            "too low",
			body:            `{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":199}`,
			expectedMessage: "chunkMs: Input should be greater than or equal to 200",
		},
		{
			name:            "too high",
			body:            `{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":10001}`,
			expectedMessage: "chunkMs: Input should be less than or equal to 10000",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteCreateTranscriptionProfile,
				strings.NewReader(tc.body),
			)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message != tc.expectedMessage {
				t.Fatalf("expected validation message %q, got %#v", tc.expectedMessage, payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func TestRegisterTranscriptionProfileRoutesRejectsUnknownLLMConfig(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Missing","transcriptionLlmConfigId":"missing-transcribe","transportMode":"file","chunkMs":1200}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_transcription_llm_config" {
		t.Fatalf("expected invalid_transcription_llm_config, got %#v", payload)
	}
	if payload.Error.Message != "Transcription profile references unknown transcription LLM config 'missing-transcribe'." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesRejectsUnsupportedRealtimeTransport(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{
		"openai-undocumented": {
			ID:       "openai-undocumented",
			Model:    "gpt-realtime",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Realtime","transcriptionLlmConfigId":"openai-undocumented","transportMode":"realtime","chunkMs":1200}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "realtime_transcription_unavailable" {
		t.Fatalf("expected realtime_transcription_unavailable, got %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesReturnsInternalErrorForInvalidPayload(t *testing.T) {
	t.Parallel()

	store, err := transcriptionprofiles.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid payload: %v", err)
	}
	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs:    map[string]llmconfig.Config{},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
		Profiles: store,
		LLM:      runtime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetTranscriptionProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "internal_error" {
		t.Fatalf("expected internal_error, got %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesAllowDeploymentReadsWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeShare, service, deploymentRuntime)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetTranscriptionProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var profiles []transcriptionprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode profiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("expected one profile, got %#v", profiles)
	}
}

func TestRegisterTranscriptionProfileRoutesBlockDeploymentReadsWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{}, map[string]llmconfig.Config{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": false},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeShare, service, deploymentRuntime)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetTranscriptionProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "llm_access_forbidden" {
		t.Fatalf("expected llm_access_forbidden, got %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesBlocksShareModeMutations(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, nil, map[string]llmconfig.Config{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeShare, service, deploymentRuntime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1200}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode detail payload: %v", err)
	}
	if payload["detail"] != "Share mode does not allow creating transcription profiles." {
		t.Fatalf("expected source detail body, got %#v", payload)
	}
}

func TestRegisterTranscriptionProfileRoutesAllowLauncherReadsAndBlockMutations(t *testing.T) {
	t.Parallel()

	service := newTranscriptionProfileRouteTestService(t, []transcriptionprofiles.Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})
	handler := newTranscriptionProfileRouteTestHandler(t, config.ModeLauncher, service)

	readRequest := httptest.NewRequest(http.MethodGet, "/api"+RouteGetTranscriptionProfiles, nil)
	readResponse := httptest.NewRecorder()
	handler.ServeHTTP(readResponse, readRequest)
	if readResponse.Code != http.StatusOK {
		t.Fatalf("expected launcher reads to return 200, got %d with body %q", readResponse.Code, readResponse.Body.String())
	}

	writeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1200}`),
	)
	writeResponse := httptest.NewRecorder()
	handler.ServeHTTP(writeResponse, writeRequest)
	if writeResponse.Code != http.StatusForbidden {
		t.Fatalf("expected launcher writes to return 403, got %d with body %q", writeResponse.Code, writeResponse.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(writeResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode detail payload: %v", err)
	}
	if payload["detail"] != "Launcher mode does not allow this endpoint." {
		t.Fatalf("expected launcher detail body, got %#v", payload)
	}
}

func newTranscriptionProfileRouteTestHandler(t *testing.T, mode config.Mode, service *transcriptionprofiles.Service, deploymentRuntimes ...*deployments.Runtime) http.Handler {
	t.Helper()

	var deploymentRuntime *deployments.Runtime
	if len(deploymentRuntimes) != 0 {
		deploymentRuntime = deploymentRuntimes[0]
	}
	if deploymentRuntime == nil && (mode == config.ModeShare || mode == config.ModeApp) {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Policy: map[string]any{"allowLLM": true},
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterTranscriptionProfileRoutes(r, TranscriptionProfileRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Profiles:   service,
				Deployment: deploymentRuntime,
			}); err != nil {
				t.Fatalf("register transcription profile routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newTranscriptionProfileRouteTestHandlerWithHub(
	t *testing.T,
	mode config.Mode,
	service *transcriptionprofiles.Service,
	websocketHub *realtime.WebsocketHub,
	deploymentRuntime *deployments.Runtime,
) http.Handler {
	t.Helper()

	if deploymentRuntime == nil && (mode == config.ModeShare || mode == config.ModeApp) {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Policy: map[string]any{"allowLLM": true},
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterTranscriptionProfileRoutes(r, TranscriptionProfileRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				Profiles:     service,
				Deployment:   deploymentRuntime,
				WebsocketHub: websocketHub,
			}); err != nil {
				t.Fatalf("register transcription profile routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newTranscriptionProfileRouteTestService(t *testing.T, profiles []transcriptionprofiles.Profile, configs map[string]llmconfig.Config) *transcriptionprofiles.Service {
	t.Helper()

	store, err := transcriptionprofiles.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := store.Write(profiles); err != nil {
		t.Fatalf("write profiles: %v", err)
	}
	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs:    configs,
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
		Profiles: store,
		LLM:      runtime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func newTranscriptionProfileRouteTestWebsocketServer(t *testing.T, hub *realtime.WebsocketHub) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Errorf("accept websocket connection: %v", err)
			return
		}
		defer conn.CloseNow()

		connection, err := hub.Connect(r.Context(), conn, realtime.ConnectParams{
			ID:                   "frontend-a",
			Type:                 realtime.ConnectionTypeFrontend,
			BroadcastConnections: false,
		})
		if err != nil {
			t.Errorf("connect websocket hub connection: %v", err)
			return
		}
		defer hub.Disconnect(context.Background(), connection.ID, false)

		for {
			if _, _, err := conn.Read(context.Background()); err != nil {
				return
			}
		}
	})
	return httptest.NewServer(mux)
}

func dialTranscriptionProfileRouteTestWebsocketClient(t *testing.T, serverURL string) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(serverURL, "http")+"/ws", nil)
	if err != nil {
		t.Fatalf("dial transcription profile websocket: %v", err)
	}
	return conn
}

func waitForTranscriptionProfileRouteTestHubConnection(t *testing.T, hub *realtime.WebsocketHub, connectionID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := hub.Connection(connectionID); ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for hub connection %q", connectionID)
}

func readTranscriptionProfileRouteTestEnvelope(t *testing.T, conn *websocket.Conn) struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
} {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket message: %v", err)
	}

	var envelope struct {
		MessageType string          `json:"messageType"`
		Content     json.RawMessage `json:"content"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode websocket envelope: %v", err)
	}
	return envelope
}
