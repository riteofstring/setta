package speech

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/workspace"
)

const safetyIdentifierPrefix = "setta-device-"

type Provider interface {
	Configured() bool
	CreateTranscriptionClientSecret(context.Context, string) (SpeechTranscriptionClientSecret, error)
}

type WorkspaceResolver interface {
	ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type ServiceConfig struct {
	Provider   Provider
	Workspaces WorkspaceResolver
}

type Service struct {
	provider   Provider
	workspaces WorkspaceResolver
}

func NewService(config ServiceConfig) (*Service, error) {
	if config.Provider == nil {
		return nil, errors.New("speech provider is required")
	}
	if config.Workspaces == nil {
		return nil, errors.New("speech workspace resolver is required")
	}
	return &Service{
		provider:   config.Provider,
		workspaces: config.Workspaces,
	}, nil
}

func (service *Service) ReadCapabilities(context.Context) (SpeechCapabilities, error) {
	if service == nil || service.provider == nil {
		return SpeechCapabilities{}, errors.New("speech service is required")
	}
	status := SpeechProviderStatusNotConfigured
	if service.provider.Configured() {
		status = SpeechProviderStatusConfigured
	}
	capabilities := SpeechCapabilities{
		ProviderStatus:              status,
		TranscriptionModel:          TranscriptionModel,
		SynthesisModel:              SynthesisModel,
		SynthesisVoice:              SynthesisVoice,
		MaximumRecordingSeconds:     MaximumRecordingSeconds,
		MaximumTranscriptCharacters: MaximumTranscriptCharacters,
		MaximumSynthesisCharacters:  MaximumSynthesisCharacters,
		AIVoiceDisclosure:           AIVoiceDisclosure,
	}
	if err := ValidateSpeechCapabilities(capabilities); err != nil {
		return SpeechCapabilities{}, err
	}
	return capabilities, nil
}

func (service *Service) CreateTranscriptionSession(ctx context.Context, workspaceID string, deviceID string) (SpeechTranscriptionSession, error) {
	if err := service.requireConfigured(); err != nil {
		return SpeechTranscriptionSession{}, err
	}
	if err := service.requireWorkspace(workspaceID); err != nil {
		return SpeechTranscriptionSession{}, err
	}
	safetyIdentifier, err := deviceSafetyIdentifier(deviceID)
	if err != nil {
		return SpeechTranscriptionSession{}, err
	}
	secret, err := service.provider.CreateTranscriptionClientSecret(ctx, safetyIdentifier)
	if err != nil {
		return SpeechTranscriptionSession{}, err
	}
	session := SpeechTranscriptionSession{
		ClientSecret:                secret.Value,
		ExpiresAt:                   secret.ExpiresAt.UTC().Format(time.RFC3339Nano),
		WebRTCURL:                   OpenAIWebRTCURL,
		TranscriptionModel:          TranscriptionModel,
		TranscriptionDelay:          TranscriptionDelay,
		MaximumRecordingSeconds:     MaximumRecordingSeconds,
		MaximumTranscriptCharacters: MaximumTranscriptCharacters,
	}
	if err := ValidateSpeechTranscriptionSession(session); err != nil {
		return SpeechTranscriptionSession{}, err
	}
	return session, nil
}

func (service *Service) requireConfigured() error {
	if service == nil || service.provider == nil {
		return errors.New("speech service is required")
	}
	if !service.provider.Configured() {
		return classifiedError(ErrorNotConfigured, "OpenAI speech is not configured.", nil)
	}
	return nil
}

func (service *Service) requireWorkspace(workspaceID string) error {
	if err := validateSourceID("speech workspace id", workspaceID); err != nil {
		return err
	}
	summary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return err
	}
	if summary.ID != workspaceID {
		return fmt.Errorf("resolved speech workspace id = %q, want %q", summary.ID, workspaceID)
	}
	return nil
}

func deviceSafetyIdentifier(deviceID string) (string, error) {
	if err := validateSourceID("authenticated device id", deviceID); err != nil {
		return "", err
	}
	digest := sha256.Sum256([]byte("setta-openai-speech-device\x00" + deviceID))
	return safetyIdentifierPrefix + base64.RawURLEncoding.EncodeToString(digest[:]), nil
}

func validateSourceID(label string, value string) error {
	if err := validateRequiredTrimmedText(label, value); err != nil {
		return err
	}
	if strings.ContainsAny(value, `/\`) {
		return fmt.Errorf("%s must not contain path separators", label)
	}
	return nil
}
