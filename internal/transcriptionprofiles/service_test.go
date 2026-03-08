package transcriptionprofiles

import (
	"testing"

	"setta/internal/llmconfig"
)

func TestServiceListAttachesRealtimeCapabilities(t *testing.T) {
	t.Parallel()

	store := newTranscriptionProfileTestStore(t)
	if err := store.Write([]Profile{
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
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}
	service, err := NewService(ServiceOptions{
		Profiles: store,
		LLM: newTranscriptionProfileTestRuntime(t, map[string]llmconfig.Config{
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
		}),
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

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

func TestSupportsRealtimeTranscriptionRejectsCustomBaseURLWithoutProvider(t *testing.T) {
	t.Parallel()

	if supportsRealtimeTranscription(llmconfig.Config{
		ID:      "custom-openai",
		Model:   "gpt-4o-transcribe",
		BaseURL: "http://localhost:4000/v1",
	}) {
		t.Fatal("expected custom base url without provider to be unsupported")
	}
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
