package runtime

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"setta/internal/easyrun"
	"setta/internal/httpapi"
	"setta/internal/speech"
)

const (
	runtimeSpeechAPIKey              = "sk-setta-runtime-speech-test"
	runtimeSpeechProviderFailureBody = "runtime-speech-provider-body-secret"
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
		httpapi.CreateSpeechTranscriptionSessionRequest{WorkspaceID: "workspace_unconfigured"},
		http.StatusServiceUnavailable,
	)
	if failure.Error.Code != string(speech.ErrorNotConfigured) || failure.Error.OperationApplied {
		t.Fatalf("text-only transcription failure = %+v", failure.Error)
	}
}

func TestConfiguredRuntimeServesEverySpeechOperation(t *testing.T) {
	provider := newRuntimeSpeechProvider(t)
	defer provider.Close()

	config := testConfig(t)
	config.ChatHarness = ChatHarnessScriptedWorkflow
	config.Speech = speech.OpenAIClientConfig{
		APIKey:           runtimeSpeechAPIKey,
		BaseURL:          provider.URL + "/v1",
		AllowTestBaseURL: true,
	}
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 10*time.Second)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)

	capabilities := getRuntimeJSON[speech.SpeechCapabilities](t, client, baseURL, "/speech/capabilities")
	if capabilities.ProviderStatus != speech.SpeechProviderStatusConfigured {
		t.Fatalf("speech provider status = %q, want configured", capabilities.ProviderStatus)
	}
	session := postRuntimeJSON[speech.SpeechTranscriptionSession](
		t,
		client,
		baseURL,
		"/speech/transcription/sessions",
		httpapi.CreateSpeechTranscriptionSessionRequest{WorkspaceID: opened.Workspace.ID},
		http.StatusOK,
	)
	if session.ClientSecret != runtimeSpeechTranscriptionSecret {
		t.Fatalf("transcription client secret = %q", session.ClientSecret)
	}
	if err := speech.ValidateSpeechTranscriptionSession(session); err != nil {
		t.Fatalf("validate runtime transcription session: %v", err)
	}

	started := postRuntimeJSON[easyrun.EasyRun](t, client, baseURL, "/easy-runs/start", httpapi.StartEasyRunRequest{
		WorkspaceID: opened.Workspace.ID,
		RequestText: "easy run phase4 narrator workflow",
	}, http.StatusOK)
	snapshot := waitForRuntimeSpeechSource(t, client, baseURL, opened.Workspace.ID, started.ID)

	summaryAudio := postRuntimeJSON[speech.SpeechAudio](t, client, baseURL, "/speech/easy-runs/summary", httpapi.SynthesizeEasyRunSummaryRequest{
		WorkspaceID: opened.Workspace.ID,
		EasyRunID:   started.ID,
	}, http.StatusOK)
	highlight := snapshot.Highlights[0]
	highlightAudio := postRuntimeJSON[speech.SpeechAudio](t, client, baseURL, "/speech/easy-runs/highlight", httpapi.SynthesizeEasyRunHighlightRequest{
		WorkspaceID: opened.Workspace.ID,
		EasyRunID:   started.ID,
		HighlightID: highlight.ID,
	}, http.StatusOK)

	assertRuntimeSpeechAudio(t, summaryAudio, started.ID)
	assertRuntimeSpeechAudio(t, highlightAudio, highlight.ID)
	if snapshot.LatestRun == nil || snapshot.LatestRun.Summary == nil {
		t.Fatal("terminal Easy Run summary is missing")
	}
	wantInputs := []string{*snapshot.LatestRun.Summary, highlight.Text}
	if got := provider.SynthesisInputs(); !equalRuntimeSpeechInputs(got, wantInputs) {
		t.Fatalf("provider synthesis inputs = %q, want exact persisted sources %q", got, wantInputs)
	}
	if provider.transcriptionCalls.Load() != 1 || provider.synthesisCalls.Load() != 2 {
		t.Fatalf(
			"provider calls = transcription %d, synthesis %d; want 1 and 2",
			provider.transcriptionCalls.Load(),
			provider.synthesisCalls.Load(),
		)
	}
}

