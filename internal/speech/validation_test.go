package speech

import (
	"encoding/base64"
	"encoding/binary"
	"strings"
	"testing"
	"time"
)

func validSpeechCapabilities() SpeechCapabilities {
	return SpeechCapabilities{
		ProviderStatus:              SpeechProviderStatusConfigured,
		TranscriptionModel:          TranscriptionModel,
		SynthesisModel:              SynthesisModel,
		VoiceCatalog:                SynthesisVoiceCatalog(),
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
		{name: "voice catalog", mutate: func(value *SpeechCapabilities) { value.VoiceCatalog.VoiceIDs[0] = "other" }},
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

func TestValidateSpeechAudioAcceptsExactMaximumSize(t *testing.T) {
	audio := validTestWAVWithDataLength(MaximumSynthesisAudioBytes - 44)
	value := SpeechAudio{
		AudioBase64: base64.StdEncoding.EncodeToString(audio),
		MediaType:   SynthesisMediaType,
		Format:      SynthesisFormat,
		SourceID:    "summary",
	}
	if err := ValidateSpeechAudio(value); err != nil {
		t.Fatalf("validate exact-limit speech audio: %v", err)
	}
}

func TestValidateWAVRequiresOddChunkPadding(t *testing.T) {
	padded := validTestWAVWithDataLength(1)
	if err := validateWAV(padded); err != nil {
		t.Fatalf("validate padded odd-length WAV: %v", err)
	}

	missingPadding := append([]byte(nil), padded[:len(padded)-1]...)
	binary.LittleEndian.PutUint32(missingPadding[4:8], uint32(len(missingPadding)-8))
	if err := validateWAV(missingPadding); err == nil || !strings.Contains(err.Error(), "padding byte") {
		t.Fatalf("missing-padding error = %v", err)
	}
}

func TestSpeechContractValueSetsOwnProviderAndVoiceValues(t *testing.T) {
	sets := ContractValueSets()
	if len(sets) != 5 || sets[0].Name != "SpeechProviderStatus" ||
		sets[1].Name != "SpeechProvider" || sets[2].Name != "VoiceSelectionMode" ||
		sets[3].Name != "VoiceReuseReason" || sets[4].Name != "SpeechVoiceID" {
		t.Fatalf("value sets = %+v", sets)
	}
	want := []string{string(SpeechProviderStatusConfigured), string(SpeechProviderStatusNotConfigured)}
	if strings.Join(sets[0].Values, ",") != strings.Join(want, ",") {
		t.Fatalf("provider statuses = %v, want %v", sets[0].Values, want)
	}
	if strings.Join(sets[3].Values, ",") != string(VoiceReuseCatalogExhausted) {
		t.Fatalf("voice reuse reasons = %v", sets[3].Values)
	}
	if strings.Join(sets[4].Values, ",") != strings.Join(stringValues(openAISpeechVoiceIDs[:]), ",") {
		t.Fatalf("voice ids = %v, want %v", sets[4].Values, openAISpeechVoiceIDs)
	}
}
