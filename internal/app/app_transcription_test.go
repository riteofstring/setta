package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/transcriptionprofiles"
)

func TestAppServesFileModeTranscriptionSessionRoutes(t *testing.T) {
	// The real IDE app should own file-mode transcription session lifecycle and
	// upload buffered WAV audio through the Go runtime.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "app-transcription-secret")

	providerRequests, provider := newAppFileTranscriptionProvider(t)
	saveAppFileTranscriptionConfig(t, cfg, provider.URL)
	server, authCookie := startAppTranscriptionServer(t, cfg)

	started := startAppFileTranscriptionSession(t, server.URL, authCookie)
	appendAppFileTranscriptionAudio(t, server.URL, authCookie, started.SessionID)
	stopAppFileTranscriptionSession(t, server.URL, authCookie, started.SessionID)
	assertAppFileTranscriptionProviderRequest(t, providerRequests)
}

type appFileTranscriptionProviderRequest struct {
	Path          string
	Authorization string
	Model         string
	Language      string
	FileSize      int
}

func newAppFileTranscriptionProvider(
	t *testing.T,
) (<-chan appFileTranscriptionProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appFileTranscriptionProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppFileTranscriptionProviderRequest(w, r)
		if !ok {
			return
		}
		providerRequests <- captured
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "transcribed by go"})
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func captureAppFileTranscriptionProviderRequest(
	w http.ResponseWriter,
	r *http.Request,
) (appFileTranscriptionProviderRequest, bool) {
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return appFileTranscriptionProviderRequest{}, false
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return appFileTranscriptionProviderRequest{}, false
	}
	defer file.Close()
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return appFileTranscriptionProviderRequest{}, false
	}
	return appFileTranscriptionProviderRequest{
		Path:          r.URL.Path,
		Authorization: r.Header.Get("Authorization"),
		Model:         r.FormValue("model"),
		Language:      r.FormValue("language"),
		FileSize:      len(fileBytes),
	}, true
}

func saveAppFileTranscriptionConfig(t *testing.T, cfg config.Config, providerURL string) {
	t.Helper()

	saveAppTestLLMConfigs(t, cfg, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   providerURL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]llmconfig.ServerConfig{})

	transcriptionStore, err := transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new transcription store: %v", err)
	}
	if err := transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}
}

func startAppFileTranscriptionSession(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
) httpapi.StartTranscriptionSessionResponse {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file","language":"en"}`),
	)
	if err != nil {
		t.Fatalf("new start request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("start transcription session: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected start 200, got %d with body %q", response.StatusCode, string(body))
	}
	var started httpapi.StartTranscriptionSessionResponse
	if err := json.NewDecoder(response.Body).Decode(&started); err != nil {
		t.Fatalf("decode start payload: %v", err)
	}
	if started.ResolvedTransportMode != "file" || started.ChunkMs != 0 {
		t.Fatalf("unexpected start payload %#v", started)
	}
	return started
}

func appendAppFileTranscriptionAudio(t *testing.T, serverURL string, authCookie *http.Cookie, sessionID string) {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+sessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	if err != nil {
		t.Fatalf("new append request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("append transcription audio: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected append 200, got %d with body %q", response.StatusCode, string(body))
	}
	var appendPayload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(response.Body).Decode(&appendPayload); err != nil {
		t.Fatalf("decode append payload: %v", err)
	}
	if appendPayload.AppendText != "" || appendPayload.IsFinal {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}
}

func stopAppFileTranscriptionSession(t *testing.T, serverURL string, authCookie *http.Cookie, sessionID string) {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+sessionID+`"}`),
	)
	if err != nil {
		t.Fatalf("new stop request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("stop transcription session: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected stop 200, got %d with body %q", response.StatusCode, string(body))
	}
	var stopPayload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(response.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode stop payload: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != "transcribed by go" || stopPayload.FullText != "transcribed by go" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}
}

