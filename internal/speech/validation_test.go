package speech

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func validSpeechCapabilities() SpeechCapabilities {
	return SpeechCapabilities{
		ProviderStatus:              SpeechProviderStatusConfigured,
		TranscriptionModel:          TranscriptionModel,
		SynthesisModel:              SynthesisModel,
		SynthesisVoice:              SynthesisVoice,
		MaximumRecordingSeconds:     MaximumRecordingSeconds,
		MaximumTranscriptCharacters: MaximumTranscriptCharacters,
		MaximumSynthesisCharacters:  MaximumSynthesisCharacters,
		AIVoiceDisclosure:           AIVoiceDisclosure,
	}
}

func TestValidateSpeechCapabilities(t *testing.T) {
	configured := validSpeechCapabilities()
	if err := ValidateSpeechCapabilities(configured); err != nil {
		t.Fatalf("validate configured capabilities: %v", err)
	}
	notConfigured := configured
	notConfigured.ProviderStatus = SpeechProviderStatusNotConfigured
	if err := ValidateSpeechCapabilities(notConfigured); err != nil {
		t.Fatalf("validate unconfigured capabilities: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*SpeechCapabilities)
	}{
		{name: "status", mutate: func(value *SpeechCapabilities) { value.ProviderStatus = "unknown" }},
		{name: "transcription model", mutate: func(value *SpeechCapabilities) { value.TranscriptionModel = "other" }},
		{name: "synthesis model", mutate: func(value *SpeechCapabilities) { value.SynthesisModel = "other" }},
		{name: "voice", mutate: func(value *SpeechCapabilities) { value.SynthesisVoice = "other" }},
		{name: "recording limit", mutate: func(value *SpeechCapabilities) { value.MaximumRecordingSeconds-- }},
		{name: "transcript limit", mutate: func(value *SpeechCapabilities) { value.MaximumTranscriptCharacters-- }},
		{name: "synthesis limit", mutate: func(value *SpeechCapabilities) { value.MaximumSynthesisCharacters-- }},
		{name: "disclosure", mutate: func(value *SpeechCapabilities) { value.AIVoiceDisclosure = "" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := validSpeechCapabilities()
			test.mutate(&value)
			if err := ValidateSpeechCapabilities(value); err == nil {
				t.Fatal("validation unexpectedly passed")
			}
		})
	}
}

func TestValidateSpeechTranscriptionSession(t *testing.T) {
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	valid := SpeechTranscriptionSession{
		ClientSecret:                "ek_test_ephemeral",
		ExpiresAt:                   now.Add(time.Minute).Format(time.RFC3339Nano),
		WebRTCURL:                   OpenAIWebRTCURL,
		TranscriptionModel:          TranscriptionModel,
		TranscriptionDelay:          TranscriptionDelay,
		MaximumRecordingSeconds:     MaximumRecordingSeconds,
		MaximumTranscriptCharacters: MaximumTranscriptCharacters,
	}
	if err := validateSpeechTranscriptionSessionAt(valid, now); err != nil {
		t.Fatalf("validate transcription session: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*SpeechTranscriptionSession)
	}{
		{name: "secret", mutate: func(value *SpeechTranscriptionSession) { value.ClientSecret = "" }},
		{name: "secret characters", mutate: func(value *SpeechTranscriptionSession) { value.ClientSecret = "ek_tést" }},
		{name: "expiry format", mutate: func(value *SpeechTranscriptionSession) { value.ExpiresAt = "tomorrow" }},
		{name: "expired", mutate: func(value *SpeechTranscriptionSession) { value.ExpiresAt = now.Format(time.RFC3339Nano) }},
		{name: "WebRTC URL", mutate: func(value *SpeechTranscriptionSession) { value.WebRTCURL = "https://example.test" }},
		{name: "model", mutate: func(value *SpeechTranscriptionSession) { value.TranscriptionModel = "other" }},
		{name: "delay", mutate: func(value *SpeechTranscriptionSession) { value.TranscriptionDelay = "low" }},
		{name: "recording limit", mutate: func(value *SpeechTranscriptionSession) { value.MaximumRecordingSeconds-- }},
		{name: "transcript limit", mutate: func(value *SpeechTranscriptionSession) { value.MaximumTranscriptCharacters-- }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := valid
			test.mutate(&value)
			if err := validateSpeechTranscriptionSessionAt(value, now); err == nil {
				t.Fatal("validation unexpectedly passed")
			}
		})
	}
}

func TestValidateSpeechAudio(t *testing.T) {
	valid := SpeechAudio{
		AudioBase64: base64.StdEncoding.EncodeToString(validTestWAV()),
		MediaType:   SynthesisMediaType,
		Format:      SynthesisFormat,
		SourceID:    "highlight-1",
	}
	if err := ValidateSpeechAudio(valid); err != nil {
		t.Fatalf("validate speech audio: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*SpeechAudio)
	}{
		{name: "source", mutate: func(value *SpeechAudio) { value.SourceID = "" }},
		{name: "media type", mutate: func(value *SpeechAudio) { value.MediaType = "audio/mpeg" }},
		{name: "format", mutate: func(value *SpeechAudio) { value.Format = "mp3" }},
		{name: "base64 required", mutate: func(value *SpeechAudio) { value.AudioBase64 = "" }},
		{name: "base64 invalid", mutate: func(value *SpeechAudio) { value.AudioBase64 = "%%%" }},
		{name: "WAV invalid", mutate: func(value *SpeechAudio) { value.AudioBase64 = base64.StdEncoding.EncodeToString([]byte("not wav")) }},
		{name: "audio too large", mutate: func(value *SpeechAudio) {
			value.AudioBase64 = strings.Repeat("A", base64.StdEncoding.EncodedLen(MaximumSynthesisAudioBytes+1))
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := valid
			test.mutate(&value)
			if err := ValidateSpeechAudio(value); err == nil {
				t.Fatal("validation unexpectedly passed")
			}
		})
	}
}

func TestSpeechContractValueSetOwnsProviderStatuses(t *testing.T) {
	sets := ContractValueSets()
	if len(sets) != 1 || sets[0].Name != "SpeechProviderStatus" {
		t.Fatalf("value sets = %+v", sets)
	}
	want := []string{string(SpeechProviderStatusConfigured), string(SpeechProviderStatusNotConfigured)}
	if strings.Join(sets[0].Values, ",") != strings.Join(want, ",") {
		t.Fatalf("provider statuses = %v, want %v", sets[0].Values, want)
	}
}
