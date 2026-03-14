package transcriptionsessions

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"

	"setta/internal/llmconfig"
	"setta/internal/transcriptionprofiles"
)

func TestServiceStartAppendStopStreamsRealtimeTranscription(t *testing.T) {
	t.Parallel()

	type handshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan handshake, 1)
	updates := make(chan map[string]any, 1)
	appends := make(chan map[string]any, 1)
	commits := make(chan map[string]any, 1)
	closed := make(chan error, 1)
	emitFinal := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handshakes <- handshake{
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
		updates <- update

		appendPayload, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		appends <- appendPayload

		commitPayload, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		commits <- commitPayload

		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:        "openai-realtime",
			Model:     "gpt-4o-mini-transcribe",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: server.Client(),
		NewID: func() string {
			return "session-realtime"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
		Language:        stringPtr(" en "),
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected realtime start result %#v", started)
	}

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected realtime path %q", captured.Path)
		}
		if captured.Query != "model=gpt-4o-mini-transcribe" {
			t.Fatalf("unexpected realtime query %q", captured.Query)
		}
		if captured.Authorization != "Bearer secret-key" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime handshake")
	}

	select {
	case payload := <-updates:
		if payload["type"] != "transcription_session.update" {
			t.Fatalf("unexpected session update payload %#v", payload)
		}
		sessionPayload, ok := payload["session"].(map[string]any)
		if !ok {
			t.Fatalf("expected session payload, got %#v", payload)
		}
		if sessionPayload["input_audio_format"] != "pcm16" {
			t.Fatalf("unexpected input_audio_format %#v", sessionPayload)
		}
		transcriptionPayload, ok := sessionPayload["input_audio_transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected input_audio_transcription payload, got %#v", sessionPayload)
		}
		if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
			t.Fatalf("unexpected input_audio_transcription %#v", transcriptionPayload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for session update")
	}

	appendResult, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append realtime audio: %v", err)
	}
	if appendResult.IsFinal || appendResult.AppendText != "hello" || appendResult.FullText != "hello" {
		t.Fatalf("unexpected append result %#v", appendResult)
	}

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
		if string(decoded) != string([]byte{0x00, 0x00, 0x10, 0x00}) {
			t.Fatalf("unexpected appended bytes %#v", decoded)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for append payload")
	}

	select {
	case payload := <-commits:
		if payload["type"] != "input_audio_buffer.commit" {
			t.Fatalf("unexpected commit payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for commit payload")
	}

	close(emitFinal)
	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop realtime session: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != " world" || stopped.FullText != "hello world" {
		t.Fatalf("unexpected stop result %#v", stopped)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

func TestServiceAutoProfilesResolveToRealtimeWhenConfigSupportsIt(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:        "openai-realtime",
			Model:     "gpt-4o-mini-transcribe",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: server.Client(),
		NewID: func() string {
			return "session-auto-realtime"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-auto", transcriptionprofiles.TransportModeAuto, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if err != nil {
		t.Fatalf("start auto session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected auto realtime result %#v", started)
	}
	if err := service.CancelSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	}); err != nil {
		t.Fatalf("cancel realtime session: %v", err)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestServiceAutoProfilesDoNotFallbackToFileWhenRealtimeSetupFails(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Realtime session setup failed."}}`))
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:        "openai-realtime",
			Model:     "gpt-4o-mini-transcribe",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: server.Client(),
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-auto", transcriptionprofiles.TransportModeAuto, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != "Realtime session setup failed." {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
	if len(service.sessions) != 0 {
		t.Fatalf("expected no fallback session after realtime setup failure, got %d sessions", len(service.sessions))
	}
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
