package transcriptionsessions

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/llmconfig"
	"setta/internal/transcriptionprofiles"
)

type blockingAppendEngine struct {
	started    chan struct{}
	release    chan struct{}
	closeCalls int
}

type closableEngine struct {
	closeCalls int
}

func (e *blockingAppendEngine) AppendAudio(context.Context, []byte, int, int) (Delta, error) {
	e.started <- struct{}{}
	<-e.release
	return Delta{}, nil
}

func (e *blockingAppendEngine) Stop(context.Context) (Delta, error) {
	return Delta{}, nil
}

func (e *blockingAppendEngine) Close() error {
	e.closeCalls++
	return nil
}

func (e *closableEngine) AppendAudio(context.Context, []byte, int, int) (Delta, error) {
	return Delta{}, nil
}

func (e *closableEngine) Stop(context.Context) (Delta, error) {
	return Delta{}, nil
}

func (e *closableEngine) Close() error {
	e.closeCalls++
	return nil
}

func TestResolveAPIKeyRejectsWhitespaceOnlyValues(t *testing.T) {
	t.Parallel()

	_, err := resolveAPIKey(map[string]string{
		"OPENAI_API_KEY": "   ",
	}, "OPENAI_API_KEY")
	if !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("expected missing api key error, got %v", err)
	}
	if err.Error() != "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
}

func TestResolveAPIKeyTrimsValues(t *testing.T) {
	t.Parallel()

	apiKey, err := resolveAPIKey(map[string]string{
		"OPENAI_API_KEY": "  trimmed-secret  ",
	}, "OPENAI_API_KEY")
	if err != nil {
		t.Fatalf("resolve api key: %v", err)
	}
	if apiKey != "trimmed-secret" {
		t.Fatalf("expected trimmed api key, got %q", apiKey)
	}
}

func TestServiceStartAppendStopUploadsBufferedFileTranscription(t *testing.T) {
	t.Parallel()

	type providerRequest struct {
		Path          string
		Authorization string
		Model         string
		Language      string
		FileName      string
		FileBytes     []byte
	}
	providerRequests := make(chan providerRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
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
		providerRequests <- providerRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Model:         r.FormValue("model"),
			Language:      r.FormValue("language"),
			FileName:      header.Filename,
			FileBytes:     fileBytes,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "hello from provider"})
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
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
			return "session-1"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
		Language:        stringPtr("en"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeFile || started.ChunkMs != 0 {
		t.Fatalf("unexpected start result %#v", started)
	}

	appendResult, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	if err != nil {
		t.Fatalf("append audio: %v", err)
	}
	if appendResult.IsFinal || appendResult.AppendText != "" || appendResult.FullText != "" {
		t.Fatalf("unexpected append result %#v", appendResult)
	}

	stopped, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if err != nil {
		t.Fatalf("stop session: %v", err)
	}
	if !stopped.IsFinal || stopped.AppendText != "hello from provider" || stopped.FullText != "hello from provider" {
		t.Fatalf("unexpected stop result %#v", stopped)
	}

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/audio/transcriptions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer secret-key" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.Model != "whisper-1" {
			t.Fatalf("unexpected model %q", captured.Model)
		}
		if captured.Language != "en" {
			t.Fatalf("unexpected language %q", captured.Language)
		}
		if captured.FileName != "dictation-window.wav" {
			t.Fatalf("unexpected filename %q", captured.FileName)
		}
		if len(captured.FileBytes) <= 44 || !strings.HasPrefix(string(captured.FileBytes[:4]), "RIFF") {
			t.Fatalf("expected RIFF wav payload, got %d bytes", len(captured.FileBytes))
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestServiceFileTranscriptionIgnoresAmbientOpenAIEnvWithoutConfiguredAPIKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "ambient-secret")

	type providerRequest struct {
		Authorization string
	}
	providerRequests := make(chan providerRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		providerRequests <- providerRequest{
			Authorization: r.Header.Get("Authorization"),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "hello"})
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
			BaseURL:  server.URL + "/v1",
		},
	}, map[string]string{})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		HTTPClient: server.Client(),
		NewID: func() string {
			return "session-no-auth"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	if _, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	}); err != nil {
		t.Fatalf("append audio: %v", err)
	}
	if _, err := service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	}); err != nil {
		t.Fatalf("stop session: %v", err)
	}

	select {
	case captured := <-providerRequests:
		if captured.Authorization != "" {
			t.Fatalf("expected no authorization header, got %q", captured.Authorization)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestServiceMapsOpenAIProviderMessageToTypedFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{
				"message": "Transcription request rejected by provider.",
				"type":    "invalid_request_error",
			},
		})
	}))
	defer server.Close()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
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
			return "session-provider-error"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	if _, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00, 0x10, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	}); err != nil {
		t.Fatalf("append audio: %v", err)
	}

	_, err = service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if !errors.Is(err, ErrProviderFailure) {
		t.Fatalf("expected provider failure, got %v", err)
	}
	if err.Error() != "Transcription request rejected by provider." {
		t.Fatalf("unexpected provider error %q", err.Error())
	}
}

