package transcriptionsessions

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}

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

		// Realtime transcribe models stream additive delta events before the final item completion.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hel"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"lo"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"lo"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-2","transcript":"world"}`)); err != nil {
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
		if payload["type"] != "session.update" {
			t.Fatalf("unexpected session update payload %#v", payload)
		}
		sessionPayload, ok := payload["session"].(map[string]any)
		if !ok {
			t.Fatalf("expected session payload, got %#v", payload)
		}
		audioPayload, ok := sessionPayload["audio"].(map[string]any)
		if !ok {
			t.Fatalf("expected audio payload, got %#v", sessionPayload)
		}
		inputPayload, ok := audioPayload["input"].(map[string]any)
		if !ok {
			t.Fatalf("expected audio input payload, got %#v", audioPayload)
		}
		formatPayload, ok := inputPayload["format"].(map[string]any)
		if !ok {
			t.Fatalf("expected audio input format payload, got %#v", inputPayload)
		}
		if formatPayload["type"] != "audio/pcm" || formatPayload["rate"] != float64(24000) {
			t.Fatalf("unexpected audio input format %#v", formatPayload)
		}
		transcriptionPayload, ok := inputPayload["transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected transcription payload, got %#v", inputPayload)
		}
		if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
			t.Fatalf("unexpected transcription payload %#v", transcriptionPayload)
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

