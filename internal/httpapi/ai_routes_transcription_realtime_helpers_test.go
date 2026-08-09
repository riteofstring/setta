package httpapi

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

	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"

	"github.com/coder/websocket"
)

type aiRouteFileProviderRequest struct {
	Path          string
	Authorization string
	Model         string
	Language      string
	FileSize      int
}

func newAIRouteFileTranscriptionProvider(t *testing.T) (*httptest.Server, <-chan aiRouteFileProviderRequest) {
	t.Helper()

	providerRequests := make(chan aiRouteFileProviderRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()
		fileBytes, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- aiRouteFileProviderRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Model:         r.FormValue("model"),
			Language:      r.FormValue("language"),
			FileSize:      len(fileBytes),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "hello from route"})
	}))
	t.Cleanup(server.Close)
	return server, providerRequests
}

func configureAIRouteFileTranscription(t *testing.T, fixture aiRouteFixture, providerURL string) {
	t.Helper()

	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				BaseURL:   providerURL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
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

func newAIRouteTranscriptionHandler(t *testing.T, fixture aiRouteFixture) http.Handler {
	t.Helper()

	return newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
}

func startAIRouteFileTranscriptionSession(t *testing.T, handler http.Handler) StartTranscriptionSessionResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file","language":"en"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile || started.ChunkMs != 0 {
		t.Fatalf("unexpected start payload %#v", started)
	}
	return started
}

func appendAIRouteFileTranscriptionAudio(t *testing.T, handler http.Handler, sessionID string) {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+sessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if payload.AppendText != "" || payload.IsFinal {
		t.Fatalf("unexpected append payload %#v", payload)
	}
}

func stopAIRouteFileTranscriptionSession(t *testing.T, handler http.Handler, sessionID string) {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+sessionID+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !payload.IsFinal || payload.FullText != "hello from route" || payload.AppendText != "hello from route" {
		t.Fatalf("unexpected stop payload %#v", payload)
	}
}

func assertAIRouteFileProviderRequest(t *testing.T, providerRequests <-chan aiRouteFileProviderRequest) {
	t.Helper()

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/audio/transcriptions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer route-secret" {
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

type aiRouteRealtimeHandshake struct {
	Path          string
	Query         string
	Authorization string
	OpenAIBeta    string
}

type aiRouteRealtimeProvider struct {
	server    *httptest.Server
	handshake chan aiRouteRealtimeHandshake
	update    chan map[string]any
	append    chan map[string]any
	commit    chan map[string]any
	closed    chan error
	emitFinal chan struct{}
}

func newAIRouteRealtimeProvider(t *testing.T) *aiRouteRealtimeProvider {
	t.Helper()

	provider := &aiRouteRealtimeProvider{
		handshake: make(chan aiRouteRealtimeHandshake, 1),
		update:    make(chan map[string]any, 1),
		append:    make(chan map[string]any, 1),
		commit:    make(chan map[string]any, 1),
		closed:    make(chan error, 1),
		emitFinal: make(chan struct{}),
	}
	provider.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provider.handshake <- aiRouteRealtimeHandshake{
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

		update, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		provider.update <- update
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}

		appendPayload, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		provider.append <- appendPayload

		commitPayload, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		provider.commit <- commitPayload

		if err := writeAIRouteRealtimeTranscriptEvents(context.Background(), conn); err != nil {
			return
		}
		<-provider.emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		provider.closed <- err
	}))
	t.Cleanup(provider.server.Close)
	return provider
}

func writeAIRouteRealtimeTranscriptEvents(ctx context.Context, conn *websocket.Conn) error {
	// The route-level caller should see additive delta output during append and final completion on stop.
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hel"}`)); err != nil {
		return err
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"lo"}`)); err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello"}`))
}

func configureAIRouteRealtimeTranscription(t *testing.T, fixture aiRouteFixture, providerURL string) {
	t.Helper()

	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
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
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}
}

func newAIRouteRealtimeTranscriptionHandler(t *testing.T, fixture aiRouteFixture) http.Handler {
	t.Helper()

	return newAIRouteTranscriptionHandler(t, fixture)
}

func startAIRouteRealtimeTranscriptionSession(t *testing.T, handler http.Handler) StartTranscriptionSessionResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime","language":"en"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected start payload %#v", started)
	}
	return started
}

func appendAIRouteRealtimeTranscriptionAudio(
	t *testing.T,
	handler http.Handler,
	sessionID string,
) TranscriptionSessionDeltaResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+sessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if payload.IsFinal || payload.AppendText != "hello" || payload.FullText != "hello" {
		t.Fatalf("unexpected append payload %#v", payload)
	}
	return payload
}

func appendAIRouteRealtimeTranscriptionAudioExpecting(
	t *testing.T,
	handler http.Handler,
	sessionID string,
	expectedAppendText string,
	expectedFullText string,
) TranscriptionSessionDeltaResponse {
	t.Helper()

	payload := appendAIRouteRealtimeTranscriptionAudioWithoutExpectation(t, handler, sessionID)
	if payload.IsFinal || payload.AppendText != expectedAppendText || payload.FullText != expectedFullText {
		t.Fatalf("unexpected append payload %#v", payload)
	}
	return payload
}

func appendAIRouteRealtimeTranscriptionAudioWithoutExpectation(
	t *testing.T,
	handler http.Handler,
	sessionID string,
) TranscriptionSessionDeltaResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+sessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	return payload
}

