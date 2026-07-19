package speech

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
)

const safetyIdentifierPrefix = "setta-device-"

type Provider interface {
	Configured() bool
	CreateTranscriptionClientSecret(context.Context, string) (SpeechTranscriptionClientSecret, error)
	SynthesizeSpeech(context.Context, ProviderSynthesisInput) (SynthesizedAudio, error)
}

type ProviderController interface {
	Configured() bool
	ProviderID() SpeechProvider
	Snapshot() Provider
	Status() SpeechProviderStatus
	ValidateCredential(context.Context, string, string) error
	LoadCredential(string) error
	ClearCredential()
	Shutdown()
}

type SourceResolver interface {
	ResolveSpeechSource(context.Context, SpeechSource) (ResolvedSpeechSource, error)
}

type SourceResolverFunc func(context.Context, SpeechSource) (ResolvedSpeechSource, error)

func (resolve SourceResolverFunc) ResolveSpeechSource(
	ctx context.Context,
	source SpeechSource,
) (ResolvedSpeechSource, error) {
	return resolve(ctx, source)
}

type VoiceConfigurationStore interface {
	EnsureMasterVoiceSelection(context.Context, MasterVoiceSelection) (MasterVoiceSelection, error)
	EnsureNarratorVoiceDefault(context.Context, NarratorVoiceDefault) (NarratorVoiceDefault, error)
	ReadMasterVoiceSelection(context.Context) (MasterVoiceSelection, error)
	ReadNarratorVoiceDefault(context.Context) (NarratorVoiceDefault, error)
	UpdateMasterVoiceSelection(
		context.Context,
		VoiceSelectionRequest,
		string,
	) (MasterVoiceSelection, error)
	UpdateNarratorVoiceDefault(
		context.Context,
		VoiceSelectionRequest,
		string,
	) (NarratorVoiceDefault, error)
}

type ServiceConfig struct {
	ProviderController      ProviderController
	SourceResolver          SourceResolver
	VoiceConfigurationStore VoiceConfigurationStore
	Now                     func() time.Time
}

type Service struct {
	providerController      ProviderController
	sourceResolver          SourceResolver
	voiceConfigurationStore VoiceConfigurationStore
	now                     func() time.Time
}

