package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/llmconfig"
	"setta/internal/modes"
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
