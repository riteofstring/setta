package speech

import "time"

type SpeechProviderStatus string
type VoiceID string
type SpeakerKind string
type SpeechSourceKind string

const (
	SpeechProviderStatusConfigured    SpeechProviderStatus = "configured"
	SpeechProviderStatusNotConfigured SpeechProviderStatus = "not_configured"
)

const (
	SpeakerMaster   SpeakerKind = "master"
	SpeakerNarrator SpeakerKind = "narrator"

	SpeechSourceMasterAnswer SpeechSourceKind = "master_answer"
	SpeechSourceStatusReply  SpeechSourceKind = "status_reply"
	SpeechSourceAttention    SpeechSourceKind = "attention"
	SpeechSourceFinalSummary SpeechSourceKind = "final_summary"
	SpeechSourceMilestone    SpeechSourceKind = "milestone"
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

type SpeechCapabilities struct {
	ProviderStatus              SpeechProviderStatus `json:"providerStatus"`
	TranscriptionModel          string               `json:"transcriptionModel"`
	SynthesisModel              string               `json:"synthesisModel"`
	SynthesisVoice              string               `json:"synthesisVoice"`
	MaximumRecordingSeconds     int                  `json:"maximumRecordingSeconds"`
	MaximumTranscriptCharacters int                  `json:"maximumTranscriptCharacters"`
	MaximumSynthesisCharacters  int                  `json:"maximumSynthesisCharacters"`
	AIVoiceDisclosure           string               `json:"aiVoiceDisclosure"`
}

type SpeechVoice struct {
	ID VoiceID `json:"id"`
}

type SpeechVoiceCatalog struct {
	Version string        `json:"version"`
	Voices  []SpeechVoice `json:"voices"`
}

type SourcedSynthesisRequest struct {
	SourceEventID  string           `json:"sourceEventId"`
	SourceKind     SpeechSourceKind `json:"sourceKind"`
	Speaker        SpeakerKind      `json:"speaker"`
	ConversationID *string          `json:"conversationId"`
	Text           string           `json:"text"`
}

type SourcedSpeechAudio struct {
	AudioBase64     string           `json:"audioBase64"`
	MediaType       string           `json:"mediaType"`
	Format          string           `json:"format"`
	SourceEventID   string           `json:"sourceEventId"`
	SourceKind      SpeechSourceKind `json:"sourceKind"`
	Speaker         SpeakerKind      `json:"speaker"`
	ConversationID  *string          `json:"conversationId"`
	ResolvedVoiceID VoiceID          `json:"resolvedVoiceId"`
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
	return []ContractValueSet{{
		Name:   "SpeechProviderStatus",
		Values: stringValues(speechProviderStatusValues),
	}, {
		Name: "VoiceID", Values: voiceIDStrings(VoiceCatalog()),
	}, {
		Name: "SpeakerKind", Values: []string{string(SpeakerMaster), string(SpeakerNarrator)},
	}, {
		Name: "SpeechSourceKind", Values: []string{string(SpeechSourceMasterAnswer), string(SpeechSourceStatusReply), string(SpeechSourceAttention), string(SpeechSourceFinalSummary), string(SpeechSourceMilestone)},
	}}
}

func VoiceCatalog() []VoiceID {
	result := make([]VoiceID, len(synthesisVoiceCatalog))
	for index, voice := range synthesisVoiceCatalog {
		result[index] = VoiceID(voice)
	}
	return result
}

func VoiceCatalogVersion() string {
	return openAIContractSourceCommit
}

func voiceIDStrings(values []VoiceID) []string {
	return stringValues(values)
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
