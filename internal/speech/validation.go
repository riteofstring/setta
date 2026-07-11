package speech

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"
)

func ValidateSpeechCapabilities(capabilities SpeechCapabilities) error {
	if !validValue(capabilities.ProviderStatus, speechProviderStatusValues) {
		return fmt.Errorf("unsupported speech provider status %s", capabilities.ProviderStatus)
	}
	checks := []struct {
		label string
		got   string
		want  string
	}{
		{label: "transcription model", got: capabilities.TranscriptionModel, want: TranscriptionModel},
		{label: "synthesis model", got: capabilities.SynthesisModel, want: SynthesisModel},
		{label: "synthesis voice", got: capabilities.SynthesisVoice, want: SynthesisVoice},
		{label: "AI voice disclosure", got: capabilities.AIVoiceDisclosure, want: AIVoiceDisclosure},
	}
	for _, check := range checks {
		if check.got != check.want {
			return fmt.Errorf("speech %s = %q, want %q", check.label, check.got, check.want)
		}
	}
	if capabilities.MaximumRecordingSeconds != MaximumRecordingSeconds {
		return fmt.Errorf("speech maximum recording seconds = %d, want %d", capabilities.MaximumRecordingSeconds, MaximumRecordingSeconds)
	}
	if capabilities.MaximumTranscriptCharacters != MaximumTranscriptCharacters {
		return fmt.Errorf("speech maximum transcript characters = %d, want %d", capabilities.MaximumTranscriptCharacters, MaximumTranscriptCharacters)
	}
	if capabilities.MaximumSynthesisCharacters != MaximumSynthesisCharacters {
		return fmt.Errorf("speech maximum synthesis characters = %d, want %d", capabilities.MaximumSynthesisCharacters, MaximumSynthesisCharacters)
	}
	return nil
}

func ValidateSpeechTranscriptionSession(session SpeechTranscriptionSession) error {
	return validateSpeechTranscriptionSessionAt(session, time.Now())
}

func validateSpeechTranscriptionSessionAt(session SpeechTranscriptionSession, now time.Time) error {
	if err := validateSecret("speech transcription client secret", session.ClientSecret); err != nil {
		return err
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, session.ExpiresAt)
	if err != nil {
		return fmt.Errorf("speech transcription expiry must be RFC3339Nano: %w", err)
	}
	if !expiresAt.After(now) {
		return errors.New("speech transcription client secret is expired")
	}
	if session.WebRTCURL != OpenAIWebRTCURL {
		return fmt.Errorf("speech WebRTC URL = %q, want %q", session.WebRTCURL, OpenAIWebRTCURL)
	}
	if session.TranscriptionModel != TranscriptionModel {
		return fmt.Errorf("speech transcription model = %q, want %q", session.TranscriptionModel, TranscriptionModel)
	}
	if session.TranscriptionDelay != TranscriptionDelay {
		return fmt.Errorf("speech transcription delay = %q, want %q", session.TranscriptionDelay, TranscriptionDelay)
	}
	if session.MaximumRecordingSeconds != MaximumRecordingSeconds {
		return fmt.Errorf("speech maximum recording seconds = %d, want %d", session.MaximumRecordingSeconds, MaximumRecordingSeconds)
	}
	if session.MaximumTranscriptCharacters != MaximumTranscriptCharacters {
		return fmt.Errorf("speech maximum transcript characters = %d, want %d", session.MaximumTranscriptCharacters, MaximumTranscriptCharacters)
	}
	return nil
}

func ValidateSpeechAudio(audio SpeechAudio) error {
	if err := validateRequiredTrimmedText("speech audio source id", audio.SourceID); err != nil {
		return err
	}
	if audio.MediaType != SynthesisMediaType {
		return fmt.Errorf("speech audio media type = %q, want %q", audio.MediaType, SynthesisMediaType)
	}
	if audio.Format != SynthesisFormat {
		return fmt.Errorf("speech audio format = %q, want %q", audio.Format, SynthesisFormat)
	}
	if audio.AudioBase64 == "" {
		return errors.New("speech audio base64 is required")
	}
	if base64.StdEncoding.DecodedLen(len(audio.AudioBase64)) > MaximumSynthesisAudioBytes {
		return fmt.Errorf("speech audio exceeds %d bytes", MaximumSynthesisAudioBytes)
	}
	decoded, err := base64.StdEncoding.DecodeString(audio.AudioBase64)
	if err != nil {
		return fmt.Errorf("speech audio base64 is invalid: %w", err)
	}
	return validateWAV(decoded)
}

func validateSynthesisText(text string) error {
	if err := validateRequiredTrimmedText("speech synthesis text", text); err != nil {
		return err
	}
	if len([]rune(text)) > MaximumSynthesisCharacters {
		return fmt.Errorf("speech synthesis text exceeds %d characters", MaximumSynthesisCharacters)
	}
	return nil
}

func validateSafetyIdentifier(identifier string) error {
	if err := validateRequiredTrimmedText("OpenAI safety identifier", identifier); err != nil {
		return err
	}
	if len(identifier) > 256 {
		return errors.New("OpenAI safety identifier exceeds 256 bytes")
	}
	for _, char := range identifier {
		if char < 0x21 || char > 0x7e {
			return errors.New("OpenAI safety identifier must contain only visible ASCII characters")
		}
	}
	return nil
}

func validateSecret(label string, secret string) error {
	if err := validateRequiredTrimmedText(label, secret); err != nil {
		return err
	}
	for _, char := range secret {
		if char < 0x21 || char > 0x7e {
			return fmt.Errorf("%s must contain only visible ASCII characters", label)
		}
	}
	return nil
}

func validateRequiredTrimmedText(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if value != strings.TrimSpace(value) {
		return fmt.Errorf("%s must not contain leading or trailing whitespace", label)
	}
	return nil
}

func validateWAV(audio []byte) error {
	if len(audio) < 12 {
		return errors.New("speech audio contains a truncated WAV header")
	}
	if string(audio[:4]) != "RIFF" || string(audio[8:12]) != "WAVE" {
		return errors.New("speech audio is not a RIFF/WAVE file")
	}
	declaredLength := int64(binary.LittleEndian.Uint32(audio[4:8])) + 8
	if declaredLength != int64(len(audio)) {
		return fmt.Errorf("speech WAV length = %d, declared %d", len(audio), declaredLength)
	}
	return validateWAVChunks(audio)
}

func validateWAVChunks(audio []byte) error {
	foundFormat := false
	foundAudio := false
	for offset := 12; offset < len(audio); {
		if len(audio)-offset < 8 {
			return errors.New("speech audio contains a truncated WAV chunk header")
		}
		chunkType := string(audio[offset : offset+4])
		chunkLength := int(binary.LittleEndian.Uint32(audio[offset+4 : offset+8]))
		chunkStart := offset + 8
		chunkEnd := chunkStart + chunkLength
		if chunkEnd < chunkStart || chunkEnd > len(audio) {
			return fmt.Errorf("speech audio contains a truncated %q WAV chunk", chunkType)
		}
		switch chunkType {
		case "fmt ":
			foundFormat = chunkLength >= 16
		case "data":
			foundAudio = chunkLength > 0
		}
		offset = chunkEnd + chunkLength%2
	}
	if !foundFormat {
		return errors.New("speech WAV format chunk is missing or invalid")
	}
	if !foundAudio {
		return errors.New("speech WAV audio data is missing")
	}
	return nil
}

func validValue[T comparable](candidate T, values []T) bool {
	for _, value := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
