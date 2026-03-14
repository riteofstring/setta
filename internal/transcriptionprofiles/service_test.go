package transcriptionprofiles

import (
	"errors"
	"testing"

	"setta/internal/llmconfig"
)

func TestServiceListAttachesRealtimeCapabilities(t *testing.T) {
	t.Parallel()

	service, _ := newTranscriptionProfileTestService(t, []Profile{
		{
			ID:                            "profile-supported",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: false,
		},
		{
			ID:                            "profile-unsupported",
			Name:                          "Anthropic",
			TranscriptionLLMConfigID:      "anthropic-transcribe",
			TransportMode:                 TransportModeFile,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
		{
			ID:                            "profile-missing",
			Name:                          "Missing",
			TranscriptionLLMConfigID:      "missing-config",
			TransportMode:                 TransportModeAuto,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
		"anthropic-transcribe": {
			ID:       "anthropic-transcribe",
			Model:    "claude-3-5-sonnet-latest",
			Provider: "anthropic",
		},
	})

	profiles, err := service.List()
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 3 {
		t.Fatalf("expected three profiles, got %#v", profiles)
	}
	if !profiles[0].SupportsRealtimeTranscription {
		t.Fatalf("expected supported profile to be true, got %#v", profiles[0])
	}
	if profiles[1].SupportsRealtimeTranscription {
		t.Fatalf("expected anthropic profile to be false, got %#v", profiles[1])
	}
	if profiles[2].SupportsRealtimeTranscription {
		t.Fatalf("expected missing config profile to be false, got %#v", profiles[2])
	}
}

func TestServiceCreateHydratesAndPersistsProfile(t *testing.T) {
	t.Parallel()

	service, store := newTranscriptionProfileTestService(t, nil, map[string]llmconfig.Config{
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
	})

	language := " en "
	created, err := service.Create(Profile{
		ID:                       "profile-created",
		Name:                     "Realtime",
		TranscriptionLLMConfigID: " openai-realtime ",
		TransportMode:            TransportModeRealtime,
		ChunkMs:                  1200,
		Language:                 &language,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	if created.ID != "profile-created" || created.TranscriptionLLMConfigID != "openai-realtime" {
		t.Fatalf("expected normalized create response, got %#v", created)
	}
	if !created.SupportsRealtimeTranscription {
		t.Fatalf("expected realtime support on create, got %#v", created)
	}
	if created.Language == nil || *created.Language != "en" {
		t.Fatalf("expected trimmed language, got %#v", created)
	}

	persisted, err := store.Get("profile-created")
	if err != nil {
		t.Fatalf("get created profile: %v", err)
	}
	if !persisted.SupportsRealtimeTranscription {
		t.Fatalf("expected persisted realtime support, got %#v", persisted)
	}
}

func TestServiceCreateAllowsWhisperRealtimeTransport(t *testing.T) {
	t.Parallel()

	service, store := newTranscriptionProfileTestService(t, nil, map[string]llmconfig.Config{
		"openai-whisper": {
			ID:       "openai-whisper",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})

	created, err := service.Create(Profile{
		ID:                       "profile-whisper",
		Name:                     "Realtime Whisper",
		TranscriptionLLMConfigID: "openai-whisper",
		TransportMode:            TransportModeRealtime,
		ChunkMs:                  1200,
	})
	if err != nil {
		t.Fatalf("create whisper realtime profile: %v", err)
	}
	if !created.SupportsRealtimeTranscription {
		t.Fatalf("expected whisper realtime support on create, got %#v", created)
	}

	persisted, err := store.Get("profile-whisper")
	if err != nil {
		t.Fatalf("get created whisper profile: %v", err)
	}
	if !persisted.SupportsRealtimeTranscription {
		t.Fatalf("expected persisted whisper realtime support, got %#v", persisted)
	}
}

func TestServiceUpdateHydratesAndPersistsProfile(t *testing.T) {
	t.Parallel()

	service, store := newTranscriptionProfileTestService(t, []Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
		"openai-realtime": {
			ID:       "openai-realtime",
			Model:    "gpt-4o-transcribe",
			Provider: "openai",
		},
	})

	updated, err := service.Update(Profile{
		ID:                       "profile-1",
		Name:                     "Realtime",
		TranscriptionLLMConfigID: "openai-realtime",
		TransportMode:            TransportModeRealtime,
		ChunkMs:                  1600,
	})
	if err != nil {
		t.Fatalf("update profile: %v", err)
	}
	if updated.Name != "Realtime" || updated.TransportMode != TransportModeRealtime {
		t.Fatalf("unexpected update response %#v", updated)
	}
	if !updated.SupportsRealtimeTranscription {
		t.Fatalf("expected realtime support on update, got %#v", updated)
	}

	persisted, err := store.Get("profile-1")
	if err != nil {
		t.Fatalf("get updated profile: %v", err)
	}
	if persisted.Name != "Realtime" || !persisted.SupportsRealtimeTranscription {
		t.Fatalf("expected persisted update, got %#v", persisted)
	}
}

func TestServiceDeleteRemovesProfile(t *testing.T) {
	t.Parallel()

	service, store := newTranscriptionProfileTestService(t, []Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})

	if err := service.Delete("profile-1"); err != nil {
		t.Fatalf("delete profile: %v", err)
	}
	profiles, err := store.List()
	if err != nil {
		t.Fatalf("list profiles after delete: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected no profiles after delete, got %#v", profiles)
	}
}

func TestServiceCreateRejectsUnknownLLMConfig(t *testing.T) {
	t.Parallel()

	service, store := newTranscriptionProfileTestService(t, nil, map[string]llmconfig.Config{})

	_, err := service.Create(Profile{
		ID:                       "profile-1",
		Name:                     "Missing",
		TranscriptionLLMConfigID: "missing-transcribe",
		TransportMode:            TransportModeFile,
		ChunkMs:                  1200,
	})
	if !errors.Is(err, ErrInvalidTranscriptionLLMConfig) {
		t.Fatalf("expected invalid transcription llm config error, got %v", err)
	}
	if err.Error() != "Transcription profile references unknown transcription LLM config 'missing-transcribe'." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
	profiles, listErr := store.List()
	if listErr != nil {
		t.Fatalf("list profiles after failed create: %v", listErr)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected failed create to leave store empty, got %#v", profiles)
	}
}

func TestServiceCreateRejectsMissingLLMConfigID(t *testing.T) {
	t.Parallel()

	service, _ := newTranscriptionProfileTestService(t, nil, map[string]llmconfig.Config{})

	_, err := service.Create(Profile{
		ID:            "profile-1",
		Name:          "Missing",
		TransportMode: TransportModeFile,
		ChunkMs:       1200,
	})
	if !errors.Is(err, ErrInvalidTranscriptionLLMConfig) {
		t.Fatalf("expected invalid transcription llm config error, got %v", err)
	}
	if err.Error() != "Transcription profile requires a transcription LLM config id." {
		t.Fatalf("unexpected error message %q", err.Error())
	}
}

func TestServiceUpdateRejectsUnsupportedRealtimeTransport(t *testing.T) {
	t.Parallel()

	service, store := newTranscriptionProfileTestService(t, []Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
		"openai-undocumented": {
			ID:       "openai-undocumented",
			Model:    "gpt-realtime",
			Provider: "openai",
		},
	})

	_, err := service.Update(Profile{
		ID:                       "profile-1",
		Name:                     "Realtime",
		TranscriptionLLMConfigID: "openai-undocumented",
		TransportMode:            TransportModeRealtime,
		ChunkMs:                  1200,
	})
	if !errors.Is(err, ErrRealtimeTranscriptionUnavailable) {
		t.Fatalf("expected realtime unavailable error, got %v", err)
	}
	if err.Error() != "Realtime transcription is unavailable for this provider/model." {
		t.Fatalf("unexpected error message %q", err.Error())
	}

	persisted, getErr := store.Get("profile-1")
	if getErr != nil {
		t.Fatalf("get original profile after failed update: %v", getErr)
	}
	if persisted.Name != "File" || persisted.TransportMode != TransportModeFile {
		t.Fatalf("expected failed update to preserve original profile, got %#v", persisted)
	}
}

func TestServiceCreateRejectsInvalidProfile(t *testing.T) {
	t.Parallel()

	service, _ := newTranscriptionProfileTestService(t, nil, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})

	_, err := service.Create(Profile{
		ID:                       "profile-1",
		TranscriptionLLMConfigID: "openai-file",
		TransportMode:            TransportModeFile,
		ChunkMs:                  1200,
	})
	if !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("expected invalid profile error, got %v", err)
	}
}

