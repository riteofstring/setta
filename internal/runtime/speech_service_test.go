package runtime

import (
	"bytes"
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
	if failure.Error.Code != string(speech.ErrorNotConfigured) {
		t.Fatalf("text-only transcription failure = %+v", failure.Error)
	}
}

func TestConfiguredRuntimeServesSpeechCapabilitiesAndTranscription(t *testing.T) {
	provider := newRuntimeSpeechProvider(t)
	defer provider.Close()

	config := testConfig(t)
	config.Speech = speech.OpenAIProviderConfig{
		BaseURL:          provider.URL + "/v1",
		AllowTestBaseURL: true,
	}
	config.SpeechCredentialOwner = SpeechCredentialOwnerServerStartup
	config.SpeechStartupAPIKey = runtimeSpeechAPIKey
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

func TestElectronVaultRuntimeServesDesktopSpeechCredentialManagement(t *testing.T) {
	provider := newRuntimeSpeechProvider(t)
	defer provider.Close()

	config := testConfig(t)
	config.Speech = speech.OpenAIProviderConfig{
		BaseURL:          provider.URL + "/v1",
		AllowTestBaseURL: true,
	}
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 10*time.Second)
	baseURL := "http://" + server.Addr()
	credentialRequest := httpapi.SpeechCredentialRequest{APIKey: runtimeSpeechAPIKey}
	validated := postRuntimeJSON[speech.SpeechCredentialValidationResult](
		t,
		client,
		baseURL,
		"/speech/credentials/desktop/validate",
		credentialRequest,
		http.StatusOK,
	)
	if validated.Provider != speech.SpeechProviderOpenAI || !validated.Valid {
		t.Fatalf("validated credential = %+v", validated)
	}
	if provider.transcriptionCalls.Load() != 1 {
		t.Fatalf("provider transcription calls after validation = %d, want 1", provider.transcriptionCalls.Load())
	}
	capabilities := getRuntimeJSON[speech.SpeechCapabilities](t, client, baseURL, "/speech/capabilities")
	if capabilities.ProviderStatus != speech.SpeechProviderStatusNotConfigured {
		t.Fatalf("provider status after validation = %q, want not_configured", capabilities.ProviderStatus)
	}

	loaded := postRuntimeJSON[speech.SpeechCredentialStatus](
		t,
		client,
		baseURL,
		"/speech/credentials/desktop/load",
		credentialRequest,
		http.StatusOK,
	)
	if loaded.Provider != speech.SpeechProviderOpenAI ||
		loaded.ProviderStatus != speech.SpeechProviderStatusConfigured {
		t.Fatalf("loaded credential status = %+v", loaded)
	}
	if provider.transcriptionCalls.Load() != 1 {
		t.Fatalf("provider transcription calls after load = %d, want 1", provider.transcriptionCalls.Load())
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
	if provider.transcriptionCalls.Load() != 2 {
		t.Fatalf("provider transcription calls after session = %d, want 2", provider.transcriptionCalls.Load())
	}

	cleared := postRuntimeJSON[speech.SpeechCredentialStatus](
		t,
		client,
		baseURL,
		"/speech/credentials/desktop/clear",
		httpapi.ClearDesktopSpeechCredentialRequest{},
		http.StatusOK,
	)
	if cleared.Provider != speech.SpeechProviderOpenAI ||
		cleared.ProviderStatus != speech.SpeechProviderStatusNotConfigured {
		t.Fatalf("cleared credential status = %+v", cleared)
	}
	failure := postRuntimeJSON[httpapi.ErrorResponse](
		t,
		client,
		baseURL,
		"/speech/transcription/sessions",
		httpapi.CreateSpeechTranscriptionSessionRequest{},
		http.StatusServiceUnavailable,
	)
	if failure.Error.Code != string(speech.ErrorNotConfigured) {
		t.Fatalf("transcription failure after clear = %+v", failure.Error)
	}
}

func TestElectronVaultRuntimeRejectsMalformedDesktopSpeechCredentialWithoutLeakingIt(t *testing.T) {
	const credential = "sk-setta invalid\nruntime credential"
	server, ready := startRuntimeTestServer(t, testConfig(t))
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second)
	body := postRuntimeJSONBytes(
		t,
		client,
		"http://"+server.Addr(),
		"/speech/credentials/desktop/load",
		httpapi.SpeechCredentialRequest{APIKey: credential},
		http.StatusBadRequest,
	)
	if bytes.Contains(body, []byte(credential)) {
		t.Fatal("malformed credential response contains the submitted credential")
	}
	var failure httpapi.ErrorResponse
	if err := json.Unmarshal(body, &failure); err != nil {
		t.Fatalf("decode malformed credential failure: %v; body: %s", err, string(body))
	}
	if failure.Error.Code != string(speech.ErrorCredentialInvalid) {
		t.Fatalf("malformed credential error = %+v", failure.Error)
	}
}

func TestServerStartupRuntimeRejectsDesktopSpeechCredentialManagement(t *testing.T) {
	config := testConfig(t)
	config.SpeechCredentialOwner = SpeechCredentialOwnerServerStartup
	config.SpeechStartupAPIKey = runtimeSpeechAPIKey
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second)
	baseURL := "http://" + server.Addr()
	tests := []struct {
		path    string
		payload any
	}{
		{
			path:    "/speech/credentials/desktop/validate",
			payload: httpapi.SpeechCredentialRequest{APIKey: runtimeSpeechAPIKey},
		},
		{
			path:    "/speech/credentials/desktop/load",
			payload: httpapi.SpeechCredentialRequest{APIKey: runtimeSpeechAPIKey},
		},
		{
			path:    "/speech/credentials/desktop/clear",
			payload: httpapi.ClearDesktopSpeechCredentialRequest{},
		},
	}
	for _, test := range tests {
		body := postRuntimeJSONBytes(t, client, baseURL, test.path, test.payload, http.StatusForbidden)
		if bytes.Contains(body, []byte(runtimeSpeechAPIKey)) {
			t.Fatalf("%s response contains the submitted credential", test.path)
		}
		var failure httpapi.ErrorResponse
		if err := json.Unmarshal(body, &failure); err != nil {
			t.Fatalf("decode %s failure: %v; body: %s", test.path, err, string(body))
		}
		if failure.Error.Code != string(speech.ErrorCredentialManagementUnavailable) {
			t.Fatalf("%s error = %+v", test.path, failure.Error)
		}
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

func postRuntimeJSONBytes(
	t *testing.T,
	client *http.Client,
	baseURL string,
	path string,
	payload any,
	wantStatus int,
) []byte {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal %s payload: %v", path, err)
	}
	request, err := http.NewRequest(http.MethodPost, baseURL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create POST %s: %v", path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("post %s: %v", path, err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s response: %v", path, err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", path, response.StatusCode, wantStatus, string(responseBody))
	}
	return responseBody
}