func TestServiceRealtimeAllowsDefaultOpenAIProviderWhenProviderUnset(t *testing.T) {
	t.Parallel()

	type handshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan handshake, 1)
	allowClose := make(chan struct{})
	closed := make(chan struct{}, 1)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-allowClose
		_ = conn.Close(websocket.StatusNormalClosure, "")
		closed <- struct{}{}
	}))
	defer server.Close()
	targetURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server URL: %v", err)
	}
	httpClient := server.Client()
	httpClient.Transport = rewriteRequestTransport{
		base:   httpClient.Transport,
		target: targetURL,
	}

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-default": {
			ID:        "openai-default",
			Model:     "gpt-4o-mini-transcribe",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: httpClient,
		NewID: func() string {
			return "session-realtime-default-openai"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-default")
	resolved.Profile.SupportsRealtimeTranscription = transcriptionprofiles.SupportsRealtimeTranscriptionConfig(*resolved.LLMConfig)
	if !resolved.Profile.SupportsRealtimeTranscription {
		t.Fatal("expected unset-provider OpenAI config to advertise realtime support")
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if err != nil {
		t.Fatalf("start realtime session with unset provider: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime {
		t.Fatalf("expected realtime transport, got %#v", started)
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

	appendResult, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append realtime audio with unset provider: %v", err)
	}
	if appendResult.AppendText != "hello" || appendResult.FullText != "hello" || appendResult.IsFinal {
		t.Fatalf("unexpected append result %#v", appendResult)
	}

	close(allowClose)
	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop realtime session with unset provider: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != "" || stopped.FullText != "hello" {
		t.Fatalf("unexpected stop result %#v", stopped)
	}

	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

func TestServiceRealtimeIgnoresAmbientOpenAIEnvWithoutConfiguredAPIKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "ambient-secret")

	type handshake struct {
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan handshake, 1)
	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handshakes <- handshake{
			Authorization: r.Header.Get("Authorization"),
			OpenAIBeta:    r.Header.Get("OpenAI-Beta"),
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-mini-transcribe",
			Provider: "openai",
			BaseURL:  server.URL + "/v1",
		},
	}, map[string]string{})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: server.Client(),
		NewID: func() string {
			return "session-realtime-no-ambient-auth"
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
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime {
		t.Fatalf("unexpected realtime start result %#v", started)
	}

	select {
	case captured := <-handshakes:
		if captured.Authorization != "" {
			t.Fatalf("expected no authorization header, got %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime handshake")
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
		t.Fatal("timed out waiting for realtime close")
	}
}

func TestServiceStartAppendStopSupportsOpenAITranscribeLatest(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hel"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime-latest": {
			ID:        "openai-realtime-latest",
			Model:     "gpt-4o-transcribe-latest",
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
			return "session-realtime-latest"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime-latest")
	resolved.Profile.SupportsRealtimeTranscription = transcriptionprofiles.SupportsRealtimeTranscriptionConfig(*resolved.LLMConfig)
	if !resolved.Profile.SupportsRealtimeTranscription {
		t.Fatal("expected gpt-4o-transcribe-latest to advertise realtime support")
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if err != nil {
		t.Fatalf("start realtime latest session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected realtime latest start result %#v", started)
	}

	appendResult, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append realtime latest audio: %v", err)
	}
	if appendResult.AppendText != "hello" || appendResult.FullText != "hello" || appendResult.IsFinal {
		t.Fatalf("unexpected realtime latest append result %#v", appendResult)
	}

	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop realtime latest session: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != "" || stopped.FullText != "hello" {
		t.Fatalf("unexpected realtime latest stop result %#v", stopped)
	}
}

func TestServiceStartAppendStopSupportsWhisperRealtimeTranscription(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		// Whisper-style realtime deltas are full snapshots, so the second delta
		// replaces the first item transcript instead of appending to it.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"hello there"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello there"}`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime-whisper": {
			ID:        "openai-realtime-whisper",
			Model:     "whisper-1",
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
			return "session-realtime-whisper"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime-whisper")
	resolved.Profile.SupportsRealtimeTranscription = transcriptionprofiles.SupportsRealtimeTranscriptionConfig(*resolved.LLMConfig)
	if !resolved.Profile.SupportsRealtimeTranscription {
		t.Fatal("expected whisper-1 to advertise realtime support")
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if err != nil {
		t.Fatalf("start realtime whisper session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected realtime whisper start result %#v", started)
	}

	appendResult, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append realtime whisper audio: %v", err)
	}
	if appendResult.AppendText != "hello there" || appendResult.FullText != "hello there" || appendResult.IsFinal {
		t.Fatalf("unexpected realtime whisper append result %#v", appendResult)
	}

	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop realtime whisper session: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != "" || stopped.FullText != "hello there" {
		t.Fatalf("unexpected realtime whisper stop result %#v", stopped)
	}
}

func TestRealtimeEngineWhisperDeltaSnapshotsReplaceItemTranscript(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		deltaMode:         openAIRealtimeDeltaModeSnapshot,
		itemTexts:         map[string]string{},
		processedEventIDs: map[string]struct{}{},
	}

	// Whisper-style realtime deltas are full-item snapshots, so each delta replaces the prior item text.
	firstAppendText, err := engine.handleEvent(
		[]byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hello"}`),
	)
	if err != nil {
		t.Fatalf("handle first whisper delta: %v", err)
	}
	if firstAppendText != "hello" || engine.fullText != "hello" {
		t.Fatalf("unexpected first whisper delta result append=%q full=%q", firstAppendText, engine.fullText)
	}

	secondAppendText, err := engine.handleEvent(
		[]byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"hello there"}`),
	)
	if err != nil {
		t.Fatalf("handle second whisper delta: %v", err)
	}
	if secondAppendText != " there" || engine.fullText != "hello there" {
		t.Fatalf("unexpected second whisper delta result append=%q full=%q", secondAppendText, engine.fullText)
	}

	finalAppendText, err := engine.handleEvent(
		[]byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello there"}`),
	)
	if err != nil {
		t.Fatalf("handle whisper completed event: %v", err)
	}
	if finalAppendText != "" || engine.fullText != "hello there" {
		t.Fatalf("unexpected whisper completion result append=%q full=%q", finalAppendText, engine.fullText)
	}
}

