package speech

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
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
		{label: "AI voice disclosure", got: capabilities.AIVoiceDisclosure, want: AIVoiceDisclosure},
	}
	if err := validateSpeechVoiceCatalog(capabilities.VoiceCatalog); err != nil {
		return err
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

func ValidateSpeechCredentialValidationResult(result SpeechCredentialValidationResult) error {
	if !validValue(result.Provider, speechProviderValues) {
		return fmt.Errorf("unsupported speech credential provider %q", result.Provider)
	}
	return nil
}

func ValidateSpeechCredentialStatus(status SpeechCredentialStatus) error {
	if !validValue(status.Provider, speechProviderValues) {
		return fmt.Errorf("unsupported speech credential provider %q", status.Provider)
	}
	if !validValue(status.ProviderStatus, speechProviderStatusValues) {
		return fmt.Errorf("unsupported speech credential provider status %q", status.ProviderStatus)
	}
	return nil
}

func validateSpeechVoiceCatalog(catalog SpeechVoiceCatalog) error {
	want := SynthesisVoiceCatalog()
	if catalog.Provider != want.Provider {
		return fmt.Errorf("speech voice catalog provider = %q, want %q", catalog.Provider, want.Provider)
	}
	if catalog.Version != want.Version {
		return fmt.Errorf("speech voice catalog version = %q, want %q", catalog.Version, want.Version)
	}
	if len(catalog.VoiceIDs) != len(want.VoiceIDs) {
		return fmt.Errorf("speech voice catalog length = %d, want %d", len(catalog.VoiceIDs), len(want.VoiceIDs))
	}
	for index, voiceID := range catalog.VoiceIDs {
		if voiceID != want.VoiceIDs[index] {
			return fmt.Errorf("speech voice catalog[%d] = %q, want %q", index, voiceID, want.VoiceIDs[index])
		}
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
	if err := audio.Source.Validate(); err != nil {
		return err
	}
	if !LookupVoice(audio.ResolvedVoiceID) {
		return unavailableVoiceError(audio.ResolvedVoiceID)
	}
	if err := validateSpeechAudioEncoding(audio); err != nil {
		return err
	}
	return nil
}

func validateSpeechAudioEncoding(audio SpeechAudio) error {
	if audio.MediaType != SynthesisMediaType {
		return fmt.Errorf("speech audio media type = %q, want %q", audio.MediaType, SynthesisMediaType)
	}
	if audio.Format != SynthesisFormat {
		return fmt.Errorf("speech audio format = %q, want %q", audio.Format, SynthesisFormat)
	}
	if audio.AudioBase64 == "" {
		return errors.New("speech audio base64 is required")
	}
	if len(audio.AudioBase64) > base64.StdEncoding.EncodedLen(MaximumSynthesisAudioBytes) {
		return fmt.Errorf("speech audio exceeds %d bytes", MaximumSynthesisAudioBytes)
	}
	decoded, err := base64.StdEncoding.DecodeString(audio.AudioBase64)
	if err != nil {
		return fmt.Errorf("speech audio base64 is invalid: %w", err)
	}
	if len(decoded) > MaximumSynthesisAudioBytes {
		return fmt.Errorf("speech audio exceeds %d bytes", MaximumSynthesisAudioBytes)
	}
	return validateWAV(decoded)
}

func validateResolvedSynthesisInput(input resolvedSynthesisInput) error {
	if !validValue(input.Provider, speechProviderValues) {
		return fmt.Errorf("unsupported speech synthesis provider %q", input.Provider)
	}
	if err := input.Source.Validate(); err != nil {
		return err
	}
	if err := validateSynthesisText(input.Text); err != nil {
		return err
	}
	if !LookupVoice(input.ResolvedVoiceID) {
		return unavailableVoiceError(input.ResolvedVoiceID)
	}
	if err := validateSynthesisRate(input.Rate); err != nil {
		return err
	}
	return nil
}

func (source SpeechSource) Validate() error {
	if !validValue(source.Speaker, speechSpeakerValues) {
		return fmt.Errorf("unsupported speech speaker %q", source.Speaker)
	}
	if err := validateSourceID("speech source event id", source.EventID); err != nil {
		return err
	}
	switch source.Speaker {
	case SpeechSpeakerDirector:
		if source.ConversationID != nil {
			return errors.New("director speech source must not include a conversation id")
		}
	case SpeechSpeakerNarrator:
		if source.ConversationID == nil {
			return errors.New("narrator speech source requires a conversation id")
		}
		if err := validateSourceID("narrator speech source conversation id", *source.ConversationID); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported speech speaker %q", source.Speaker)
	}
	return nil
}

func (request SpeechSynthesisRequest) Validate() error {
	if !validValue(request.Provider, speechProviderValues) {
		return fmt.Errorf("unsupported speech synthesis provider %q", request.Provider)
	}
	if err := request.Source.Validate(); err != nil {
		return err
	}
	if !LookupVoice(request.ResolvedVoiceID) {
		return unavailableVoiceError(request.ResolvedVoiceID)
	}
	return nil
}

func (input ProviderSynthesisInput) Validate() error {
	if err := validateSynthesisText(input.Text); err != nil {
		return err
	}
	if !LookupVoice(input.VoiceID) {
		return unavailableVoiceError(input.VoiceID)
	}
	if err := validateSynthesisRate(input.Rate); err != nil {
		return err
	}
	return nil
}

func (source ResolvedSpeechSource) Validate() error {
	if err := source.Source.Validate(); err != nil {
		return err
	}
	if err := validateSynthesisText(source.Text); err != nil {
		return err
	}
	if !LookupVoice(source.ResolvedVoiceID) {
		return unavailableVoiceError(source.ResolvedVoiceID)
	}
	return nil
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

func validateSynthesisRate(rate float64) error {
	const minimum = 0.25
	const maximum = 4.0
	if math.IsNaN(rate) || math.IsInf(rate, 0) || rate < minimum || rate > maximum {
		return fmt.Errorf("speech synthesis rate %g must be between %.2g and %.2g", rate, minimum, maximum)
	}
	return nil
}

func validateSafetyIdentifier(identifier string) error {
	if err := validateRequiredTrimmedText("OpenAI safety identifier", identifier); err != nil {
		return err
	}
	if len(identifier) > 64 {
		return errors.New("OpenAI safety identifier exceeds 64 bytes")
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
		offset = chunkEnd
		if chunkLength%2 != 0 {
			if offset >= len(audio) {
				return fmt.Errorf("speech audio contains a truncated %q WAV chunk padding byte", chunkType)
			}
			offset++
		}
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