func waitForRuntimeSpeechSource(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	easyRunID string,
) easyrun.EasyRunSnapshot {
	t.Helper()
	path := "/easy-runs/snapshot?workspaceId=" + url.QueryEscape(workspaceID)
	deadline := time.Now().Add(5 * time.Second)
	var snapshot easyrun.EasyRunSnapshot
	for time.Now().Before(deadline) {
		snapshot = getRuntimeJSON[easyrun.EasyRunSnapshot](t, client, baseURL, path)
		if snapshot.LatestRun != nil && snapshot.LatestRun.ID == easyRunID &&
			snapshot.LatestRun.Status == easyrun.EasyRunStatusCompleted &&
			snapshot.LatestRun.Summary != nil && len(snapshot.Highlights) > 0 {
			return snapshot
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for terminal Easy Run speech sources: %+v", snapshot)
	return easyrun.EasyRunSnapshot{}
}

func assertRuntimeSpeechAudio(t *testing.T, audio speech.SpeechAudio, sourceID string) {
	t.Helper()
	if audio.SourceID != sourceID {
		t.Fatalf("speech audio source = %q, want %q", audio.SourceID, sourceID)
	}
	if err := speech.ValidateSpeechAudio(audio); err != nil {
		t.Fatalf("validate runtime speech audio: %v", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(audio.AudioBase64)
	if err != nil {
		t.Fatalf("decode runtime speech audio: %v", err)
	}
	if !bytes.Equal(decoded, runtimeSpeechWAV()) {
		t.Fatalf("runtime speech audio = %x, want fake provider WAV", decoded)
	}
}

type runtimeSpeechProvider struct {
	*httptest.Server

	transcriptionCalls atomic.Int32
	synthesisCalls     atomic.Int32
	rejectSynthesis    atomic.Bool
	mu                 sync.Mutex
	synthesisInputs    []string
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
	switch request.URL.Path {
	case "/v1/realtime/client_secrets":
		provider.handleTranscription(t, response, request)
	case "/v1/audio/speech":
		provider.handleSynthesis(t, response, request)
	default:
		http.NotFound(response, request)
	}
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
		"value":      "ek_runtime_speech_ephemeral",
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

func (provider *runtimeSpeechProvider) handleSynthesis(t *testing.T, response http.ResponseWriter, request *http.Request) {
	provider.synthesisCalls.Add(1)
	if provider.rejectSynthesis.Load() {
		http.Error(response, runtimeSpeechProviderFailureBody, http.StatusInternalServerError)
		return
	}
	if safetyIdentifier := request.Header.Get("OpenAI-Safety-Identifier"); safetyIdentifier != "" {
		t.Errorf("synthesis safety identifier = %q, want empty", safetyIdentifier)
	}
	var payload struct {
		Input          string `json:"input"`
		Model          string `json:"model"`
		ResponseFormat string `json:"response_format"`
		Voice          string `json:"voice"`
	}
	decodeRuntimeProviderJSON(t, request, &payload)
	if payload.Model != speech.SynthesisModel || payload.Voice != speech.SynthesisVoice || payload.ResponseFormat != speech.SynthesisFormat {
		t.Errorf("synthesis provider payload = %+v", payload)
	}
	provider.mu.Lock()
	provider.synthesisInputs = append(provider.synthesisInputs, payload.Input)
	provider.mu.Unlock()
	response.Header().Set("Content-Type", "application/octet-stream")
	if _, err := response.Write(runtimeSpeechWAV()); err != nil {
		t.Errorf("write fake speech audio: %v", err)
	}
}

func (provider *runtimeSpeechProvider) RejectSynthesis() {
	provider.rejectSynthesis.Store(true)
}

func (provider *runtimeSpeechProvider) SynthesisInputs() []string {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	return append([]string(nil), provider.synthesisInputs...)
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
	const prefix = "setta-device-"
	if !strings.HasPrefix(identifier, prefix) {
		return false
	}
	digest := strings.TrimPrefix(identifier, prefix)
	decoded, err := hex.DecodeString(digest)
	return err == nil && len(decoded) == 32
}

func equalRuntimeSpeechInputs(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}

func runtimeSpeechWAV() []byte {
	return []byte{
		'R', 'I', 'F', 'F', 38, 0, 0, 0, 'W', 'A', 'V', 'E',
		'f', 'm', 't', ' ', 16, 0, 0, 0, 1, 0, 1, 0,
		0x40, 0x1f, 0, 0, 0x80, 0x3e, 0, 0, 2, 0, 16, 0,
		'd', 'a', 't', 'a', 2, 0, 0, 0, 0, 0,
	}
}
