package speech

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/easyrun"
	"setta/internal/workspace"
)

const safetyIdentifierPrefix = "setta-device-"

type Provider interface {
	Configured() bool
	CreateTranscriptionClientSecret(context.Context, string) (SpeechTranscriptionClientSecret, error)
	SynthesizeSpeech(context.Context, string) (SynthesizedAudio, error)
}

type EasyRunSnapshotReader interface {
	ReadSnapshot(workspaceID string) (easyrun.EasyRunSnapshot, error)
}

type WorkspaceResolver interface {
	ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type ServiceConfig struct {
	Provider         Provider
	EasyRunSnapshots EasyRunSnapshotReader
	Workspaces       WorkspaceResolver
}

type Service struct {
	provider         Provider
	easyRunSnapshots EasyRunSnapshotReader
	workspaces       WorkspaceResolver
}

func NewService(config ServiceConfig) (*Service, error) {
	if config.Provider == nil {
		return nil, errors.New("speech provider is required")
	}
	if config.EasyRunSnapshots == nil {
		return nil, errors.New("speech easy-run snapshot reader is required")
	}
	if config.Workspaces == nil {
		return nil, errors.New("speech workspace resolver is required")
	}
	return &Service{
		provider:         config.Provider,
		easyRunSnapshots: config.EasyRunSnapshots,
		workspaces:       config.Workspaces,
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

func (service *Service) SynthesizeEasyRunSummary(ctx context.Context, workspaceID string, easyRunID string) (SpeechAudio, error) {
	if err := service.requireConfigured(); err != nil {
		return SpeechAudio{}, err
	}
	_, run, err := service.readLatestRun(workspaceID, easyRunID)
	if err != nil {
		return SpeechAudio{}, err
	}
	if !terminalEasyRunStatus(run.Status) || run.Summary == nil {
		return SpeechAudio{}, sourceUnavailable("The latest Easy Run does not have a terminal summary.", nil)
	}
	if err := validateSynthesisText(*run.Summary); err != nil {
		return SpeechAudio{}, sourceUnavailable("The latest Easy Run summary cannot be synthesized.", err)
	}
	return service.synthesize(ctx, run.ID, *run.Summary)
}

func (service *Service) SynthesizeEasyRunHighlight(ctx context.Context, workspaceID string, easyRunID string, highlightID string) (SpeechAudio, error) {
	if err := service.requireConfigured(); err != nil {
		return SpeechAudio{}, err
	}
	if err := validateSourceID("speech highlight id", highlightID); err != nil {
		return SpeechAudio{}, err
	}
	snapshot, run, err := service.readLatestRun(workspaceID, easyRunID)
	if err != nil {
		return SpeechAudio{}, err
	}
	for _, highlight := range snapshot.Highlights {
		if highlight.ID != highlightID {
			continue
		}
		if highlight.EasyRunID != run.ID {
			return SpeechAudio{}, sourceUnavailable("The requested highlight does not belong to the latest Easy Run.", nil)
		}
		if err := validateSynthesisText(highlight.Text); err != nil {
			return SpeechAudio{}, sourceUnavailable("The requested highlight cannot be synthesized.", err)
		}
		return service.synthesize(ctx, highlight.ID, highlight.Text)
	}
	return SpeechAudio{}, sourceUnavailable("The requested highlight is not available in the latest Easy Run.", nil)
}

func (service *Service) readLatestRun(workspaceID string, easyRunID string) (easyrun.EasyRunSnapshot, easyrun.EasyRun, error) {
	if err := validateSourceID("speech easy-run id", easyRunID); err != nil {
		return easyrun.EasyRunSnapshot{}, easyrun.EasyRun{}, err
	}
	if err := service.requireWorkspace(workspaceID); err != nil {
		return easyrun.EasyRunSnapshot{}, easyrun.EasyRun{}, err
	}
	snapshot, err := service.easyRunSnapshots.ReadSnapshot(workspaceID)
	if err != nil {
		return easyrun.EasyRunSnapshot{}, easyrun.EasyRun{}, err
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != easyRunID || snapshot.LatestRun.WorkspaceID != workspaceID {
		return easyrun.EasyRunSnapshot{}, easyrun.EasyRun{}, sourceUnavailable("The requested Easy Run is not the latest visible run in this workspace.", nil)
	}
	return snapshot, *snapshot.LatestRun, nil
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

func (service *Service) synthesize(ctx context.Context, sourceID string, text string) (SpeechAudio, error) {
	generated, err := service.provider.SynthesizeSpeech(ctx, text)
	if err != nil {
		return SpeechAudio{}, err
	}
	audio := SpeechAudio{
		AudioBase64: base64.StdEncoding.EncodeToString(generated.Bytes),
		MediaType:   generated.MediaType,
		Format:      generated.Format,
		SourceID:    sourceID,
	}
	if err := ValidateSpeechAudio(audio); err != nil {
		return SpeechAudio{}, classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned invalid generated audio.", err)
	}
	return audio, nil
}

func deviceSafetyIdentifier(deviceID string) (string, error) {
	if err := validateSourceID("authenticated device id", deviceID); err != nil {
		return "", err
	}
	digest := sha256.Sum256([]byte("setta-openai-speech-device\x00" + deviceID))
	return safetyIdentifierPrefix + hex.EncodeToString(digest[:]), nil
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

func sourceUnavailable(message string, err error) error {
	return classifiedError(ErrorSourceUnavailable, message, err)
}

func terminalEasyRunStatus(status easyrun.EasyRunStatus) bool {
	switch status {
	case easyrun.EasyRunStatusCompleted, easyrun.EasyRunStatusFailed, easyrun.EasyRunStatusStopped:
		return true
	default:
		return false
	}
}
