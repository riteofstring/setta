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

func TestServiceStartAppendStopStreamsRealtimeTranscription(t *testing.T) {
	t.Parallel()

	provider := newRealtimeTranscriptionProvider(t)
	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:        "openai-realtime",
			Model:     "gpt-4o-mini-transcribe",
			Provider:  "openai",
			BaseURL:   provider.server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: provider.server.Client(),
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
	assertRealtimeTranscriptionHandshake(t, provider.handshake, "secret-key")
	assertRealtimeTranscriptionUpdate(t, provider.update)

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
	assertRealtimeTranscriptionAppend(t, provider.append, []byte{0x00, 0x00, 0x10, 0x00})
	assertRealtimeTranscriptionCommit(t, provider.commit)

	close(provider.emitFinal)
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
	assertRealtimeTranscriptionClosed(t, provider.closed)
}

func TestServiceStartAppendStopStreamsRealtimeTranscriptionTranscriptTextEvents(t *testing.T) {
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcript.text.delta","event_id":"evt-1","delta":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcript.text.done","event_id":"evt-2","text":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcript.text.delta","event_id":"evt-3","delta":"world"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcript.text.done","event_id":"evt-4","text":"hello world"}`)); err != nil {
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
			return "session-realtime-transcript-text"
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
		t.Fatalf("start realtime transcript-text session: %v", err)
	}

	appendResult, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append realtime transcript-text audio: %v", err)
	}
	if appendResult.AppendText != "hello" || appendResult.FullText != "hello" || appendResult.IsFinal {
		t.Fatalf("unexpected transcript-text append result %#v", appendResult)
	}

	close(emitFinal)
	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop realtime transcript-text session: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != " world" || stopped.FullText != "hello world" {
		t.Fatalf("unexpected transcript-text stop result %#v", stopped)
	}
}

func TestResolveRealtimeEndpointUsesTranscriptionIntentQuery(t *testing.T) {
	t.Parallel()

	endpoint, err := resolveRealtimeEndpoint(llmconfig.Config{
		Model:   "gpt-4o-mini-transcribe",
		BaseURL: "https://example.test/v1",
	})
	if err != nil {
		t.Fatalf("resolveRealtimeEndpoint: %v", err)
	}

	parsed, err := url.Parse(endpoint)
	if err != nil {
		t.Fatalf("parse endpoint: %v", err)
	}
	if parsed.Scheme != "wss" {
		t.Fatalf("unexpected endpoint scheme %q", parsed.Scheme)
	}
	if parsed.Path != "/v1/realtime" {
		t.Fatalf("unexpected endpoint path %q", parsed.Path)
	}
	if parsed.RawQuery != "intent=transcription" {
		t.Fatalf("unexpected endpoint query %q", parsed.RawQuery)
	}
}

func TestBuildOpenAIRealtimeSessionUpdateUsesTranscriptionSessionShape(t *testing.T) {
	t.Parallel()

	content, err := json.Marshal(buildOpenAIRealtimeSessionUpdate(" gpt-4o-mini-transcribe ", stringPtr(" en ")))
	if err != nil {
		t.Fatalf("marshal realtime session update: %v", err)
	}

	decoded := map[string]any{}
	if err := json.Unmarshal(content, &decoded); err != nil {
		t.Fatalf("decode realtime session update: %v", err)
	}
	if decoded["type"] != "transcription_session.update" {
		t.Fatalf("unexpected session update payload %#v", decoded)
	}
	if decoded["input_audio_format"] != "pcm16" {
		t.Fatalf("unexpected input audio format %#v", decoded)
	}
	if _, ok := decoded["session"]; ok {
		t.Fatalf("unexpected legacy nested session payload %#v", decoded)
	}
	transcriptionPayload, ok := decoded["input_audio_transcription"].(map[string]any)
	if !ok {
		t.Fatalf("expected transcription payload, got %#v", decoded)
	}
	if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
		t.Fatalf("unexpected transcription payload %#v", transcriptionPayload)
	}
	noiseReductionPayload, ok := decoded["input_audio_noise_reduction"].(map[string]any)
	if !ok || noiseReductionPayload["type"] != "near_field" {
		t.Fatalf("expected explicit near-field noise reduction, got %#v", decoded)
	}
	turnDetection, ok := decoded["turn_detection"]
	if !ok || turnDetection != nil {
		t.Fatalf("expected explicit null turn_detection for manual commits, got %#v", decoded)
	}
}

func TestServiceAppendAudioRejectsRealtimeStereoInput(t *testing.T) {
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
			return "session-realtime-stereo"
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

	// Realtime sessions are provider-constrained to mono PCM16, so stereo input must fail locally.
	_, err = service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x01, 0x00},
		SampleRateHz: 24_000,
		Channels:     2,
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid request, got %v", err)
	}
	if err.Error() != "Realtime transcription requires mono PCM16 audio." {
		t.Fatalf("unexpected error message %q", err.Error())
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

func TestServiceAppendAudioRejectsRealtimeNon24kInput(t *testing.T) {
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
			return "session-realtime-rate"
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

	// Realtime provider input is fixed at 24kHz PCM16, so mismatched sample rates must fail before write.
	_, err = service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x01, 0x00},
		SampleRateHz: 16_000,
		Channels:     1,
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid request, got %v", err)
	}
	if err.Error() != "Realtime transcription requires 24kHz PCM16 audio." {
		t.Fatalf("unexpected error message %q", err.Error())
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
		if captured.Query != "intent=transcription" {
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

func TestRealtimeEngineTranscriptTextEventsMaintainAuthoritativeFullText(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		processedEventIDs: map[string]struct{}{},
	}

	firstAppendText, err := engine.handleEvent(
		[]byte(`{"type":"transcript.text.delta","event_id":"evt-1","delta":"hello"}`),
	)
	if err != nil {
		t.Fatalf("handle first transcript delta: %v", err)
	}
	if firstAppendText != "hello" || engine.fullText != "hello" {
		t.Fatalf("unexpected first transcript delta append=%q full=%q", firstAppendText, engine.fullText)
	}

	secondAppendText, err := engine.handleEvent(
		[]byte(`{"type":"transcript.text.delta","event_id":"evt-2","delta":"world"}`),
	)
	if err != nil {
		t.Fatalf("handle second transcript delta: %v", err)
	}
	if secondAppendText != " world" || engine.fullText != "hello world" {
		t.Fatalf("unexpected second transcript delta append=%q full=%q", secondAppendText, engine.fullText)
	}

	finalAppendText, err := engine.handleEvent(
		[]byte(`{"type":"transcript.text.done","event_id":"evt-3","text":"hello world"}`),
	)
	if err != nil {
		t.Fatalf("handle transcript done: %v", err)
	}
	if finalAppendText != "" || engine.fullText != "hello world" {
		t.Fatalf("unexpected transcript done append=%q full=%q", finalAppendText, engine.fullText)
	}
}

func TestRealtimeEngineTranscriptTextDoneRepairsNonPrefixDelta(t *testing.T) {
	t.Parallel()

	engine := &realtimeEngine{
		processedEventIDs: map[string]struct{}{},
	}

	appendText, err := engine.handleEvent(
		[]byte(`{"type":"transcript.text.delta","event_id":"evt-1","delta":"hello wurld"}`),
	)
	if err != nil {
		t.Fatalf("handle transcript delta: %v", err)
	}
	if appendText != "hello wurld" || engine.fullText != "hello wurld" {
		t.Fatalf("unexpected transcript delta append=%q full=%q", appendText, engine.fullText)
	}

	finalAppendText, err := engine.handleEvent(
		[]byte(`{"type":"transcript.text.done","event_id":"evt-2","text":"hello world"}`),
	)
	if err != nil {
		t.Fatalf("handle repaired transcript done: %v", err)
	}
	if finalAppendText != "" || engine.fullText != "hello world" {
		t.Fatalf("unexpected repaired transcript done append=%q full=%q", finalAppendText, engine.fullText)
	}
}

func TestResolveOpenAIRealtimeDeltaModeMatchesDocumentedModelBehavior(t *testing.T) {
	t.Parallel()

	// Keep the runtime model branches aligned with the local OpenAI dependency
	// notes, which document which supported realtime transcription models emit
	// snapshot vs incremental delta events.
	tests := []struct {
		name  string
		model string
		want  openAIRealtimeDeltaMode
	}{
		{name: "whisper snapshots", model: "whisper-1", want: openAIRealtimeDeltaModeSnapshot},
		{name: "gpt-4o transcribe incremental", model: "gpt-4o-transcribe", want: openAIRealtimeDeltaModeIncremental},
		{name: "gpt-4o mini transcribe incremental", model: "gpt-4o-mini-transcribe", want: openAIRealtimeDeltaModeIncremental},
		{name: "gpt-4o transcribe latest incremental", model: "gpt-4o-transcribe-latest", want: openAIRealtimeDeltaModeIncremental},
		{name: "sdk dated alias stays disabled", model: "gpt-4o-mini-transcribe-2025-12-15", want: openAIRealtimeDeltaModeDisabled},
		{name: "unsupported model disabled", model: "gpt-realtime", want: openAIRealtimeDeltaModeDisabled},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := resolveOpenAIRealtimeDeltaMode(tt.model); got != tt.want {
				t.Fatalf("resolveOpenAIRealtimeDeltaMode(%q) = %v, want %v", tt.model, got, tt.want)
			}
		})
	}
}

func TestRebuildOpenAIRealtimeItemOrderUsesKnownFallbackParent(t *testing.T) {
	t.Parallel()

	parentID := "item-1"
	ordered := rebuildOpenAIRealtimeItemOrder(
		[]string{"item-2"},
		map[string]*string{
			"item-2": &parentID,
		},
		[]string{"item-2", "item-1"},
	)
	if got, want := ordered, []string{"item-1", "item-2"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("unexpected item order %v, want %v", got, want)
	}
}

func TestRebuildOpenAIRealtimeItemOrderUsesKnownFallbackAncestorChain(t *testing.T) {
	t.Parallel()

	parentID := "item-2"
	rootID := "item-1"
	ordered := rebuildOpenAIRealtimeItemOrder(
		[]string{"item-3"},
		map[string]*string{
			"item-3": &parentID,
			"item-2": &rootID,
		},
		[]string{"item-3", "item-2", "item-1"},
	)
	if got, want := ordered, []string{"item-1", "item-2", "item-3"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("unexpected item order %v, want %v", got, want)
	}
}

func TestRebuildOpenAIRealtimeItemOrderPreservesCommittedSiblingOrder(t *testing.T) {
	t.Parallel()

	parentID := "item-1"
	ordered := rebuildOpenAIRealtimeItemOrder(
		[]string{"item-3", "item-2"},
		map[string]*string{
			"item-3": &parentID,
			"item-2": &parentID,
		},
		[]string{"item-1", "item-2", "item-3"},
	)
	if got, want := ordered, []string{"item-1", "item-3", "item-2"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("unexpected item order %v, want %v", got, want)
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
