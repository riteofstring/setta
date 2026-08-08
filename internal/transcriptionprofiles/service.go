package transcriptionprofiles

import (
	"errors"
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

type ResolvedProfile struct {
	Profile   Profile
	LLMConfig *llmconfig.Config
}

var (
	ErrInvalidProfile                   = errors.New("invalid transcription profile")
	ErrInvalidTranscriptionLLMConfig    = errors.New("invalid transcription llm config")
	ErrRealtimeTranscriptionUnavailable = errors.New("realtime transcription unavailable")
)

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
	if err := s.requireConfigured(); err != nil {
		return nil, err
	}
	profiles, err := s.profiles.List()
	if err != nil {
		return nil, err
	}
	configs := s.llm.Configs()
	hydrated := make([]Profile, 0, len(profiles))
	for _, profile := range profiles {
		hydrated = append(hydrated, hydrateProfile(configs, profile))
	}
	return hydrated, nil
}

func (s *Service) Create(profile Profile) (Profile, error) {
	if err := s.requireConfigured(); err != nil {
		return Profile{}, err
	}
	normalized, err := s.prepareForSave(profile)
	if err != nil {
		return Profile{}, err
	}
	profiles, err := s.profiles.List()
	if err != nil {
		return Profile{}, err
	}
	profiles = append(profiles, normalized)
	if err := s.profiles.Write(profiles); err != nil {
		return Profile{}, err
	}
	return hydrateProfile(s.llm.Configs(), normalized), nil
}

func (s *Service) Update(profile Profile) (Profile, error) {
	if err := s.requireConfigured(); err != nil {
		return Profile{}, err
	}
	normalized, err := s.prepareForSave(profile)
	if err != nil {
		return Profile{}, err
	}
	profiles, err := s.profiles.List()
	if err != nil {
		return Profile{}, err
	}
	for index, existing := range profiles {
		if existing.ID != normalized.ID {
			continue
		}
		profiles[index] = normalized
		if err := s.profiles.Write(profiles); err != nil {
			return Profile{}, err
		}
		return hydrateProfile(s.llm.Configs(), normalized), nil
	}
	return Profile{}, newServiceError(ErrProfileNotFound, "Transcription profile not found.")
}

func (s *Service) Delete(profileID string) error {
	if err := s.requireConfigured(); err != nil {
		return err
	}
	trimmedProfileID := strings.TrimSpace(profileID)
	if trimmedProfileID == "" {
		return newServiceError(ErrProfileNotFound, "Transcription profile not found.")
	}
	profiles, err := s.profiles.List()
	if err != nil {
		return err
	}
	for index, profile := range profiles {
		if profile.ID != trimmedProfileID {
			continue
		}
		profiles = append(profiles[:index], profiles[index+1:]...)
		return s.profiles.Write(profiles)
	}
	return newServiceError(ErrProfileNotFound, "Transcription profile not found.")
}

func (s *Service) Resolve(profileID string) (ResolvedProfile, error) {
	if err := s.requireConfigured(); err != nil {
		return ResolvedProfile{}, err
	}

	trimmedProfileID := strings.TrimSpace(profileID)
	if trimmedProfileID == "" {
		return ResolvedProfile{}, newServiceError(ErrProfileNotFound, "Transcription profile not found.")
	}

	profile, err := s.profiles.Get(trimmedProfileID)
	if err != nil {
		if errors.Is(err, ErrProfileNotFound) {
			return ResolvedProfile{}, newServiceError(
				ErrProfileNotFound,
				fmt.Sprintf("Transcription profile %s not found.", trimmedProfileID),
			)
		}
		return ResolvedProfile{}, err
	}

	hydrated := hydrateProfile(s.llm.Configs(), profile)
	resolved := ResolvedProfile{
		Profile: hydrated,
	}
	configID := strings.TrimSpace(hydrated.TranscriptionLLMConfigID)
	if configID == "" {
		return resolved, nil
	}
	config, err := s.llm.Configs().ResolveConfig(configID)
	if err != nil {
		return resolved, nil
	}
	resolved.LLMConfig = &config
	return resolved, nil
}

func (s *Service) requireConfigured() error {
	if s == nil || s.profiles == nil || s.llm == nil {
		return fmt.Errorf("transcription profile service is not configured")
	}
	return nil
}

func (s *Service) prepareForSave(profile Profile) (Profile, error) {
	configID, config, err := s.requireValidLLMConfig(profile.TranscriptionLLMConfigID)
	if err != nil {
		return Profile{}, err
	}
	normalized, err := profile.normalized()
	if err != nil {
		return Profile{}, newServiceError(ErrInvalidProfile, err.Error())
	}
	normalized.TranscriptionLLMConfigID = configID
	if normalized.TransportMode == TransportModeRealtime && !SupportsRealtimeTranscriptionConfig(config) {
		return Profile{}, newServiceError(
			ErrRealtimeTranscriptionUnavailable,
			"Realtime transcription is unavailable for this provider/model.",
		)
	}
	normalized.SupportsRealtimeTranscription = SupportsRealtimeTranscriptionConfig(config)
	return normalized, nil
}

func (s *Service) requireValidLLMConfig(configID string) (string, llmconfig.Config, error) {
	trimmedConfigID := strings.TrimSpace(configID)
	if trimmedConfigID == "" {
		return "", llmconfig.Config{}, newServiceError(
			ErrInvalidTranscriptionLLMConfig,
			"Transcription profile requires a transcription LLM config id.",
		)
	}
	config, err := s.llm.Configs().ResolveConfig(trimmedConfigID)
	if err != nil {
		return "", llmconfig.Config{}, newServiceError(
			ErrInvalidTranscriptionLLMConfig,
			fmt.Sprintf(
				"Transcription profile references unknown transcription LLM config '%s'.",
				trimmedConfigID,
			),
		)
	}
	return trimmedConfigID, config, nil
}

func hydrateProfile(configs llmconfig.AllConfigs, profile Profile) Profile {
	next := profile
	next.SupportsRealtimeTranscription = resolveRealtimeSupport(configs, profile)
	return next
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
	return SupportsRealtimeTranscriptionConfig(config)
}

func SupportsRealtimeTranscriptionConfig(config llmconfig.Config) bool {
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
	return ResolveOpenAIRealtimeTranscriptionStreamMode(model) != OpenAIRealtimeTranscriptionStreamModeUnsupported
}

type serviceError struct {
	cause   error
	message string
}

func (e *serviceError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func (e *serviceError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func newServiceError(cause error, message string) error {
	return &serviceError{
		cause:   cause,
		message: message,
	}
}
