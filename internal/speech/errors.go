package speech

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	ErrorNotConfigured             ErrorCode = "speech_not_configured"
	ErrorProviderRejected          ErrorCode = "speech_provider_rejected"
	ErrorRateLimited               ErrorCode = "speech_rate_limited"
	ErrorProviderUnavailable       ErrorCode = "speech_provider_unavailable"
	ErrorProviderResponseMalformed ErrorCode = "speech_provider_response_malformed"
	ErrorAudioTooLarge             ErrorCode = "speech_audio_too_large"
	ErrorSourceUnavailable         ErrorCode = "speech_source_unavailable"
	ErrorVoiceUnavailable          ErrorCode = "speech_voice_unavailable"
)

type Error struct {
	Code    ErrorCode
	Message string
	Err     error
}

func (err *Error) Error() string {
	if err.Message != "" {
		return err.Message
	}
	if err.Err != nil {
		return err.Err.Error()
	}
	return string(err.Code)
}

func (err *Error) Unwrap() error {
	return err.Err
}

func AsError(err error) (*Error, bool) {
	var speechError *Error
	if errors.As(err, &speechError) {
		return speechError, true
	}
	return nil, false
}

func classifiedError(code ErrorCode, message string, err error) error {
	return &Error{Code: code, Message: message, Err: err}
}

func unavailableVoiceError(voiceID SpeechVoiceID) error {
	return classifiedError(
		ErrorVoiceUnavailable,
		fmt.Sprintf("Speech voice %q is not available in catalog %s.", voiceID, SynthesisVoiceCatalog().Version),
		nil,
	)
}

func SourceUnavailable(message string, err error) error {
	return classifiedError(ErrorSourceUnavailable, message, err)
}