func assertAppFileTranscriptionProviderRequest(
	t *testing.T,
	providerRequests <-chan appFileTranscriptionProviderRequest,
) {
	t.Helper()

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/audio/transcriptions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer app-transcription-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.Model != "whisper-1" {
			t.Fatalf("unexpected model %q", captured.Model)
		}
		if captured.Language != "en" {
			t.Fatalf("unexpected language %q", captured.Language)
		}
		if captured.FileSize <= 44 {
			t.Fatalf("expected wav payload larger than header, got %d bytes", captured.FileSize)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestAppRejectsUnauthorizedTranscriptionAppendBeforeJSONDecode(t *testing.T) {
	// Auth middleware should reject appendTranscriptionAudio before the route
	// tries to decode invalid JSON request bodies.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId"`),
	)
	if err != nil {
		t.Fatalf("new append request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("append transcription audio without auth: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected append 401, got %d with body %q", response.StatusCode, string(body))
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read unauthorized append body: %v", err)
	}
	if strings.Contains(string(body), "invalid_json") {
		t.Fatalf("expected auth rejection before JSON decode, got %q", string(body))
	}
	if !strings.Contains(string(body), "unauthorized") {
		t.Fatalf("expected unauthorized auth error, got %q", string(body))
	}
}

type appRealtimeTranscriptionHandshake struct {
	Path          string
	Query         string
	Authorization string
	OpenAIBeta    string
}

type appRealtimeTranscriptionProvider struct {
	server    *httptest.Server
	handshake chan appRealtimeTranscriptionHandshake
	update    chan map[string]any
	append    chan map[string]any
	commit    chan map[string]any
	closed    chan error
	emitFinal chan struct{}
}

func newAppRealtimeTranscriptionProvider(t *testing.T) *appRealtimeTranscriptionProvider {
	t.Helper()

	provider := &appRealtimeTranscriptionProvider{
		handshake: make(chan appRealtimeTranscriptionHandshake, 1),
		update:    make(chan map[string]any, 1),
		append:    make(chan map[string]any, 1),
		commit:    make(chan map[string]any, 1),
		closed:    make(chan error, 1),
		emitFinal: make(chan struct{}),
	}
	provider.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provider.handshake <- appRealtimeTranscriptionHandshake{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			Authorization: r.Header.Get("Authorization"),
			OpenAIBeta:    r.Header.Get("OpenAI-Beta"),
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		update, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		provider.update <- update
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}

		appendPayload, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		provider.append <- appendPayload

		commitPayload, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		provider.commit <- commitPayload

		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-1","transcript":"ready"}`)); err != nil {
			return
		}
		<-provider.emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-2","transcript":"now"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		provider.closed <- err
	}))
	t.Cleanup(provider.server.Close)
	return provider
}

func saveAppRealtimeTranscriptionConfig(t *testing.T, cfg config.Config, providerURL string) {
	t.Helper()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   providerURL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	transcriptionStore, err := transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new transcription store: %v", err)
	}
	if err := transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-realtime",
			Name:                     "Realtime",
			TranscriptionLLMConfigID: "openai-realtime",
			TransportMode:            transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                  200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}
}

func startAppTranscriptionServer(t *testing.T, cfg config.Config) (*httptest.Server, *http.Cookie) {
	t.Helper()

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	return server, newAppTestAuthCookie(t, app)
}

func startAppRealtimeTranscriptionSession(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
) httpapi.StartTranscriptionSessionResponse {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime","language":"en"}`),
	)
	if err != nil {
		t.Fatalf("new start request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("start realtime transcription session: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected realtime start 200, got %d with body %q", response.StatusCode, string(body))
	}
	var started httpapi.StartTranscriptionSessionResponse
	if err := json.NewDecoder(response.Body).Decode(&started); err != nil {
		t.Fatalf("decode realtime start payload: %v", err)
	}
	if started.ResolvedTransportMode != "realtime" || started.ChunkMs != 200 {
		t.Fatalf("unexpected realtime start payload %#v", started)
	}
	return started
}

