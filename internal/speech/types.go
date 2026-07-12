package speech

import "time"

type SpeechProviderStatus string
type SpeechProvider string
type SpeechSpeaker string
type VoiceSelectionMode string
type VoiceReuseReason string

const (
	SpeechProviderStatusConfigured    SpeechProviderStatus = "configured"
	SpeechProviderStatusNotConfigured SpeechProviderStatus = "not_configured"

	SpeechProviderOpenAI SpeechProvider = "openai"

	SpeechSpeakerMaster   SpeechSpeaker = "master"
	SpeechSpeakerNarrator SpeechSpeaker = "narrator"

	VoiceSelectionAutoDistinct VoiceSelectionMode = "auto_distinct"
	VoiceSelectionExact        VoiceSelectionMode = "exact"

	VoiceReuseCatalogExhausted VoiceReuseReason = "catalog_exhausted"
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

var speechSpeakerValues = []SpeechSpeaker{
	SpeechSpeakerMaster,
	SpeechSpeakerNarrator,
}

var voiceSelectionModeValues = []VoiceSelectionMode{
	VoiceSelectionAutoDistinct,
	VoiceSelectionExact,
}

var voiceReuseReasonValues = []VoiceReuseReason{VoiceReuseCatalogExhausted}

type SpeechVoiceCatalog struct {
	Provider SpeechProvider  `json:"provider"`
	Version  string          `json:"version"`
	VoiceIDs []SpeechVoiceID `json:"voiceIds"`
}

type VoiceSelectionRequest struct {
	Selection        VoiceSelectionMode `json:"selection"`
	RequestedVoiceID *SpeechVoiceID     `json:"requestedVoiceId"`
}

type VoiceReuse struct {
	Reason                     VoiceReuseReason `json:"reason"`
	ResolvedVoiceID            SpeechVoiceID    `json:"resolvedVoiceId"`
	ConflictingConversationIDs []string         `json:"conflictingConversationIds"`
}

type NarratorVoiceAssignment struct {
	ConversationID string
	VoiceID        SpeechVoiceID
}

type NarratorVoiceAllocation struct {
	VoiceID SpeechVoiceID
	Reuse   *VoiceReuse
}

type MasterVoiceSelection struct {
	Selection        VoiceSelectionMode `json:"selection"`
	RequestedVoiceID *SpeechVoiceID     `json:"requestedVoiceId"`
	ResolvedVoiceID  *SpeechVoiceID     `json:"resolvedVoiceId"`
	Reuse            *VoiceReuse        `json:"reuse"`
	UpdatedAt        string             `json:"updatedAt"`
}

type MasterVoiceSelectionInitialization struct {
	Catalog   SpeechVoiceCatalog   `json:"catalog"`
	Selection MasterVoiceSelection `json:"selection"`
}

type MasterVoiceSelectionUpdateReason string

const (
	MasterVoiceSelectionUpdateUserOverride     MasterVoiceSelectionUpdateReason = "user_override"
	MasterVoiceSelectionUpdateNarratorOverride MasterVoiceSelectionUpdateReason = "narrator_override"
)

type MasterVoiceSelectionUpdate struct {
	Catalog   SpeechVoiceCatalog               `json:"catalog"`
	Previous  MasterVoiceSelection             `json:"previous"`
	Selection MasterVoiceSelection             `json:"selection"`
	Reason    MasterVoiceSelectionUpdateReason `json:"reason"`
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

type SpeechSource struct {
	Speaker        SpeechSpeaker `json:"speaker"`
	EventID        string        `json:"eventId"`
	ConversationID *string       `json:"conversationId"`
}

type SpeechSynthesisRequest struct {
	Source          SpeechSource  `json:"source"`
	ResolvedVoiceID SpeechVoiceID `json:"resolvedVoiceId"`
}

type SpeechAudio struct {
	AudioBase64     string        `json:"audioBase64"`
	MediaType       string        `json:"mediaType"`
	Format          string        `json:"format"`
	Source          SpeechSource  `json:"source"`
	ResolvedVoiceID SpeechVoiceID `json:"resolvedVoiceId"`
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

type ResolvedSpeechSource struct {
	Source          SpeechSource
	Text            string
	ResolvedVoiceID SpeechVoiceID
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "SpeechProviderStatus", Values: stringValues(speechProviderStatusValues)},
		{Name: "SpeechProvider", Values: stringValues(speechProviderValues)},
		{Name: "SpeechSpeaker", Values: stringValues(speechSpeakerValues)},
		{Name: "VoiceSelectionMode", Values: stringValues(voiceSelectionModeValues)},
		{Name: "VoiceReuseReason", Values: stringValues(voiceReuseReasonValues)},
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
