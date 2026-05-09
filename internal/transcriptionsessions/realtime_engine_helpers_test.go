package transcriptionsessions

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/coder/websocket"

	"setta/internal/llmconfig"
	"setta/internal/transcriptionprofiles"
)

type rewriteRequestTransport struct {
	base   http.RoundTripper
	target *url.URL
}

func (t rewriteRequestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	rewrittenURL := *clone.URL
	clone.URL = &rewrittenURL
	clone.URL.Scheme = t.target.Scheme
	clone.URL.Host = t.target.Host
	return t.base.RoundTrip(clone)
}

type realtimeTranscriptionHandshake struct {
	Path          string
	Query         string
	Authorization string
	OpenAIBeta    string
}

type realtimeTranscriptionProvider struct {
	server      *httptest.Server
	handshake   chan realtimeTranscriptionHandshake
	update      chan map[string]any
	append      chan map[string]any
	commit      chan map[string]any
	closed      chan error
	emitFinal   chan struct{}
	firstDelta  string
	secondDelta string
	finalText   string
}

func newRealtimeTranscriptionProvider(t *testing.T) *realtimeTranscriptionProvider {
	t.Helper()

	provider := &realtimeTranscriptionProvider{
		handshake:   make(chan realtimeTranscriptionHandshake, 1),
		update:      make(chan map[string]any, 1),
		append:      make(chan map[string]any, 1),
		commit:      make(chan map[string]any, 1),
		closed:      make(chan error, 1),
		emitFinal:   make(chan struct{}),
		firstDelta:  "hel",
		secondDelta: "lo",
		finalText:   "world",
	}
	provider.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provider.handshake <- realtimeTranscriptionHandshake{
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

		if err := writeRealtimeTranscriptionEvents(context.Background(), conn, provider.firstDelta, provider.secondDelta); err != nil {
			return
		}
		<-provider.emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-2","transcript":"`+provider.finalText+`"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		provider.closed <- err
	}))
	t.Cleanup(provider.server.Close)
	return provider
}

func writeRealtimeTranscriptionEvents(ctx context.Context, conn *websocket.Conn, firstDelta string, secondDelta string) error {
	// Realtime transcribe models stream additive delta events before the final item completion.
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"`+firstDelta+`"}`)); err != nil {
		return err
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"`+secondDelta+`"}`)); err != nil {
		return err
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"`+secondDelta+`"}`)); err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello"}`))
}

func assertRealtimeTranscriptionHandshake(t *testing.T, handshakes <-chan realtimeTranscriptionHandshake, token string) {
	t.Helper()

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected realtime path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected realtime query %q", captured.Query)
		}
		if captured.Authorization != "Bearer "+token {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime handshake")
	}
}

func assertRealtimeTranscriptionUpdate(t *testing.T, updates <-chan map[string]any) {
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
		noiseReductionPayload, ok := payload["input_audio_noise_reduction"].(map[string]any)
		if !ok || noiseReductionPayload["type"] != "near_field" {
			t.Fatalf("expected explicit near-field noise reduction, got %#v", payload)
		}
		turnDetection, ok := payload["turn_detection"]
		if !ok || turnDetection != nil {
			t.Fatalf("expected explicit null turn_detection for manual commits, got %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for session update")
	}
}

func assertRealtimeTranscriptionAppend(t *testing.T, appends <-chan map[string]any, expectedAudio []byte) {
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
		if string(decoded) != string(expectedAudio) {
			t.Fatalf("unexpected appended bytes %#v", decoded)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for append payload")
	}
}