func appendAppRealtimeTranscriptionAudio(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	sessionID string,
) httpapi.TranscriptionSessionDeltaResponse {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+sessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	if err != nil {
		t.Fatalf("new realtime append request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("append realtime transcription audio: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected realtime append 200, got %d with body %q", response.StatusCode, string(body))
	}
	var payload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode realtime append payload: %v", err)
	}
	if payload.IsFinal || payload.AppendText != "ready" || payload.FullText != "ready" {
		t.Fatalf("unexpected realtime append payload %#v", payload)
	}
	return payload
}

func stopAppRealtimeTranscriptionSession(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	sessionID string,
) httpapi.TranscriptionSessionDeltaResponse {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+sessionID+`"}`),
	)
	if err != nil {
		t.Fatalf("new realtime stop request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("stop realtime transcription session: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected realtime stop 200, got %d with body %q", response.StatusCode, string(body))
	}
	var payload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode realtime stop payload: %v", err)
	}
	if !payload.IsFinal || payload.AppendText != " now" || payload.FullText != "ready now" {
		t.Fatalf("unexpected realtime stop payload %#v", payload)
	}
	return payload
}

func assertAppRealtimeTranscriptionHandshake(t *testing.T, handshakes <-chan appRealtimeTranscriptionHandshake) {
	t.Helper()

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected realtime path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected realtime query %q", captured.Query)
		}
		if captured.Authorization != "Bearer app-realtime-secret" {
			t.Fatalf("unexpected realtime authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime handshake")
	}
}

func assertAppRealtimeTranscriptionUpdate(t *testing.T, updates <-chan map[string]any) {
	t.Helper()

	select {
	case payload := <-updates:
		if payload["type"] != "transcription_session.update" {
			t.Fatalf("unexpected realtime update payload %#v", payload)
		}
		if payload["input_audio_format"] != "pcm16" {
			t.Fatalf("unexpected realtime audio input format %#v", payload)
		}
		transcriptionPayload, ok := payload["input_audio_transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected transcription payload, got %#v", payload)
		}
		if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
			t.Fatalf("unexpected transcription payload %#v", transcriptionPayload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime session update")
	}
}

func assertAppRealtimeTranscriptionPayloadType(
	t *testing.T,
	payloads <-chan map[string]any,
	expectedType string,
	timeoutMessage string,
) {
	t.Helper()

	select {
	case payload := <-payloads:
		if payload["type"] != expectedType {
			t.Fatalf("unexpected realtime payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal(timeoutMessage)
	}
}

func assertAppRealtimeTranscriptionClosed(t *testing.T, closed <-chan error) {
	t.Helper()

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal realtime close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

func TestAppServesRealtimeTranscriptionSessionRoutes(t *testing.T) {
	// The real IDE app should own realtime transcription session lifecycle and
	// stream incremental transcript deltas through the bounded Go runtime.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "app-realtime-secret")

	provider := newAppRealtimeTranscriptionProvider(t)
	saveAppRealtimeTranscriptionConfig(t, cfg, provider.server.URL)
	server, authCookie := startAppTranscriptionServer(t, cfg)

	started := startAppRealtimeTranscriptionSession(t, server.URL, authCookie)
	appendAppRealtimeTranscriptionAudio(t, server.URL, authCookie, started.SessionID)
	close(provider.emitFinal)
	stopAppRealtimeTranscriptionSession(t, server.URL, authCookie, started.SessionID)

	assertAppRealtimeTranscriptionHandshake(t, provider.handshake)
	assertAppRealtimeTranscriptionUpdate(t, provider.update)
	assertAppRealtimeTranscriptionPayloadType(t, provider.append, "input_audio_buffer.append", "timed out waiting for realtime append payload")
	assertAppRealtimeTranscriptionPayloadType(t, provider.commit, "input_audio_buffer.commit", "timed out waiting for realtime commit payload")
	assertAppRealtimeTranscriptionClosed(t, provider.closed)
}

func readRealtimeProviderMessage(ctx context.Context, conn *websocket.Conn) (map[string]any, error) {
	_, payload, err := conn.Read(ctx)
	if err != nil {
		return nil, err
	}
	decoded := map[string]any{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}