func TestRealtimeEngineDrainEventsUsesFixedDeadlineDespiteIgnoredEvents(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		events:            make(chan realtimeReadResult, 32),
		processedEventIDs: map[string]struct{}{},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	type drainResult struct {
		appendText string
		err        error
	}
	done := make(chan drainResult, 1)
	go func() {
		appendText, err := engine.drainEvents(ctx, 10*time.Millisecond, false)
		done <- drainResult{appendText: appendText, err: err}
	}()

	ticker := time.NewTicker(2 * time.Millisecond)
	defer ticker.Stop()
	eventID := 0
	for {
		select {
		case result := <-done:
			if result.err != nil {
				t.Fatalf("expected fixed deadline to expire before context, got %v", result.err)
			}
			if result.appendText != "" {
				t.Fatalf("expected empty append text, got %q", result.appendText)
			}
			return
		case <-ticker.C:
			eventID++
			engine.events <- realtimeReadResult{
				payload: []byte(fmt.Sprintf(`{"type":"session.created","event_id":"evt-%d"}`, eventID)),
			}
		}
	}
}

func TestRealtimeEngineDrainStartupEventsTimesOutDespiteIgnoredEventsBeforeAck(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		events:            make(chan realtimeReadResult, 32),
		processedEventIDs: map[string]struct{}{},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- engine.drainStartupEvents(ctx, 10*time.Millisecond)
	}()

	ticker := time.NewTicker(2 * time.Millisecond)
	defer ticker.Stop()
	eventID := 0
	for {
		select {
		case err := <-done:
			if !errors.Is(err, ErrProviderFailure) {
				t.Fatalf("expected provider failure timeout, got %v", err)
			}
			if err.Error() != defaultRealtimeProviderErrorMessage {
				t.Fatalf("unexpected provider failure message %q", err.Error())
			}
			return
		case <-ticker.C:
			eventID++
			engine.events <- realtimeReadResult{
				payload: []byte(fmt.Sprintf(`{"type":"session.created","event_id":"evt-%d"}`, eventID)),
			}
		}
	}
}

func TestRealtimeEngineDrainStartupEventsUsesFixedPostAckWindowDespiteIgnoredEvents(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		events:            make(chan realtimeReadResult, 32),
		processedEventIDs: map[string]struct{}{},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- engine.drainStartupEvents(ctx, 10*time.Millisecond)
	}()

	engine.events <- realtimeReadResult{
		payload: []byte(`{"type":"session.updated","event_id":"evt-ready"}`),
	}

	ticker := time.NewTicker(2 * time.Millisecond)
	defer ticker.Stop()
	eventID := 0
	for {
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("expected nil error after bounded post-ack drain, got %v", err)
			}
			return
		case <-ticker.C:
			eventID++
			engine.events <- realtimeReadResult{
				payload: []byte(fmt.Sprintf(`{"type":"session.created","event_id":"evt-%d"}`, eventID)),
			}
		}
	}
}

func TestRealtimeEngineDrainStartupEventsUsesFixedPostAckWindowDespiteRepeatedReadyEvents(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		events:            make(chan realtimeReadResult, 32),
		processedEventIDs: map[string]struct{}{},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- engine.drainStartupEvents(ctx, 10*time.Millisecond)
	}()

	engine.events <- realtimeReadResult{
		payload: []byte(`{"type":"session.updated","event_id":"evt-ready"}`),
	}

	ticker := time.NewTicker(2 * time.Millisecond)
	defer ticker.Stop()
	eventID := 0
	for {
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("expected nil error after bounded post-ack drain, got %v", err)
			}
			return
		case <-ticker.C:
			eventID++
			engine.events <- realtimeReadResult{
				payload: []byte(fmt.Sprintf(`{"type":"session.updated","event_id":"evt-ready-%d"}`, eventID)),
			}
		}
	}
}

func TestServiceStopSessionAcceptsCleanProviderCloseAfterFinalRealtimeEvent(t *testing.T) {
	t.Parallel()

	emitFinal := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}

		// The stop path should accept a normal provider close after the final transcript event.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
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
			return "session-realtime-close-ok"
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
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
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
	if appendResult.AppendText != "hello" || appendResult.FullText != "hello" || appendResult.IsFinal {
		t.Fatalf("unexpected append result %#v", appendResult)
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
}

func TestServiceAppendAudioFailsWhenRealtimeProviderReportsTranscriptionFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.failed","event_id":"evt-failed","error":{"message":"Realtime transcription chunk failed."}}`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
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
			return "session-realtime-append-failed"
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
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
	}

	_, err = service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != "Realtime transcription chunk failed." {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
}

