package speech

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestNewSpeechServiceRequiresDependencies(t *testing.T) {
	if _, err := NewService(context.Background(), ServiceConfig{}); err == nil {
		t.Fatal("NewService unexpectedly succeeded")
	}
	if _, err := NewService(nil, ServiceConfig{
		ProviderController:      staticProviderController{provider: &serviceTestProvider{}},
		SourceResolver:          &serviceTestSourceResolver{},
		VoiceConfigurationStore: &serviceTestVoiceConfigurationStore{},
	}); err == nil {
		t.Fatal("NewService unexpectedly accepted a nil context")
	}
}

func TestSpeechServiceReportsConfiguredAndTextOnlyCapabilities(t *testing.T) {
	for _, configured := range []bool{false, true} {
		t.Run(map[bool]string{false: "not configured", true: "configured"}[configured], func(t *testing.T) {
			service := newServiceTestService(t, &serviceTestProvider{configured: configured})
			capabilities, err := service.ReadCapabilities(context.Background())
			if err != nil {
				t.Fatalf("read capabilities: %v", err)
			}
			wantStatus := SpeechProviderStatusNotConfigured
			if configured {
				wantStatus = SpeechProviderStatusConfigured
			}
			if capabilities.ProviderStatus != wantStatus {
				t.Fatalf("provider status = %q, want %q", capabilities.ProviderStatus, wantStatus)
			}
			if err := ValidateSpeechCapabilities(capabilities); err != nil {
				t.Fatalf("validate capabilities: %v", err)
			}
		})
	}
}

func TestSpeechServiceCreatesDeviceScopedTranscriptionSession(t *testing.T) {
	expiresAt := time.Now().Add(5 * time.Minute).UTC().Truncate(time.Second)
	provider := &serviceTestProvider{
		configured: true,
		clientSecret: SpeechTranscriptionClientSecret{
			Value:     "ek_test_scoped",
			ExpiresAt: expiresAt,
		},
	}
	service := newServiceTestService(t, provider)

	session, err := service.CreateTranscriptionSession(context.Background(), "device_sensitive_principal")
	if err != nil {
		t.Fatalf("create transcription session: %v", err)
	}
	if provider.transcriptionCalls != 1 {
		t.Fatalf("transcription calls = %d, want 1", provider.transcriptionCalls)
	}
	if !strings.HasPrefix(provider.safetyIdentifier, safetyIdentifierPrefix) ||
		strings.Contains(provider.safetyIdentifier, "device_sensitive_principal") {
		t.Fatalf("safety identifier = %q, want privacy-preserving device digest", provider.safetyIdentifier)
	}
	if session.ClientSecret != "ek_test_scoped" || session.ExpiresAt != expiresAt.Format(time.RFC3339Nano) {
		t.Fatalf("session secret metadata = %+v", session)
	}
	if err := ValidateSpeechTranscriptionSession(session); err != nil {
		t.Fatalf("validate session: %v", err)
	}
}

func TestDeviceSafetyIdentifierIsStableAndDeviceScoped(t *testing.T) {
	first, err := deviceSafetyIdentifier("device_one")
	if err != nil {
		t.Fatalf("derive first safety identifier: %v", err)
	}
	repeated, err := deviceSafetyIdentifier("device_one")
	if err != nil {
		t.Fatalf("derive repeated safety identifier: %v", err)
	}
	second, err := deviceSafetyIdentifier("device_two")
	if err != nil {
		t.Fatalf("derive second safety identifier: %v", err)
	}
	if first != repeated || first == second {
		t.Fatalf("safety identifiers first=%q repeated=%q second=%q", first, repeated, second)
	}
	if len(first) > 64 {
		t.Fatalf("safety identifier length = %d, want at most 64", len(first))
	}
}

func TestSpeechServiceUnconfiguredTranscriptionDoesNotCallProvider(t *testing.T) {
	provider := &serviceTestProvider{}
	service := newServiceTestService(t, provider)
	_, err := service.CreateTranscriptionSession(context.Background(), "device_one")
	assertSpeechServiceErrorCode(t, err, ErrorNotConfigured)
	if provider.transcriptionCalls != 0 {
		t.Fatalf("unexpected provider calls: %+v", provider)
	}
}

