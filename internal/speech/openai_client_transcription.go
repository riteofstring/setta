package speech

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const (
	realtimeClientSecretClockSkewSeconds = 30
)

type realtimeClientSecretRequest struct {
	ExpiresAfter realtimeClientSecretExpiry  `json:"expires_after"`
	Session      realtimeTranscriptionConfig `json:"session"`
}

type realtimeClientSecretExpiry struct {
	Anchor  string `json:"anchor"`
	Seconds int    `json:"seconds"`
}

type realtimeTranscriptionConfig struct {
	Type  string                     `json:"type"`
	Audio realtimeTranscriptionAudio `json:"audio"`
}

type realtimeTranscriptionAudio struct {
	Input realtimeTranscriptionInput `json:"input"`
}

type realtimeTranscriptionInput struct {
	Transcription realtimeTranscriptionModel `json:"transcription"`
	TurnDetection any                        `json:"turn_detection"`
}

type realtimeTranscriptionModel struct {
	Model string `json:"model"`
	Delay string `json:"delay"`
}

type realtimeClientSecretResponse struct {
	Value     string                            `json:"value"`
	ExpiresAt int64                             `json:"expires_at"`
	Session   *realtimeTranscriptionSessionEcho `json:"session"`
}

type realtimeTranscriptionSessionEcho struct {
	Type  string                          `json:"type"`
	Audio *realtimeTranscriptionAudioEcho `json:"audio"`
}

type realtimeTranscriptionAudioEcho struct {
	Input *realtimeTranscriptionInputEcho `json:"input"`
}

type realtimeTranscriptionInputEcho struct {
	Transcription *realtimeTranscriptionModelEcho `json:"transcription"`
	TurnDetection json.RawMessage                 `json:"turn_detection"`
}

type realtimeTranscriptionModelEcho struct {
	Model string  `json:"model"`
	Delay *string `json:"delay"`
}

func (client *OpenAIClient) CreateTranscriptionClientSecret(ctx context.Context, safetyIdentifier string) (SpeechTranscriptionClientSecret, error) {
	if err := validateSafetyIdentifier(safetyIdentifier); err != nil {
		return SpeechTranscriptionClientSecret{}, err
	}
	payload := realtimeClientSecretRequest{
		ExpiresAfter: realtimeClientSecretExpiry{Anchor: "created_at", Seconds: realtimeClientSecretTTLSeconds},
		Session: realtimeTranscriptionConfig{
			Type: "transcription",
			Audio: realtimeTranscriptionAudio{Input: realtimeTranscriptionInput{
				Transcription: realtimeTranscriptionModel{Model: TranscriptionModel, Delay: TranscriptionDelay},
				TurnDetection: nil,
			}},
		},
	}
	response, err := client.postJSON(
		ctx,
		openAICreateRealtimeClientSecretPath,
		payload,
		openAICreateRealtimeClientSecretResponseMediaType,
		safetyIdentifier,
	)
	if err != nil {
		return SpeechTranscriptionClientSecret{}, err
	}
	defer response.Body.Close()
	var decoded realtimeClientSecretResponse
	if err := decodeJSONResponse(response, &decoded); err != nil {
		return SpeechTranscriptionClientSecret{}, err
	}
	return validateClientSecretResponse(decoded, time.Now())
}

func validateClientSecretResponse(response realtimeClientSecretResponse, now time.Time) (SpeechTranscriptionClientSecret, error) {
	if err := validateSecret("OpenAI transcription client secret", response.Value); err != nil {
		return SpeechTranscriptionClientSecret{}, malformedProviderResponse(err)
	}
	expiresAt := time.Unix(response.ExpiresAt, 0)
	if response.ExpiresAt <= 0 || !expiresAt.After(now) {
		return SpeechTranscriptionClientSecret{}, malformedProviderResponse(errors.New("OpenAI transcription client secret expiry is missing or expired"))
	}
	maximumExpiry := now.Add(time.Duration(realtimeClientSecretTTLSeconds+realtimeClientSecretClockSkewSeconds) * time.Second)
	if expiresAt.After(maximumExpiry) {
		return SpeechTranscriptionClientSecret{}, malformedProviderResponse(errors.New("OpenAI transcription client secret expiry exceeds the requested lifetime"))
	}
	if err := validateEffectiveTranscriptionSession(response.Session); err != nil {
		return SpeechTranscriptionClientSecret{}, malformedProviderResponse(err)
	}
	return SpeechTranscriptionClientSecret{Value: response.Value, ExpiresAt: expiresAt}, nil
}

func validateEffectiveTranscriptionSession(session *realtimeTranscriptionSessionEcho) error {
	if session == nil {
		return errors.New("OpenAI transcription session is missing")
	}
	if session.Type != "transcription" {
		return fmt.Errorf("OpenAI transcription session type = %q, want transcription", session.Type)
	}
	if session.Audio == nil || session.Audio.Input == nil || session.Audio.Input.Transcription == nil {
		return errors.New("OpenAI transcription session audio configuration is missing")
	}
	transcription := session.Audio.Input.Transcription
	if transcription.Model != TranscriptionModel {
		return fmt.Errorf("OpenAI transcription model = %q, want %q", transcription.Model, TranscriptionModel)
	}
	if transcription.Delay != nil && *transcription.Delay != TranscriptionDelay {
		return fmt.Errorf("OpenAI transcription delay = %q, want %q", *transcription.Delay, TranscriptionDelay)
	}
	if !bytes.Equal(bytes.TrimSpace(session.Audio.Input.TurnDetection), []byte("null")) {
		return errors.New("OpenAI transcription turn detection must be null")
	}
	return nil
}

func malformedProviderResponse(err error) error {
	return classifiedError(ErrorProviderResponseMalformed, err.Error()+".", err)
}
