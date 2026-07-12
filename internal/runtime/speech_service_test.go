package runtime

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/speech"
)

const (
	runtimeSpeechAPIKey              = "sk-setta-runtime-speech-test"
	runtimeSpeechTranscriptionSecret = "ek_runtime_speech_ephemeral"
)

func TestRuntimeServesTextOnlySpeechCapabilitiesAndTypedFailures(t *testing.T) {
	server, ready := startRuntimeTestServer(t, testConfig(t))
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second)
	baseURL := "http://" + server.Addr()
	capabilities := getRuntimeJSON[speech.SpeechCapabilities](t, client, baseURL, "/speech/capabilities")
	if capabilities.ProviderStatus != speech.SpeechProviderStatusNotConfigured {
		t.Fatalf("speech provider status = %q, want not_configured", capabilities.ProviderStatus)
	}
	if err := speech.ValidateSpeechCapabilities(capabilities); err != nil {
		t.Fatalf("validate text-only speech capabilities: %v", err)
	}

	failure := postRuntimeJSON[httpapi.ErrorResponse](
		t,
		client,
		baseURL,
		"/speech/transcription/sessions",
		httpapi.CreateSpeechTranscriptionSessionRequest{},
		http.StatusServiceUnavailable,
	)
	if failure.Error.Code != string(speech.ErrorNotConfigured) || failure.Error.OperationApplied {
		t.Fatalf("text-only transcription failure = %+v", failure.Error)
	}
}

func TestConfiguredRuntimeServesSpeechCapabilitiesAndTranscription(t *testing.T) {
	provider := newRuntimeSpeechProvider(t)
	defer provider.Close()

	config := testConfig(t)
	config.Speech = speech.OpenAIClientConfig{
		APIKey:           runtimeSpeechAPIKey,
		BaseURL:          provider.URL + "/v1",
		AllowTestBaseURL: true,
	}
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 10*time.Second)
	baseURL := "http://" + server.Addr()
	capabilities := getRuntimeJSON[speech.SpeechCapabilities](t, client, baseURL, "/speech/capabilities")
	if capabilities.ProviderStatus != speech.SpeechProviderStatusConfigured {
		t.Fatalf("speech provider status = %q, want configured", capabilities.ProviderStatus)
	}
	session := postRuntimeJSON[speech.SpeechTranscriptionSession](
		t,
		client,
		baseURL,
		"/speech/transcription/sessions",
		httpapi.CreateSpeechTranscriptionSessionRequest{},
		http.StatusOK,
	)
	if session.ClientSecret != runtimeSpeechTranscriptionSecret {
		t.Fatalf("transcription client secret = %q", session.ClientSecret)
	}
	if err := speech.ValidateSpeechTranscriptionSession(session); err != nil {
		t.Fatalf("validate runtime transcription session: %v", err)
	}
	if provider.transcriptionCalls.Load() != 1 {
		t.Fatalf("provider transcription calls = %d, want 1", provider.transcriptionCalls.Load())
	}
}

type runtimeSpeechProvider struct {
	*httptest.Server

	transcriptionCalls atomic.Int32
}

func newRuntimeSpeechProvider(t *testing.T) *runtimeSpeechProvider {
	t.Helper()
	provider := &runtimeSpeechProvider{}
	provider.Server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		provider.handle(t, response, request)
	}))
	return provider
}

func (provider *runtimeSpeechProvider) handle(t *testing.T, response http.ResponseWriter, request *http.Request) {
	t.Helper()
	if request.Method != http.MethodPost || request.Header.Get("Authorization") != "Bearer "+runtimeSpeechAPIKey {
		t.Errorf("provider request = %s %s with an invalid authorization header", request.Method, request.URL.Path)
		http.Error(response, "invalid request", http.StatusBadRequest)
		return
	}
	if request.URL.Path != "/v1/realtime/client_secrets" {
		http.NotFound(response, request)
		return
	}
	provider.handleTranscription(t, response, request)
}

func (provider *runtimeSpeechProvider) handleTranscription(t *testing.T, response http.ResponseWriter, request *http.Request) {
	provider.transcriptionCalls.Add(1)
	safetyIdentifier := request.Header.Get("OpenAI-Safety-Identifier")
	if !validRuntimeSafetyIdentifier(safetyIdentifier) {
		t.Errorf("provider safety identifier = %q", safetyIdentifier)
	}
	var payload struct {
		Session struct {
			Type string `json:"type"`
		} `json:"session"`
	}
	decodeRuntimeProviderJSON(t, request, &payload)
	if payload.Session.Type != "transcription" {
		t.Errorf("provider session type = %q, want transcription", payload.Session.Type)
	}
	response.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(response).Encode(map[string]any{
		"value":      runtimeSpeechTranscriptionSecret,
		"expires_at": time.Now().Add(5 * time.Minute).Unix(),
		"session": map[string]any{
			"type": "transcription",
			"audio": map[string]any{"input": map[string]any{
				"transcription": map[string]any{
					"model": speech.TranscriptionModel,
					"delay": speech.TranscriptionDelay,
				},
				"turn_detection": nil,
			}},
		},
	}); err != nil {
		t.Errorf("encode fake transcription response: %v", err)
	}
}

func decodeRuntimeProviderJSON(t *testing.T, request *http.Request, target any) {
	t.Helper()
	decoder := json.NewDecoder(request.Body)
	if err := decoder.Decode(target); err != nil {
		t.Errorf("decode provider request: %v", err)
		return
	}
	if _, err := decoder.Token(); err != io.EOF {
		t.Errorf("provider request has trailing JSON: %v", err)
	}
}

func validRuntimeSafetyIdentifier(identifier string) bool {
	if identifier == "" || len(identifier) > 64 {
		return false
	}
	for _, char := range identifier {
		if char < 0x21 || char > 0x7e {
			return false
		}
	}
	return true
}