func TestServiceStartRejectsInvalidTranscriptionBaseURL(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
			BaseURL:  "://bad-url",
		},
	}, map[string]string{})
	service, err := NewService(ServiceOptions{LLM: runtime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid request, got %v", err)
	}
	if err.Error() != "Transcription config is missing or invalid for this transcription profile." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
}

func TestServiceAutoProfilesResolveToFileMode(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM: runtime,
		NewID: func() string {
			return "session-auto"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeAuto, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeFile {
		t.Fatalf("expected auto profile to resolve to file, got %#v", started)
	}
}

func TestServiceAutoProfilesFallbackToFileForRealtimeCapabilitySetupFailures(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"input_audio_transcription is not supported for this model."}}`))
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
			return "session-auto-fallback"
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
		t.Fatalf("expected file fallback, got %v", err)
	}
	if started.ResolvedTransportMode != ResolvedTransportModeFile || started.ChunkMs != 0 {
		t.Fatalf("expected file-mode fallback result, got %#v", started)
	}
	if len(service.sessions) != 1 {
		t.Fatalf("expected one fallback session, got %d", len(service.sessions))
	}
}

func TestIsRealtimeFallbackErrorUsesStructuredStatusCodes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "bad request falls back",
			err:  newServiceErrorWithStatus(ErrProviderFailure, "provider rejected realtime setup", http.StatusBadRequest),
			want: true,
		},
		{
			name: "not found falls back",
			err:  newServiceErrorWithStatus(ErrProviderFailure, "provider rejected realtime setup", http.StatusNotFound),
			want: true,
		},
		{
			name: "unprocessable entity falls back",
			err:  newServiceErrorWithStatus(ErrProviderFailure, "provider rejected realtime setup", http.StatusUnprocessableEntity),
			want: true,
		},
		{
			name: "unauthorized does not fall back",
			err:  newServiceErrorWithStatus(ErrProviderFailure, "provider rejected realtime setup", http.StatusUnauthorized),
			want: false,
		},
		{
			name: "forbidden does not fall back",
			err:  newServiceErrorWithStatus(ErrProviderFailure, "provider rejected realtime setup", http.StatusForbidden),
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := isRealtimeFallbackError(tc.err)
			if got != tc.want {
				t.Fatalf("isRealtimeFallbackError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsRealtimeFallbackErrorDoesNotFallbackOnMissingAPIKey(t *testing.T) {
	t.Parallel()

	err := newServiceError(
		ErrMissingAPIKey,
		"Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys.",
	)
	if isRealtimeFallbackError(err) {
		t.Fatal("expected missing api key errors to fail closed without file fallback")
	}
}

func TestIsRealtimeFallbackErrorFallsBackOnCapabilityMessage(t *testing.T) {
	t.Parallel()

	err := newServiceError(
		ErrProviderFailure,
		"Realtime transcription is unavailable for this model.",
	)
	if !isRealtimeFallbackError(err) {
		t.Fatal("expected capability failure message to trigger file fallback")
	}
}

func TestServiceStartRejectsRealtimeProfilesWithUnsupportedModel(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-undocumented": {
			ID:        "openai-undocumented",
			Model:     "gpt-realtime",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{LLM: runtime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	resolved := resolvedProfile("profile-1", transcriptionprofiles.TransportModeRealtime, runtime, "openai-undocumented")
	resolved.Profile.SupportsRealtimeTranscription = transcriptionprofiles.SupportsRealtimeTranscriptionConfig(*resolved.LLMConfig)
	if resolved.Profile.SupportsRealtimeTranscription {
		t.Fatal("expected gpt-realtime to remain unsupported for realtime transcription")
	}

	_, err = service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolved,
	})
	if !errors.Is(err, ErrUnsupportedModel) {
		t.Fatalf("expected unsupported model, got %v", err)
	}
	if err.Error() != "Realtime transcription is unavailable for this provider/model." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
}

func TestServiceAppendRejectsCumulativeAudioLimit(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:                runtime,
		MaxPendingPCMBytes: 4,
		NewID: func() string {
			return "session-limit"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	if _, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	}); err != nil {
		t.Fatalf("first append: %v", err)
	}
	_, err = service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x01, 0x00, 0x02, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	})
	var limitErr *AudioLimitExceededError
	if !errors.As(err, &limitErr) {
		t.Fatalf("expected audio limit error, got %v", err)
	}
	if limitErr.MaxBytes != 4 {
		t.Fatalf("expected max bytes 4, got %d", limitErr.MaxBytes)
	}
}

func TestServiceFileAppendRejectsSampleRateChangeWithinSession(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM: runtime,
		NewID: func() string {
			return "session-sample-rate"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	// File sessions must lock sample rate on the first append so the buffered WAV upload stays coherent.
	if _, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	}); err != nil {
		t.Fatalf("first append: %v", err)
	}

	_, err = service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x01, 0x00},
		SampleRateHz: 16_000,
		Channels:     1,
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid request, got %v", err)
	}
	if err.Error() != "sampleRateHz cannot change within a transcription session." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
}

func TestServiceFileAppendRejectsChannelChangeWithinSession(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM: runtime,
		NewID: func() string {
			return "session-channels"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	// File sessions also lock channel count on first append for the same buffered-audio reason.
	if _, err := service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x00, 0x00},
		SampleRateHz: 24_000,
		Channels:     1,
	}); err != nil {
		t.Fatalf("first append: %v", err)
	}

	_, err = service.AppendAudio(context.Background(), AppendRequest{
		ScopeID:      "scope-1",
		SessionID:    started.SessionID,
		AudioPCM16:   []byte{0x01, 0x00, 0x02, 0x00},
		SampleRateHz: 24_000,
		Channels:     2,
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid request, got %v", err)
	}
	if err.Error() != "channels cannot change within a transcription session." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
}

func TestServiceScopeMismatchDoesNotRemoveOwnerSession(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM: runtime,
		NewID: func() string {
			return "session-scope"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-owner",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	_, err = service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-other",
		SessionID: started.SessionID,
	})
	if !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected session not found, got %v", err)
	}

	if err := service.CancelSession(context.Background(), StopRequest{
		ScopeID:   "scope-owner",
		SessionID: started.SessionID,
	}); err != nil {
		t.Fatalf("cancel owner session: %v", err)
	}
}

func TestServicePruneExpiredSessionsRemovesIdleSession(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM:        runtime,
		SessionTTL: time.Second,
		TimeNow: func() time.Time {
			return now
		},
		NewID: func() string {
			return "session-prune"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	now = now.Add(2 * time.Second)
	if err := service.PruneExpiredSessions(context.Background()); err != nil {
		t.Fatalf("prune expired sessions: %v", err)
	}
	_, err = service.StopSession(context.Background(), StopRequest{
		ScopeID:   "scope-1",
		SessionID: started.SessionID,
	})
	if !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected pruned session not found, got %v", err)
	}
}

func TestServicePruneExpiredSessionsClosesIdleEngine(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
	engine := &closableEngine{}
	service := &Service{
		llm:        newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{}, map[string]string{}),
		sessionTTL: time.Second,
		timeNow: func() time.Time {
			return now
		},
		sessions: map[string]*activeSession{
			"session-prune-close": {
				scopeID:      "scope-1",
				engine:       engine,
				lastActivity: now,
			},
		},
	}

	now = now.Add(2 * time.Second)
	if err := service.PruneExpiredSessions(context.Background()); err != nil {
		t.Fatalf("prune expired sessions: %v", err)
	}

	service.mu.Lock()
	session := service.sessions["session-prune-close"]
	service.mu.Unlock()
	if session != nil {
		t.Fatalf("expected idle session to be pruned, got %#v", session)
	}
	if engine.closeCalls != 1 {
		t.Fatalf("expected pruned idle session to close once, got %d close calls", engine.closeCalls)
	}
}

func TestServiceAppendRejectsInvalidPayloadVariants(t *testing.T) {
	t.Parallel()

	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{
		"openai-file": {
			ID:        "openai-file",
			Model:     "whisper-1",
			Provider:  "openai",
			BaseURL:   "https://example.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}, map[string]string{
		"OPENAI_API_KEY": "secret-key",
	})
	service, err := NewService(ServiceOptions{
		LLM: runtime,
		NewID: func() string {
			return "session-invalid"
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	started, err := service.StartSession(context.Background(), StartRequest{
		ScopeID:         "scope-1",
		ResolvedProfile: resolvedProfile("profile-1", transcriptionprofiles.TransportModeFile, runtime, "openai-file"),
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	for _, testCase := range []struct {
		name            string
		audioPCM16      []byte
		sampleRateHz    int
		channels        int
		expectedMessage string
	}{
		{
			name:            "sample rate zero",
			audioPCM16:      []byte{0x00, 0x00},
			sampleRateHz:    0,
			channels:        1,
			expectedMessage: "sampleRateHz must be greater than 0.",
		},
		{
			name:            "channels zero",
			audioPCM16:      []byte{0x00, 0x00},
			sampleRateHz:    24_000,
			channels:        0,
			expectedMessage: "channels must be greater than 0.",
		},
		{
			name:            "empty audio payload",
			audioPCM16:      []byte{},
			sampleRateHz:    24_000,
			channels:        1,
			expectedMessage: "Audio payload is empty.",
		},
		{
			name:            "odd pcm16 payload",
			audioPCM16:      []byte{0x00},
			sampleRateHz:    24_000,
			channels:        1,
			expectedMessage: "PCM16 payload must have an even byte length.",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := service.AppendAudio(context.Background(), AppendRequest{
				ScopeID:      "scope-1",
				SessionID:    started.SessionID,
				AudioPCM16:   testCase.audioPCM16,
				SampleRateHz: testCase.sampleRateHz,
				Channels:     testCase.channels,
			})
			if !errors.Is(err, ErrInvalidRequest) {
				t.Fatalf("expected invalid request, got %v", err)
			}
			if err.Error() != testCase.expectedMessage {
				t.Fatalf("expected %q, got %q", testCase.expectedMessage, err.Error())
			}
		})
	}
}

func TestServicePruneExpiredSessionsSkipsSessionWhileAppendIsInFlight(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
	runtime := newTranscriptionSessionRuntime(t, map[string]llmconfig.Config{}, map[string]string{})
	engine := &blockingAppendEngine{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
	}
	service := &Service{
		llm:        runtime,
		sessionTTL: time.Second,
		timeNow: func() time.Time {
			return now
		},
		sessions: map[string]*activeSession{
			"session-inflight": {
				scopeID:      "scope-1",
				engine:       engine,
				lastActivity: now,
			},
		},
	}

	appendDone := make(chan error, 1)
	go func() {
		_, err := service.AppendAudio(context.Background(), AppendRequest{
			ScopeID:      "scope-1",
			SessionID:    "session-inflight",
			AudioPCM16:   []byte{0x00, 0x00},
			SampleRateHz: 24_000,
			Channels:     1,
		})
		appendDone <- err
	}()
	<-engine.started

	now = now.Add(2 * time.Second)
	if err := service.PruneExpiredSessions(context.Background()); err != nil {
		t.Fatalf("prune expired sessions while append in flight: %v", err)
	}

	service.mu.Lock()
	session := service.sessions["session-inflight"]
	service.mu.Unlock()
	if session == nil {
		t.Fatal("expected in-flight session to remain registered")
	}
	if engine.closeCalls != 0 {
		t.Fatalf("expected in-flight session not to close during prune, got %d close calls", engine.closeCalls)
	}

	close(engine.release)
	if err := <-appendDone; err != nil {
		t.Fatalf("append audio: %v", err)
	}

	now = now.Add(2 * time.Second)
	if err := service.PruneExpiredSessions(context.Background()); err != nil {
		t.Fatalf("prune expired sessions after append completes: %v", err)
	}

	service.mu.Lock()
	session = service.sessions["session-inflight"]
	service.mu.Unlock()
	if session != nil {
		t.Fatalf("expected completed idle session to be pruned, got %#v", session)
	}
	if engine.closeCalls != 1 {
		t.Fatalf("expected pruned idle session to close once, got %d", engine.closeCalls)
	}
}

func newTranscriptionSessionRuntime(t *testing.T, configs map[string]llmconfig.Config, apiKeys map[string]string) *llmconfig.Runtime {
	t.Helper()

	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs:    configs,
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	runtime.UpdateAPIKeys(apiKeys)
	return runtime
}

func resolvedProfile(profileID string, mode transcriptionprofiles.TransportMode, runtime *llmconfig.Runtime, configID string) transcriptionprofiles.ResolvedProfile {
	config, err := runtime.Configs().ResolveConfig(configID)
	if err != nil {
		panic(err)
	}
	return transcriptionprofiles.ResolvedProfile{
		Profile: transcriptionprofiles.Profile{
			ID:                       profileID,
			Name:                     "Profile",
			TranscriptionLLMConfigID: configID,
			TransportMode:            mode,
			ChunkMs:                  1200,
		},
		LLMConfig: &config,
	}
}

func stringPtr(value string) *string {
	return &value
}

func readMultipartFile(t *testing.T, form *multipart.Form, field string) []byte {
	t.Helper()

	files := form.File[field]
	if len(files) == 0 {
		t.Fatalf("missing multipart file field %q", field)
	}
	file, err := files[0].Open()
	if err != nil {
		t.Fatalf("open multipart file %q: %v", field, err)
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		t.Fatalf("read multipart file %q: %v", field, err)
	}
	return content
}
