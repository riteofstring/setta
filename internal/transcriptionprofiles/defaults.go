package transcriptionprofiles

import (
	"errors"
	"fmt"
	"os"
)

func (s *Service) SeedDefaultProfilesIfMissing() error {
	if err := s.requireConfigured(); err != nil {
		return err
	}
	path := s.profiles.Path()
	if path == "" {
		return ErrRootRequired
	}
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat transcription profiles: %w", err)
	}
	profiles := make([]Profile, 0, len(defaultProfiles()))
	for _, profile := range defaultProfiles() {
		normalized, err := s.prepareForSave(profile)
		if err != nil {
			return err
		}
		profiles = append(profiles, normalized)
	}
	return s.profiles.Write(profiles)
}

func defaultProfiles() []Profile {
	return []Profile{
		{
			ID:                       "transcription-openai-whisper-1",
			Name:                     "OpenAI Whisper 1",
			TranscriptionLLMConfigID: "openai-whisper-1",
			TransportMode:            TransportModeFile,
			ChunkMs:                  DefaultChunkMs,
		},
	}
}