func assertRealtimeTranscriptionCommit(t *testing.T, commits <-chan map[string]any) {
	t.Helper()

	select {
	case payload := <-commits:
		if payload["type"] != "input_audio_buffer.commit" {
			t.Fatalf("unexpected commit payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for commit payload")
	}
}

func assertRealtimeTranscriptionClosed(t *testing.T, closed <-chan error) {
	t.Helper()

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

func assertRealtimeClosedSignal(t *testing.T, closed <-chan struct{}) {
	t.Helper()

	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

type realtimeRequestScript func(context.Context, *http.Request, *websocket.Conn) error

func newRealtimeScriptServer(t *testing.T, script func(context.Context, *websocket.Conn) error) *httptest.Server {
	t.Helper()

	return newRealtimeRequestScriptServer(t, false, func(ctx context.Context, _ *http.Request, conn *websocket.Conn) error {
		return script(ctx, conn)
	})
}

func newRealtimeRequestScriptServer(t *testing.T, tls bool, script realtimeRequestScript) *httptest.Server {
	t.Helper()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		_ = script(context.Background(), r, conn)
	})
	if tls {
		server := httptest.NewTLSServer(handler)
		t.Cleanup(server.Close)
		return server
	}
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server
}

func readRealtimeProviderMessages(ctx context.Context, conn *websocket.Conn, count int) error {
	for i := 0; i < count; i++ {
		if _, err := readRealtimeProviderMessage(ctx, conn); err != nil {
			return err
		}
	}
	return nil
}

func writeRealtimeMessages(ctx context.Context, conn *websocket.Conn, messages ...string) error {
	for _, message := range messages {
		if err := conn.Write(ctx, websocket.MessageText, []byte(message)); err != nil {
			return err
		}
	}
	return nil
}

func writeRealtimeReadyAndDrainAudio(ctx context.Context, conn *websocket.Conn, readyMessage string) error {
	if err := readRealtimeProviderMessages(ctx, conn, 1); err != nil {
		return err
	}
	if err := writeRealtimeMessages(ctx, conn, readyMessage); err != nil {
		return err
	}
	return readRealtimeProviderMessages(ctx, conn, 2)
}

func runRealtimeAudioScript(ctx context.Context, conn *websocket.Conn, readyMessage string, messages ...string) error {
	if err := writeRealtimeReadyAndDrainAudio(ctx, conn, readyMessage); err != nil {
		return err
	}
	if err := writeRealtimeMessages(ctx, conn, messages...); err != nil {
		return err
	}
	_, _, _ = conn.Read(ctx)
	return nil
}

func runRealtimeAudioScriptUntilCloseGate(
	ctx context.Context,
	conn *websocket.Conn,
	readyMessage string,
	allowClose <-chan struct{},
	closed chan<- struct{},
	messages ...string,
) error {
	if err := writeRealtimeReadyAndDrainAudio(ctx, conn, readyMessage); err != nil {
		return err
	}
	if err := writeRealtimeMessages(ctx, conn, messages...); err != nil {
		return err
	}
	<-allowClose
	_ = conn.Close(websocket.StatusNormalClosure, "")
	closed <- struct{}{}
	return nil
}

func runRealtimeAudioScriptWithFinalGate(
	ctx context.Context,
	conn *websocket.Conn,
	readyMessage string,
	emitFinal <-chan struct{},
	beforeFinal []string,
	afterFinal []string,
) error {
	if err := writeRealtimeReadyAndDrainAudio(ctx, conn, readyMessage); err != nil {
		return err
	}
	if err := writeRealtimeMessages(ctx, conn, beforeFinal...); err != nil {
		return err
	}
	<-emitFinal
	if err := writeRealtimeMessages(ctx, conn, afterFinal...); err != nil {
		return err
	}
	_, _, _ = conn.Read(ctx)
	return nil
}

func newOpenAIRealtimeService(
	t *testing.T,
	server *httptest.Server,
	configID string,
	model string,
	sessionID string,
) (*Service, *llmconfig.Runtime) {
	t.Helper()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		configID: {
			ID:        configID,
			Model:     model,
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	return newRealtimeService(t, runtime, server.Client(), sessionID), runtime
}

func newRealtimeService(t *testing.T, runtime *llmconfig.Runtime, httpClient *http.Client, sessionID string) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: httpClient,
		NewID: func() string {
			return sessionID
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func startSupportedRealtimeSession(
	t *testing.T,
	service *Service,
	runtime *llmconfig.Runtime,
	configID string,
	label string,
	language *string,
) StartResult {
	t.Helper()

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, configID)
	resolved.Profile.SupportsRealtimeTranscription = transcriptionprofiles.SupportsRealtimeTranscriptionConfig(*resolved.LLMConfig)
	if !resolved.Profile.SupportsRealtimeTranscription {
		t.Fatalf("expected %s to advertise realtime support", resolved.LLMConfig.Model)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
		Language:        language,
	})
	if err != nil {
		t.Fatalf("start %s session: %v", label, err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected %s start result %#v", label, started)
	}
	return started
}

func appendDefaultRealtimeAudio(t *testing.T, service *Service, sessionID string, label string) Delta {
	t.Helper()

	result, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    sessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append %s audio: %v", label, err)
	}
	return result
}

func stopRealtimeSession(t *testing.T, service *Service, sessionID string, label string) Delta {
	t.Helper()

	result, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: sessionID,
	})
	if err != nil {
		t.Fatalf("stop %s session: %v", label, err)
	}
	return result
}

func assertRealtimeDelta(t *testing.T, got Delta, wantAppendText string, wantFullText string, wantFinal bool, label string) {
	t.Helper()

	if got.AppendText != wantAppendText || got.FullText != wantFullText || got.IsFinal != wantFinal {
		t.Fatalf("unexpected %s result %#v", label, got)
	}
}