func TestServiceStopSessionFailsWhenRealtimeProviderReportsTranscriptionFailureWithoutMessage(t *testing.T) {
	t.Parallel()

	emitFinal := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}

		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.failed","event_id":"evt-failed","error":{}}`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
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
			return "session-realtime-stop-failed"
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
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
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
	if appendResult.AppendText != "hello" || appendResult.FullText != "hello" || appendResult.IsFinal {
		t.Fatalf("unexpected append result %#v", appendResult)
	}

	close(emitFinal)
	_, err = service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != defaultRealtimeProviderErrorMessage {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
}

func TestServiceRealtimeStopUsesCommittedOrderingForOutOfOrderTurnCompletion(t *testing.T) {
	t.Parallel()

	emitFinal := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}

		// The provider can complete later turns before earlier ones; committed ordering metadata is the source of truth.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-1","item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-2","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
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
			return "session-realtime-ordered"
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
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
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
	if appendResult.AppendText != "world" || appendResult.FullText != "world" || appendResult.IsFinal {
		t.Fatalf("unexpected append result %#v", appendResult)
	}

	close(emitFinal)
	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop realtime session: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != "" || stopped.FullText != "hello world" {
		t.Fatalf("unexpected stop result %#v", stopped)
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
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

func TestServiceStartSessionAcceptsTranscriptionSessionUpdatedAck(t *testing.T) {
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
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
			return "session-transcription-session-updated-ack"
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
	})
	if err != nil {
		t.Fatalf("start realtime session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected realtime start result %#v", started)
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

func TestServiceAutoProfilesSurfacePlainTextRealtimeSetupFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("Realtime setup forbidden by provider."))
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
	if err.Error() != "Realtime setup forbidden by provider." {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
	if len(service.sessions) != 0 {
		t.Fatalf("expected no fallback session after realtime setup failure, got %d sessions", len(service.sessions))
	}
}

func TestServiceStartSessionFailsWhenRealtimeProviderRejectsSessionUpdate(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.created","event_id":"evt-created"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"error","event_id":"evt-error","error":{"message":"Realtime session update rejected."}}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
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
			return "session-realtime-start-error"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != "Realtime session update rejected." {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
	if len(service.sessions) != 0 {
		t.Fatalf("expected no stored session after realtime setup rejection, got %d sessions", len(service.sessions))
	}
}

func TestServiceStartSessionFailsWhenRealtimeProviderRejectsImmediatelyAfterSessionUpdated(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		// Some provider-side setup failures can land immediately after the update ack.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"error","event_id":"evt-error","error":{"message":"Realtime session became invalid after update."}}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
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
			return "session-realtime-start-post-ack-error"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != "Realtime session became invalid after update." {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
	if len(service.sessions) != 0 {
		t.Fatalf("expected no stored session after immediate post-ack rejection, got %d sessions", len(service.sessions))
	}
}

func TestServiceStartSessionFailsWhenRealtimeProviderNeverAcksStartup(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		// A realtime session is not usable until the provider acknowledges the update.
		time.Sleep(openAIRealtimeStartupDrainTimeout + 25*time.Millisecond)
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
			return "session-realtime-start-no-ack"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != defaultRealtimeProviderErrorMessage {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
	if len(service.sessions) != 0 {
		t.Fatalf("expected no stored session after missing startup ack, got %d sessions", len(service.sessions))
	}
}

func TestServiceStartSessionFailsWhenRealtimeProviderClosesWithExplicitReason(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		// Some provider-side setup rejections arrive as a websocket close frame instead of an error event.
		_ = conn.Close(websocket.StatusPolicyViolation, "Realtime session update rejected.")
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
			return "session-realtime-start-close-reason"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-rt", transcriptionprofiles.TransportModeRealtime, runtime, "openai-realtime")
	resolved.Profile.SupportsRealtimeTranscription = true
	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != "Realtime session update rejected." {
		t.Fatalf("unexpected provider failure message %q", err.Error())
	}
	if len(service.sessions) != 0 {
		t.Fatalf("expected no stored session after realtime close rejection, got %d sessions", len(service.sessions))
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