func stopAIRouteRealtimeTranscriptionSession(
	t *testing.T,
	handler http.Handler,
	sessionID string,
) TranscriptionSessionDeltaResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+sessionID+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !payload.IsFinal || payload.AppendText != " world" || payload.FullText != "hello world" {
		t.Fatalf("unexpected stop payload %#v", payload)
	}
	return payload
}

func stopAIRouteRealtimeTranscriptionSessionExpecting(
	t *testing.T,
	handler http.Handler,
	sessionID string,
	expectedAppendText string,
	expectedFullText string,
) TranscriptionSessionDeltaResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+sessionID+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !payload.IsFinal || payload.AppendText != expectedAppendText || payload.FullText != expectedFullText {
		t.Fatalf("unexpected stop payload %#v", payload)
	}
	return payload
}

func cancelAIRouteRealtimeTranscriptionSession(
	t *testing.T,
	handler http.Handler,
	sessionID string,
) CancelTranscriptionSessionResponse {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+sessionID+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}
	return payload
}

func newAIRouteOutOfOrderRealtimeTurnsServer(t *testing.T, emitFinal <-chan struct{}) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if !readAIRouteRealtimeProviderMessages(context.Background(), conn, 1) {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if !readAIRouteRealtimeProviderMessages(context.Background(), conn, 2) {
			return
		}
		if !writeAIRouteRealtimeProviderEvents(
			context.Background(),
			conn,
			`{"type":"input_audio_buffer.committed","event_id":"evt-1","item_id":"item-1"}`,
			`{"type":"input_audio_buffer.committed","event_id":"evt-2","item_id":"item-2","previous_item_id":"item-1"}`,
			`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-2","transcript":"world"}`,
		) {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	t.Cleanup(server.Close)
	return server
}

func newAIRouteCommitOrderingAfterTranscriptServer(t *testing.T, closed chan<- error) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if !readAIRouteRealtimeProviderMessages(context.Background(), conn, 1) {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if !readAIRouteRealtimeProviderMessages(context.Background(), conn, 2) {
			return
		}
		if !writeAIRouteRealtimeProviderEvents(
			context.Background(),
			conn,
			`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-2","transcript":"world"}`,
			`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`,
			`{"type":"input_audio_buffer.committed","event_id":"evt-3","item_id":"item-1"}`,
			`{"type":"input_audio_buffer.committed","event_id":"evt-4","item_id":"item-2","previous_item_id":"item-1"}`,
		) {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	t.Cleanup(server.Close)
	return server
}

func newAIRouteKnownPreviousWithoutParentServer(t *testing.T, closed chan<- error) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if !readAIRouteRealtimeProviderMessages(context.Background(), conn, 1) {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if !readAIRouteRealtimeProviderMessages(context.Background(), conn, 2) {
			return
		}
		if !writeAIRouteRealtimeProviderEvents(
			context.Background(),
			conn,
			`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-2","transcript":"world"}`,
			`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`,
			`{"type":"input_audio_buffer.committed","event_id":"evt-3","item_id":"item-2","previous_item_id":"item-1"}`,
		) {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	t.Cleanup(server.Close)
	return server
}

func readAIRouteRealtimeProviderMessages(ctx context.Context, conn *websocket.Conn, count int) bool {
	for range count {
		if _, err := readAIRouteRealtimeProviderMessage(ctx, conn); err != nil {
			return false
		}
	}
	return true
}

func writeAIRouteRealtimeProviderEvents(ctx context.Context, conn *websocket.Conn, events ...string) bool {
	for _, event := range events {
		if err := conn.Write(ctx, websocket.MessageText, []byte(event)); err != nil {
			return false
		}
	}
	return true
}

func assertAIRouteRealtimeHandshake(t *testing.T, handshakes <-chan aiRouteRealtimeHandshake) {
	t.Helper()

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected provider query %q", captured.Query)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime provider handshake")
	}
}

func assertAIRouteRealtimeUpdate(t *testing.T, updates <-chan map[string]any) {
	t.Helper()

	select {
	case payload := <-updates:
		if payload["type"] != "transcription_session.update" {
			t.Fatalf("unexpected session update payload %#v", payload)
		}
		if payload["input_audio_format"] != "pcm16" {
			t.Fatalf("unexpected audio input format %#v", payload)
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

func assertAIRouteRealtimeAppend(t *testing.T, appends <-chan map[string]any) {
	t.Helper()

	select {
	case payload := <-appends:
		if payload["type"] != "input_audio_buffer.append" {
			t.Fatalf("unexpected append payload %#v", payload)
		}
		audio, _ := payload["audio"].(string)
		decoded, err := base64.StdEncoding.DecodeString(audio)
		if err != nil {
			t.Fatalf("decode appended audio: %v", err)
		}
		if string(decoded) != string([]byte{0x00, 0x00, 0x01, 0x00}) {
			t.Fatalf("unexpected appended audio %#v", decoded)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime append payload")
	}
}

func assertAIRouteRealtimeCommit(t *testing.T, commits <-chan map[string]any) {
	t.Helper()

	select {
	case payload := <-commits:
		if payload["type"] != "input_audio_buffer.commit" {
			t.Fatalf("unexpected commit payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime commit payload")
	}
}

func assertAIRouteRealtimeClosed(t *testing.T, closed <-chan error) {
	t.Helper()

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime websocket close")
	}
}