func TestSpeechServiceInitializesAndReadsStableVoiceConfiguration(t *testing.T) {
	store := &serviceTestVoiceConfigurationStore{}
	now := time.Date(2026, 7, 12, 18, 0, 0, 0, time.UTC)
	service, err := NewService(context.Background(), ServiceConfig{
		ProviderController:      staticProviderController{provider: &serviceTestProvider{}},
		SourceResolver:          &serviceTestSourceResolver{},
		VoiceConfigurationStore: store,
		Now:                     func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	selection, err := service.ReadMasterVoiceSelection(context.Background())
	if err != nil {
		t.Fatalf("read master voice selection: %v", err)
	}
	if selection.Selection != VoiceSelectionExact || selection.RequestedVoiceID == nil ||
		selection.ResolvedVoiceID == nil || *selection.RequestedVoiceID != SpeechVoiceMarin ||
		*selection.ResolvedVoiceID != SpeechVoiceMarin ||
		selection.UpdatedAt != "2026-07-12T18:00:00Z" {
		t.Fatalf("master voice selection = %+v", selection)
	}
	*selection.ResolvedVoiceID = SpeechVoiceCedar
	reloaded, err := service.ReadMasterVoiceSelection(context.Background())
	if err != nil {
		t.Fatalf("reload master voice selection: %v", err)
	}
	if reloaded.ResolvedVoiceID == nil || *reloaded.ResolvedVoiceID != SpeechVoiceMarin {
		t.Fatalf("reloaded master voice selection = %+v, err=%v", reloaded, err)
	}
	narratorDefault, err := service.ReadNarratorVoiceDefault(context.Background())
	if err != nil {
		t.Fatalf("read narrator voice default: %v", err)
	}
	if narratorDefault.Selection != VoiceSelectionAutoDistinct ||
		narratorDefault.RequestedVoiceID != nil ||
		narratorDefault.UpdatedAt != "2026-07-12T18:00:00Z" {
		t.Fatalf("narrator voice default = %+v", narratorDefault)
	}
	now = now.Add(time.Second)
	updatedDefault, err := service.UpdateNarratorVoiceDefault(
		context.Background(),
		VoiceSelectionRequest{
			Selection:        VoiceSelectionExact,
			RequestedVoiceID: voiceIDPointer(SpeechVoiceCedar),
		},
	)
	if err != nil || updatedDefault.RequestedVoiceID == nil ||
		*updatedDefault.RequestedVoiceID != SpeechVoiceCedar {
		t.Fatalf("updated narrator voice default = %+v, err=%v", updatedDefault, err)
	}
}

func TestSpeechServicePreservesTranscriptionProviderFailure(t *testing.T) {
	providerFailure := errors.New("transcription provider failed")
	provider := &serviceTestProvider{configured: true, transcriptionErr: providerFailure}
	service := newServiceTestService(t, provider)
	_, err := service.CreateTranscriptionSession(context.Background(), "device_one")
	if !errors.Is(err, providerFailure) {
		t.Fatalf("error = %v, want provider failure", err)
	}
}

func TestSpeechServiceSynthesizesOnlyAuthoritativeSourceWithResolvedVoice(t *testing.T) {
	conversationID := "conversation-1"
	source := SpeechSource{
		Speaker:        SpeechSpeakerNarrator,
		EventID:        "status-reply-1",
		ConversationID: &conversationID,
	}
	provider := &serviceTestProvider{
		configured: true,
		synthesized: SynthesizedAudio{
			Bytes:     validTestWAV(),
			MediaType: SynthesisMediaType,
			Format:    SynthesisFormat,
		},
	}
	resolver := &serviceTestSourceResolver{resolved: ResolvedSpeechSource{
		Source:          source,
		Text:            "The topic agent is still working.",
		ResolvedVoiceID: SpeechVoiceCedar,
	}}
	service := newServiceTestServiceWithResolver(t, provider, resolver)
	audio, err := service.SynthesizeSpeech(context.Background(), SpeechSynthesisRequest{
		Source:          source,
		ResolvedVoiceID: SpeechVoiceCedar,
	})
	if err != nil {
		t.Fatalf("synthesize authoritative source: %v", err)
	}
	if resolver.calls != 1 || provider.synthesisCalls != 1 ||
		provider.synthesisText != resolver.resolved.Text ||
		provider.synthesisVoiceID != SpeechVoiceCedar ||
		!equalSpeechSources(audio.Source, source) ||
		audio.ResolvedVoiceID != SpeechVoiceCedar {
		t.Fatalf("resolver=%+v provider=%+v audio=%+v", resolver, provider, audio)
	}

	_, err = service.SynthesizeSpeech(context.Background(), SpeechSynthesisRequest{
		Source:          source,
		ResolvedVoiceID: SpeechVoiceAlloy,
	})
	assertSpeechServiceErrorCode(t, err, ErrorSourceUnavailable)
	if provider.synthesisCalls != 1 {
		t.Fatalf("provider calls after stale voice = %d, want 1", provider.synthesisCalls)
	}
}

func TestSpeechServiceRejectsUnavailableSynthesisBeforeProviderCall(t *testing.T) {
	provider := &serviceTestProvider{configured: true}
	resolver := &serviceTestSourceResolver{err: SourceUnavailable("source missing", nil)}
	service := newServiceTestServiceWithResolver(t, provider, resolver)
	_, err := service.SynthesizeSpeech(context.Background(), SpeechSynthesisRequest{
		Source:          SpeechSource{Speaker: SpeechSpeakerMaster, EventID: "master-answer-1"},
		ResolvedVoiceID: SpeechVoiceMarin,
	})
	assertSpeechServiceErrorCode(t, err, ErrorSourceUnavailable)
	if provider.synthesisCalls != 0 {
		t.Fatalf("provider synthesis calls = %d, want 0", provider.synthesisCalls)
	}
}

func TestSpeechServiceSnapshotsSynthesisProviderBeforeResolvingSource(t *testing.T) {
	source := SpeechSource{Speaker: SpeechSpeakerMaster, EventID: "master-answer-1"}
	originalProvider := &serviceTestProvider{
		configured: true,
		synthesized: SynthesizedAudio{
			Bytes:     validTestWAV(),
			MediaType: SynthesisMediaType,
			Format:    SynthesisFormat,
		},
	}
	replacementProvider := &serviceTestProvider{
		configured: true,
		synthesized: SynthesizedAudio{
			Bytes:     validTestWAV(),
			MediaType: SynthesisMediaType,
			Format:    SynthesisFormat,
		},
	}
	controller := &mutableServiceProviderController{provider: originalProvider}
	resolver := &blockingServiceTestSourceResolver{
		resolved: ResolvedSpeechSource{
			Source:          source,
			Text:            "The topic agent is still working.",
			ResolvedVoiceID: SpeechVoiceMarin,
		},
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	service := newServiceTestServiceWithControllerAndResolver(t, controller, resolver)
	done := make(chan error, 1)
	go func() {
		_, err := service.SynthesizeSpeech(context.Background(), SpeechSynthesisRequest{
			Source:          source,
			ResolvedVoiceID: SpeechVoiceMarin,
		})
		done <- err
	}()
	<-resolver.entered
	controller.setProvider(replacementProvider)
	close(resolver.release)
	if err := <-done; err != nil {
		t.Fatalf("synthesize speech: %v", err)
	}
	if originalProvider.synthesisCalls != 1 || replacementProvider.synthesisCalls != 0 {
		t.Fatalf(
			"synthesis calls original=%d replacement=%d, want original snapshot only",
			originalProvider.synthesisCalls,
			replacementProvider.synthesisCalls,
		)
	}
}

type serviceTestProvider struct {
	configured         bool
	clientSecret       SpeechTranscriptionClientSecret
	transcriptionErr   error
	safetyIdentifier   string
	transcriptionCalls int
	synthesized        SynthesizedAudio
	synthesisErr       error
	synthesisText      string
	synthesisVoiceID   SpeechVoiceID
	synthesisCalls     int
}

type serviceTestSourceResolver struct {
	resolved ResolvedSpeechSource
	err      error
	calls    int
}

type blockingServiceTestSourceResolver struct {
	resolved ResolvedSpeechSource
	err      error
	entered  chan struct{}
	release  chan struct{}
}

type serviceTestVoiceConfigurationStore struct {
	narratorDefault *NarratorVoiceDefault
	selection       *MasterVoiceSelection
}

type staticProviderController struct {
	provider Provider
}

type mutableServiceProviderController struct {
	provider Provider
}

func (store *serviceTestVoiceConfigurationStore) EnsureMasterVoiceSelection(
	_ context.Context,
	initial MasterVoiceSelection,
) (MasterVoiceSelection, error) {
	if store.selection == nil {
		cloned := CloneMasterVoiceSelection(initial)
		store.selection = &cloned
	}
	return CloneMasterVoiceSelection(*store.selection), nil
}

func (store *serviceTestVoiceConfigurationStore) EnsureNarratorVoiceDefault(
	_ context.Context,
	initial NarratorVoiceDefault,
) (NarratorVoiceDefault, error) {
	if store.narratorDefault == nil {
		cloned := CloneNarratorVoiceDefault(initial)
		store.narratorDefault = &cloned
	}
	return CloneNarratorVoiceDefault(*store.narratorDefault), nil
}

func (store *serviceTestVoiceConfigurationStore) ReadMasterVoiceSelection(
	context.Context,
) (MasterVoiceSelection, error) {
	if store.selection == nil {
		return MasterVoiceSelection{}, errors.New("master voice selection is missing")
	}
	return CloneMasterVoiceSelection(*store.selection), nil
}

func (store *serviceTestVoiceConfigurationStore) ReadNarratorVoiceDefault(
	context.Context,
) (NarratorVoiceDefault, error) {
	if store.narratorDefault == nil {
		return NarratorVoiceDefault{}, errors.New("narrator voice default is missing")
	}
	return CloneNarratorVoiceDefault(*store.narratorDefault), nil
}

func (store *serviceTestVoiceConfigurationStore) UpdateMasterVoiceSelection(
	_ context.Context,
	request VoiceSelectionRequest,
	updatedAt string,
) (MasterVoiceSelection, error) {
	selection, err := ResolveMasterVoiceSelection(request, nil, updatedAt)
	if err != nil {
		return MasterVoiceSelection{}, err
	}
	cloned := CloneMasterVoiceSelection(selection)
	store.selection = &cloned
	return CloneMasterVoiceSelection(cloned), nil
}

func (store *serviceTestVoiceConfigurationStore) UpdateNarratorVoiceDefault(
	_ context.Context,
	request VoiceSelectionRequest,
	updatedAt string,
) (NarratorVoiceDefault, error) {
	if err := request.Validate(); err != nil {
		return NarratorVoiceDefault{}, err
	}
	value := NarratorVoiceDefault{
		Selection:        request.Selection,
		RequestedVoiceID: cloneVoiceID(request.RequestedVoiceID),
		UpdatedAt:        updatedAt,
	}
	if err := value.Validate(); err != nil {
		return NarratorVoiceDefault{}, err
	}
	cloned := CloneNarratorVoiceDefault(value)
	store.narratorDefault = &cloned
	return CloneNarratorVoiceDefault(cloned), nil
}

func (provider *serviceTestProvider) Configured() bool {
	return provider.configured
}

func (provider *serviceTestProvider) CreateTranscriptionClientSecret(_ context.Context, safetyIdentifier string) (SpeechTranscriptionClientSecret, error) {
	provider.transcriptionCalls++
	provider.safetyIdentifier = safetyIdentifier
	return provider.clientSecret, provider.transcriptionErr
}

func (provider *serviceTestProvider) SynthesizeSpeech(
	_ context.Context,
	text string,
	voiceID SpeechVoiceID,
) (SynthesizedAudio, error) {
	provider.synthesisCalls++
	provider.synthesisText = text
	provider.synthesisVoiceID = voiceID
	return provider.synthesized, provider.synthesisErr
}

func (resolver *serviceTestSourceResolver) ResolveSpeechSource(
	context.Context,
	SpeechSource,
) (ResolvedSpeechSource, error) {
	resolver.calls++
	return resolver.resolved, resolver.err
}

func (resolver *blockingServiceTestSourceResolver) ResolveSpeechSource(
	context.Context,
	SpeechSource,
) (ResolvedSpeechSource, error) {
	close(resolver.entered)
	<-resolver.release
	return resolver.resolved, resolver.err
}

func (controller staticProviderController) Configured() bool {
	return controller.provider != nil && controller.provider.Configured()
}

func (controller staticProviderController) Snapshot() Provider {
	return controller.provider
}

func (staticProviderController) Shutdown() {}

func (controller *mutableServiceProviderController) Configured() bool {
	return controller.provider != nil && controller.provider.Configured()
}

func (controller *mutableServiceProviderController) Snapshot() Provider {
	return controller.provider
}

func (controller *mutableServiceProviderController) Shutdown() {
	controller.provider = nil
}

func (controller *mutableServiceProviderController) setProvider(provider Provider) {
	controller.provider = provider
}

func newServiceTestService(t *testing.T, provider Provider) *Service {
	t.Helper()
	return newServiceTestServiceWithResolver(t, provider, &serviceTestSourceResolver{})
}

func newServiceTestServiceWithResolver(
	t *testing.T,
	provider Provider,
	resolver SourceResolver,
) *Service {
	t.Helper()
	return newServiceTestServiceWithControllerAndResolver(
		t,
		staticProviderController{provider: provider},
		resolver,
	)
}

func newServiceTestServiceWithControllerAndResolver(
	t *testing.T,
	providerController ProviderController,
	resolver SourceResolver,
) *Service {
	t.Helper()
	service, err := NewService(context.Background(), ServiceConfig{
		ProviderController:      providerController,
		SourceResolver:          resolver,
		VoiceConfigurationStore: &serviceTestVoiceConfigurationStore{},
		Now: func() time.Time {
			return time.Date(2026, 7, 12, 18, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func assertSpeechServiceErrorCode(t *testing.T, err error, want ErrorCode) {
	t.Helper()
	speechError, ok := AsError(err)
	if !ok || speechError.Code != want {
		t.Fatalf("error = %v, want speech code %s", err, want)
	}
}