func TestServiceUpdateAndDeleteReturnBoundedNotFoundErrors(t *testing.T) {
	t.Parallel()

	service, _ := newTranscriptionProfileTestService(t, nil, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})

	_, updateErr := service.Update(Profile{
		ID:                       "missing",
		Name:                     "Missing",
		TranscriptionLLMConfigID: "openai-file",
		TransportMode:            TransportModeFile,
		ChunkMs:                  1200,
	})
	if !errors.Is(updateErr, ErrProfileNotFound) {
		t.Fatalf("expected not found from update, got %v", updateErr)
	}

	deleteErr := service.Delete("missing")
	if !errors.Is(deleteErr, ErrProfileNotFound) {
		t.Fatalf("expected not found from delete, got %v", deleteErr)
	}
}

func TestServiceResolveHydratesProfileAndLLMConfig(t *testing.T) {
	t.Parallel()

	service, _ := newTranscriptionProfileTestService(t, []Profile{
		{
			ID:                       "profile-1",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            TransportModeFile,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{
		"openai-file": {
			ID:       "openai-file",
			Model:    "whisper-1",
			Provider: "openai",
		},
	})

	resolved, err := service.Resolve(" profile-1 ")
	if err != nil {
		t.Fatalf("resolve profile: %v", err)
	}
	if resolved.Profile.ID != "profile-1" {
		t.Fatalf("expected resolved profile-1, got %#v", resolved.Profile)
	}
	if resolved.LLMConfig == nil || resolved.LLMConfig.ID != "openai-file" {
		t.Fatalf("expected resolved llm config openai-file, got %#v", resolved.LLMConfig)
	}
}

func TestServiceResolveReturnsNilLLMConfigForMissingConfig(t *testing.T) {
	t.Parallel()

	service, _ := newTranscriptionProfileTestService(t, []Profile{
		{
			ID:                       "profile-1",
			Name:                     "Broken",
			TranscriptionLLMConfigID: "missing-transcribe",
			TransportMode:            TransportModeAuto,
			ChunkMs:                  1200,
		},
	}, map[string]llmconfig.Config{})

	resolved, err := service.Resolve("profile-1")
	if err != nil {
		t.Fatalf("resolve profile: %v", err)
	}
	if resolved.LLMConfig != nil {
		t.Fatalf("expected nil llm config, got %#v", resolved.LLMConfig)
	}
}

func TestSupportsRealtimeTranscriptionRejectsCustomBaseURLWithoutProvider(t *testing.T) {
	t.Parallel()

	if SupportsRealtimeTranscriptionConfig(llmconfig.Config{
		ID:      "custom-openai",
		Model:   "gpt-4o-transcribe",
		BaseURL: "http://localhost:4000/v1",
	}) {
		t.Fatal("expected custom base url without provider to be unsupported")
	}
}

func TestSupportsRealtimeTranscriptionAllowsDefaultOpenAIProviderWhenProviderUnset(t *testing.T) {
	t.Parallel()

	if !SupportsRealtimeTranscriptionConfig(llmconfig.Config{
		ID:    "default-openai",
		Model: "gpt-4o-mini-transcribe",
	}) {
		t.Fatal("expected empty provider with default OpenAI base URL to be supported")
	}
}

func TestSupportsRealtimeTranscriptionAllowsOpenAITranscribe(t *testing.T) {
	t.Parallel()

	if !SupportsRealtimeTranscriptionConfig(llmconfig.Config{
		ID:       "openai-transcribe",
		Model:    "gpt-4o-transcribe",
		Provider: "openai",
	}) {
		t.Fatal("expected gpt-4o-transcribe to be supported for realtime transcription")
	}
}

func TestSupportsRealtimeTranscriptionAllowsOpenAITranscribeLatest(t *testing.T) {
	t.Parallel()

	if !SupportsRealtimeTranscriptionConfig(llmconfig.Config{
		ID:       "openai-latest",
		Model:    "gpt-4o-transcribe-latest",
		Provider: "openai",
	}) {
		t.Fatal("expected gpt-4o-transcribe-latest to be supported for realtime transcription")
	}
}

func TestSupportsRealtimeTranscriptionAllowsWhisper1(t *testing.T) {
	t.Parallel()

	if !SupportsRealtimeTranscriptionConfig(llmconfig.Config{
		ID:       "openai-whisper",
		Model:    "whisper-1",
		Provider: "openai",
	}) {
		t.Fatal("expected whisper-1 to be supported for realtime transcription")
	}
}

func TestSupportsRealtimeTranscriptionRejectsOpenAIRealtimeModels(t *testing.T) {
	t.Parallel()

	if SupportsRealtimeTranscriptionConfig(llmconfig.Config{
		ID:       "openai-realtime",
		Model:    "gpt-realtime",
		Provider: "openai",
	}) {
		t.Fatal("expected gpt-realtime to be rejected for realtime transcription profiles")
	}
}

func TestResolveOpenAIRealtimeTranscriptionStreamModeMatchesDocumentedModelBehavior(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		model string
		want  OpenAIRealtimeTranscriptionStreamMode
	}{
		{
			name:  "whisper snapshots",
			model: "whisper-1",
			want:  OpenAIRealtimeTranscriptionStreamModeSnapshot,
		},
		{
			name:  "gpt 4o transcribe incremental",
			model: "gpt-4o-transcribe",
			want:  OpenAIRealtimeTranscriptionStreamModeIncremental,
		},
		{
			name:  "gpt 4o mini transcribe incremental",
			model: "gpt-4o-mini-transcribe",
			want:  OpenAIRealtimeTranscriptionStreamModeIncremental,
		},
		{
			name:  "gpt 4o latest incremental",
			model: "gpt-4o-transcribe-latest",
			want:  OpenAIRealtimeTranscriptionStreamModeIncremental,
		},
		{
			name:  "sdk dated alias stays unsupported",
			model: "gpt-4o-mini-transcribe-2025-12-15",
			want:  OpenAIRealtimeTranscriptionStreamModeUnsupported,
		},
		{
			name:  "gpt realtime unsupported",
			model: "gpt-realtime",
			want:  OpenAIRealtimeTranscriptionStreamModeUnsupported,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := ResolveOpenAIRealtimeTranscriptionStreamMode(tt.model); got != tt.want {
				t.Fatalf("ResolveOpenAIRealtimeTranscriptionStreamMode(%q) = %v, want %v", tt.model, got, tt.want)
			}
		})
	}
}

func newTranscriptionProfileTestService(t *testing.T, profiles []Profile, configs map[string]llmconfig.Config) (*Service, *Store) {
	t.Helper()

	store := newTranscriptionProfileTestStore(t)
	if err := store.Write(profiles); err != nil {
		t.Fatalf("write profiles: %v", err)
	}
	service, err := NewService(ServiceOptions{
		Profiles: store,
		LLM:      newTranscriptionProfileTestRuntime(t, configs),
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service, store
}

func newTranscriptionProfileTestRuntime(t *testing.T, configs map[string]llmconfig.Config) *llmconfig.Runtime {
	t.Helper()

	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs:    configs,
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	return runtime
}
