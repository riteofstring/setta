package transcriptionprofiles

import (
	"fmt"
	"strings"
)

type TransportMode string

const (
	TransportModeAuto     TransportMode = "auto"
	TransportModeFile     TransportMode = "file"
	TransportModeRealtime TransportMode = "realtime"
)

const (
	DefaultProfileName = "Untitled"
	DefaultChunkMs     = 1200
	MinChunkMs         = 200
	MaxChunkMs         = 10_000
)

type Profile struct {
	ID                            string        `json:"id"`
	Name                          string        `json:"name"`
	TranscriptionLLMConfigID      string        `json:"transcriptionLlmConfigId"`
	TransportMode                 TransportMode `json:"transportMode"`
	ChunkMs                       int           `json:"chunkMs"`
	SupportsRealtimeTranscription bool          `json:"supportsRealtimeTranscription"`
	Language                      *string       `json:"language,omitempty"`
}

func (p Profile) normalized() (Profile, error) {
	normalized := Profile{
		ID:                            strings.TrimSpace(p.ID),
		Name:                          strings.TrimSpace(p.Name),
		TranscriptionLLMConfigID:      strings.TrimSpace(p.TranscriptionLLMConfigID),
		TransportMode:                 TransportMode(strings.TrimSpace(string(p.TransportMode))),
		ChunkMs:                       p.ChunkMs,
		SupportsRealtimeTranscription: p.SupportsRealtimeTranscription,
	}
	if normalized.ID == "" {
		return Profile{}, fmt.Errorf("transcription profile id is required")
	}
	if normalized.Name == "" {
		return Profile{}, fmt.Errorf("transcription profile %q name is required", normalized.ID)
	}
	if normalized.TranscriptionLLMConfigID == "" {
		return Profile{}, fmt.Errorf("transcription profile %q transcription llm config id is required", normalized.ID)
	}
	switch normalized.TransportMode {
	case TransportModeAuto, TransportModeFile, TransportModeRealtime:
	default:
		return Profile{}, fmt.Errorf("transcription profile %q transport mode %q is invalid", normalized.ID, p.TransportMode)
	}
	if normalized.ChunkMs < MinChunkMs || normalized.ChunkMs > MaxChunkMs {
		return Profile{}, fmt.Errorf(
			"transcription profile %q chunkMs must be between %d and %d",
			normalized.ID,
			MinChunkMs,
			MaxChunkMs,
		)
	}
	normalized.Language = cloneStringPointer(p.Language)
	if normalized.Language != nil {
		trimmed := strings.TrimSpace(*normalized.Language)
		if trimmed == "" {
			normalized.Language = nil
		} else {
			normalized.Language = &trimmed
		}
	}
	return normalized, nil
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