func NewService(ctx context.Context, config ServiceConfig) (*Service, error) {
	if ctx == nil {
		return nil, errors.New("speech service initialization context is required")
	}
	if config.ProviderController == nil {
		return nil, errors.New("speech provider controller is required")
	}
	if config.SourceResolver == nil {
		return nil, errors.New("speech source resolver is required")
	}
	if config.VoiceConfigurationStore == nil {
		return nil, errors.New("speech voice configuration store is required")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	service := &Service{
		providerController:      config.ProviderController,
		sourceResolver:          config.SourceResolver,
		voiceConfigurationStore: config.VoiceConfigurationStore,
		now:                     now,
	}
	initial := DefaultMasterVoiceSelection(now().UTC().Format(time.RFC3339Nano))
	stored, err := service.voiceConfigurationStore.EnsureMasterVoiceSelection(ctx, initial)
	if err != nil {
		return nil, fmt.Errorf("initialize master voice selection: %w", err)
	}
	if err := stored.Validate(); err != nil {
		return nil, fmt.Errorf("validate initialized master voice selection: %w", err)
	}
	narratorDefault := DefaultNarratorVoiceSelection(now().UTC().Format(time.RFC3339Nano))
	storedNarratorDefault, err := service.voiceConfigurationStore.EnsureNarratorVoiceDefault(
		ctx,
		narratorDefault,
	)
	if err != nil {
		return nil, fmt.Errorf("initialize narrator voice default: %w", err)
	}
	if err := storedNarratorDefault.Validate(); err != nil {
		return nil, fmt.Errorf("validate initialized narrator voice default: %w", err)
	}
	return service, nil
}

func (service *Service) SynthesizeSpeech(
	ctx context.Context,
	request SpeechSynthesisRequest,
) (SpeechAudio, error) {
	if err := request.Validate(); err != nil {
		return SpeechAudio{}, err
	}
	provider, err := service.requireProviderSnapshot(request.Provider)
	if err != nil {
		return SpeechAudio{}, err
	}
	if service.sourceResolver == nil {
		return SpeechAudio{}, errors.New("speech source resolver is required")
	}
	resolved, err := service.sourceResolver.ResolveSpeechSource(ctx, request.Source)
	if err != nil {
		return SpeechAudio{}, err
	}
	if err := resolved.Validate(); err != nil {
		return SpeechAudio{}, fmt.Errorf("validate resolved speech source: %w", err)
	}
	if !equalSpeechSources(resolved.Source, request.Source) {
		return SpeechAudio{}, SourceUnavailable("The requested speech source no longer matches the persisted event.", nil)
	}
	if resolved.ResolvedVoiceID != request.ResolvedVoiceID {
		return SpeechAudio{}, SourceUnavailable(
			fmt.Sprintf(
				"The requested speech source now resolves to voice %q instead of %q.",
				resolved.ResolvedVoiceID,
				request.ResolvedVoiceID,
			),
			nil,
		)
	}
	generated, err := provider.SynthesizeSpeech(ctx, ProviderSynthesisInput{
		Text:    resolved.Text,
		VoiceID: resolved.ResolvedVoiceID,
		Rate:    AssistantSynthesisRate,
	})
	if err != nil {
		return SpeechAudio{}, err
	}
	audio := SpeechAudio{
		AudioBase64:     base64.StdEncoding.EncodeToString(generated.Bytes),
		MediaType:       generated.MediaType,
		Format:          generated.Format,
		Source:          cloneSpeechSource(resolved.Source),
		ResolvedVoiceID: resolved.ResolvedVoiceID,
	}
	if err := ValidateSpeechAudio(audio); err != nil {
		return SpeechAudio{}, classifiedError(
			ErrorProviderResponseMalformed,
			fmt.Sprintf(
				"%s speech returned invalid generated audio.",
				speechProviderDisplayName(request.Provider),
			),
			err,
		)
	}
	return audio, nil
}

func (service *Service) ReadCapabilities(context.Context) (SpeechCapabilities, error) {
	if service == nil || service.providerController == nil {
		return SpeechCapabilities{}, errors.New("speech service is required")
	}
	status := SpeechProviderStatusNotConfigured
	if service.providerController.Configured() {
		status = SpeechProviderStatusConfigured
	}
	capabilities := SpeechCapabilities{
		ProviderStatus:              status,
		TranscriptionModel:          TranscriptionModel,
		SynthesisModel:              SynthesisModel,
		VoiceCatalog:                SynthesisVoiceCatalog(),
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

func (service *Service) ValidateCredential(
	ctx context.Context,
	provider SpeechProvider,
	apiKey string,
	deviceID string,
) (SpeechCredentialValidationResult, error) {
	controller, err := service.requireProviderController(provider)
	if err != nil {
		return SpeechCredentialValidationResult{}, err
	}
	if err := validateCredentialAPIKey(apiKey); err != nil {
		return SpeechCredentialValidationResult{}, err
	}
	safetyIdentifier, err := deviceSafetyIdentifier(deviceID)
	if err != nil {
		return SpeechCredentialValidationResult{}, err
	}
	if err := controller.ValidateCredential(ctx, apiKey, safetyIdentifier); err != nil {
		return SpeechCredentialValidationResult{}, err
	}
	result := SpeechCredentialValidationResult{
		Provider: controller.ProviderID(),
		Valid:    true,
	}
	if err := ValidateSpeechCredentialValidationResult(result); err != nil {
		return SpeechCredentialValidationResult{}, err
	}
	return result, nil
}

func (service *Service) LoadCredential(
	_ context.Context,
	provider SpeechProvider,
	apiKey string,
) (SpeechCredentialStatus, error) {
	controller, err := service.requireProviderController(provider)
	if err != nil {
		return SpeechCredentialStatus{}, err
	}
	if err := validateCredentialAPIKey(apiKey); err != nil {
		return SpeechCredentialStatus{}, err
	}
	if err := controller.LoadCredential(apiKey); err != nil {
		return SpeechCredentialStatus{}, err
	}
	return speechCredentialStatus(controller)
}

func (service *Service) ClearCredential(
	_ context.Context,
	provider SpeechProvider,
) (SpeechCredentialStatus, error) {
	controller, err := service.requireProviderController(provider)
	if err != nil {
		return SpeechCredentialStatus{}, err
	}
	controller.ClearCredential()
	return speechCredentialStatus(controller)
}

func (service *Service) CreateTranscriptionSession(
	ctx context.Context,
	providerID SpeechProvider,
	deviceID string,
) (SpeechTranscriptionSession, error) {
	provider, err := service.requireProviderSnapshot(providerID)
	if err != nil {
		return SpeechTranscriptionSession{}, err
	}
	safetyIdentifier, err := deviceSafetyIdentifier(deviceID)
	if err != nil {
		return SpeechTranscriptionSession{}, err
	}
	secret, err := provider.CreateTranscriptionClientSecret(ctx, safetyIdentifier)
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

func (service *Service) ReadMasterVoiceSelection(ctx context.Context) (MasterVoiceSelection, error) {
	if service == nil || service.voiceConfigurationStore == nil {
		return MasterVoiceSelection{}, errors.New("speech service is required")
	}
	selection, err := service.voiceConfigurationStore.ReadMasterVoiceSelection(ctx)
	if err != nil {
		return MasterVoiceSelection{}, err
	}
	if err := selection.Validate(); err != nil {
		return MasterVoiceSelection{}, fmt.Errorf("validate persisted master voice selection: %w", err)
	}
	return CloneMasterVoiceSelection(selection), nil
}

func (service *Service) UpdateMasterVoiceSelection(
	ctx context.Context,
	request VoiceSelectionRequest,
) (MasterVoiceSelection, error) {
	if service == nil || service.voiceConfigurationStore == nil {
		return MasterVoiceSelection{}, errors.New("speech service is required")
	}
	if err := request.Validate(); err != nil {
		return MasterVoiceSelection{}, err
	}
	selection, err := service.voiceConfigurationStore.UpdateMasterVoiceSelection(
		ctx,
		request,
		service.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return MasterVoiceSelection{}, err
	}
	if err := selection.Validate(); err != nil {
		return MasterVoiceSelection{}, fmt.Errorf("validate updated master voice selection: %w", err)
	}
	return CloneMasterVoiceSelection(selection), nil
}

func (service *Service) ReadNarratorVoiceDefault(
	ctx context.Context,
) (NarratorVoiceDefault, error) {
	if service == nil || service.voiceConfigurationStore == nil {
		return NarratorVoiceDefault{}, errors.New("speech service is required")
	}
	value, err := service.voiceConfigurationStore.ReadNarratorVoiceDefault(ctx)
	if err != nil {
		return NarratorVoiceDefault{}, err
	}
	if err := value.Validate(); err != nil {
		return NarratorVoiceDefault{}, fmt.Errorf("validate persisted narrator voice default: %w", err)
	}
	return CloneNarratorVoiceDefault(value), nil
}

func (service *Service) UpdateNarratorVoiceDefault(
	ctx context.Context,
	request VoiceSelectionRequest,
) (NarratorVoiceDefault, error) {
	if service == nil || service.voiceConfigurationStore == nil {
		return NarratorVoiceDefault{}, errors.New("speech service is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorVoiceDefault{}, err
	}
	value, err := service.voiceConfigurationStore.UpdateNarratorVoiceDefault(
		ctx,
		request,
		service.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return NarratorVoiceDefault{}, err
	}
	if err := value.Validate(); err != nil {
		return NarratorVoiceDefault{}, fmt.Errorf("validate updated narrator voice default: %w", err)
	}
	return CloneNarratorVoiceDefault(value), nil
}

func (service *Service) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("speech service shutdown context is required")
	}
	if service == nil || service.providerController == nil {
		return nil
	}
	service.providerController.Shutdown()
	return nil
}

func (service *Service) requireProviderController(
	provider SpeechProvider,
) (ProviderController, error) {
	if service == nil || service.providerController == nil {
		return nil, errors.New("speech service is required")
	}
	if !validValue(provider, speechProviderValues) {
		return nil, fmt.Errorf("unsupported speech provider %q", provider)
	}
	controller := service.providerController
	if controller.ProviderID() != provider {
		return nil, fmt.Errorf(
			"speech provider %q is not available from this runtime",
			provider,
		)
	}
	return controller, nil
}

func (service *Service) requireProviderSnapshot(provider SpeechProvider) (Provider, error) {
	controller, err := service.requireProviderController(provider)
	if err != nil {
		return nil, err
	}
	snapshot := controller.Snapshot()
	if snapshot == nil || !snapshot.Configured() {
		return nil, classifiedError(
			ErrorNotConfigured,
			fmt.Sprintf("%s speech is not configured.", speechProviderDisplayName(provider)),
			nil,
		)
	}
	return snapshot, nil
}

func speechCredentialStatus(controller ProviderController) (SpeechCredentialStatus, error) {
	result := SpeechCredentialStatus{
		Provider:       controller.ProviderID(),
		ProviderStatus: controller.Status(),
	}
	if err := ValidateSpeechCredentialStatus(result); err != nil {
		return SpeechCredentialStatus{}, err
	}
	return result, nil
}

func speechProviderDisplayName(provider SpeechProvider) string {
	switch provider {
	case SpeechProviderLocalMacOS:
		return "Local macOS"
	case SpeechProviderOpenAI:
		return "OpenAI"
	default:
		return string(provider)
	}
}

func validateCredentialAPIKey(apiKey string) error {
	if err := validateSecret("OpenAI API key", apiKey); err != nil {
		return classifiedError(ErrorCredentialInvalid, err.Error(), err)
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

func equalSpeechSources(left SpeechSource, right SpeechSource) bool {
	return left.Speaker == right.Speaker &&
		left.EventID == right.EventID &&
		equalOptionalString(left.ConversationID, right.ConversationID)
}

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func cloneSpeechSource(source SpeechSource) SpeechSource {
	if source.ConversationID != nil {
		conversationID := *source.ConversationID
		source.ConversationID = &conversationID
	}
	return source
}
