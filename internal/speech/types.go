package speech

import "time"

type SpeechProviderStatus string
type SpeechProvider string
type VoiceSelectionMode string

const (
	SpeechProviderStatusConfigured    SpeechProviderStatus = "configured"
	SpeechProviderStatusNotConfigured SpeechProviderStatus = "not_configured"

	SpeechProviderOpenAI SpeechProvider = "openai"

	VoiceSelectionAutoDistinct VoiceSelectionMode = "auto_distinct"
	VoiceSelectionExact        VoiceSelectionMode = "exact"
)

const (
	APIKeyEnvironmentVariable     = "OPENAI_API_KEY"
	E2EBaseURLEnvironmentVariable = "SETTA_E2E_OPENAI_SPEECH_BASE_URL"
	SynthesisFormat               = "wav"
	SynthesisMediaType            = "audio/wav"
	MaximumRecordingSeconds       = 120
	MaximumTranscriptCharacters   = 8_000
	MaximumSynthesisAudioBytes    = 8 * 1024 * 1024
	AIVoiceDisclosure             = "This voice is AI-generated and not a human voice."
)

var speechProviderStatusValues = []SpeechProviderStatus{
	SpeechProviderStatusConfigured,
	SpeechProviderStatusNotConfigured,
}

var speechProviderValues = []SpeechProvider{SpeechProviderOpenAI}

var voiceSelectionModeValues = []VoiceSelectionMode{
	VoiceSelectionAutoDistinct,
	VoiceSelectionExact,
}

type SpeechVoiceCatalog struct {
	Provider SpeechProvider  `json:"provider"`
	Version  string          `json:"version"`
	VoiceIDs []SpeechVoiceID `json:"voiceIds"`
}

type MasterVoiceSelection struct {
	Selection        VoiceSelectionMode `json:"selection"`
	RequestedVoiceID *SpeechVoiceID     `json:"requestedVoiceId"`
	ResolvedVoiceID  *SpeechVoiceID     `json:"resolvedVoiceId"`
	UpdatedAt        string             `json:"updatedAt"`
}

type MasterVoiceSelectionInitialization struct {
	Catalog   SpeechVoiceCatalog   `json:"catalog"`
	Selection MasterVoiceSelection `json:"selection"`
}

type SpeechCapabilities struct {
	ProviderStatus              SpeechProviderStatus `json:"providerStatus"`
	TranscriptionModel          string               `json:"transcriptionModel"`
	SynthesisModel              string               `json:"synthesisModel"`
	VoiceCatalog                SpeechVoiceCatalog   `json:"voiceCatalog"`
	MaximumRecordingSeconds     int                  `json:"maximumRecordingSeconds"`
	MaximumTranscriptCharacters int                  `json:"maximumTranscriptCharacters"`
	MaximumSynthesisCharacters  int                  `json:"maximumSynthesisCharacters"`
	AIVoiceDisclosure           string               `json:"aiVoiceDisclosure"`
}

type SpeechTranscriptionSession struct {
	ClientSecret                string `json:"clientSecret"`
	ExpiresAt                   string `json:"expiresAt"`
	WebRTCURL                   string `json:"webRTCURL"`
	TranscriptionModel          string `json:"transcriptionModel"`
	TranscriptionDelay          string `json:"transcriptionDelay"`
	MaximumRecordingSeconds     int    `json:"maximumRecordingSeconds"`
	MaximumTranscriptCharacters int    `json:"maximumTranscriptCharacters"`
}

type SpeechAudio struct {
	AudioBase64 string `json:"audioBase64"`
	MediaType   string `json:"mediaType"`
	Format      string `json:"format"`
	SourceID    string `json:"sourceId"`
}

type SpeechTranscriptionClientSecret struct {
	Value     string
	ExpiresAt time.Time
}

type SynthesizedAudio struct {
	Bytes     []byte
	MediaType string
	Format    string
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "SpeechProviderStatus", Values: stringValues(speechProviderStatusValues)},
		{Name: "SpeechProvider", Values: stringValues(speechProviderValues)},
		{Name: "VoiceSelectionMode", Values: stringValues(voiceSelectionModeValues)},
		{Name: "SpeechVoiceID", Values: stringValues(openAISpeechVoiceIDs[:])},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
