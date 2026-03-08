package transcriptionprofiles

import (
	"fmt"
	"strings"

	"setta/internal/llmconfig"
)

type ServiceOptions struct {
	Profiles *Store
	LLM      *llmconfig.Runtime
}

type Service struct {
	profiles *Store
	llm      *llmconfig.Runtime
}

var openAIRealtimeTranscriptionModelIDs = map[string]struct{}{
	"gpt-4o-transcribe":      {},
	"gpt-4o-mini-transcribe": {},
}

var openAIRealtimeTranscriptionModelPrefixes = []string{
	"gpt-4o-realtime",
	"gpt-realtime",
}

func NewService(opts ServiceOptions) (*Service, error) {
	if opts.Profiles == nil {
		return nil, fmt.Errorf("transcription profile store is required")
	}
	if opts.LLM == nil {
		return nil, fmt.Errorf("llm runtime is required")
	}
	return &Service{
		profiles: opts.Profiles,
		llm:      opts.LLM,
	}, nil
}

func (s *Service) List() ([]Profile, error) {
	if s == nil || s.profiles == nil || s.llm == nil {
		return nil, fmt.Errorf("transcription profile service is not configured")
	}
	profiles, err := s.profiles.List()
	if err != nil {
		return nil, err
	}
	configs := s.llm.Configs()
	hydrated := make([]Profile, 0, len(profiles))
	for _, profile := range profiles {
		next := profile
		next.SupportsRealtimeTranscription = resolveRealtimeSupport(configs, profile)
		hydrated = append(hydrated, next)
	}
	return hydrated, nil
}

func resolveRealtimeSupport(configs llmconfig.AllConfigs, profile Profile) bool {
	configID := strings.TrimSpace(profile.TranscriptionLLMConfigID)
	if configID == "" {
		return false
	}
	config, err := configs.ResolveConfig(configID)
	if err != nil {
		return false
	}
	return supportsRealtimeTranscription(config)
}

func supportsRealtimeTranscription(config llmconfig.Config) bool {
	provider := strings.ToLower(strings.TrimSpace(config.Provider))
	switch {
	case provider == "openai":
	case provider != "":
		return false
	case strings.TrimSpace(config.BaseURL) != "":
		return false
	}
	model := strings.ToLower(strings.TrimSpace(config.Model))
	if model == "" {
		return false
	}
	if _, ok := openAIRealtimeTranscriptionModelIDs[model]; ok {
		return true
	}
	for _, prefix := range openAIRealtimeTranscriptionModelPrefixes {
		if strings.HasPrefix(model, prefix) {
			return true
		}
	}
	return false
}
