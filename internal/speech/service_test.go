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
		Provider:                &serviceTestProvider{},
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

func TestSpeechServiceInitializesAndReadsStableMasterVoiceSelection(t *testing.T) {
	store := &serviceTestVoiceConfigurationStore{}
	now := time.Date(2026, 7, 12, 18, 0, 0, 0, time.UTC)
	service, err := NewService(context.Background(), ServiceConfig{
		Provider:                &serviceTestProvider{},
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

type serviceTestProvider struct {
	configured         bool
	clientSecret       SpeechTranscriptionClientSecret
	transcriptionErr   error
	safetyIdentifier   string
	transcriptionCalls int
}

type serviceTestVoiceConfigurationStore struct {
	selection *MasterVoiceSelection
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

func (store *serviceTestVoiceConfigurationStore) ReadMasterVoiceSelection(
	context.Context,
) (MasterVoiceSelection, error) {
	if store.selection == nil {
		return MasterVoiceSelection{}, errors.New("master voice selection is missing")
	}
	return CloneMasterVoiceSelection(*store.selection), nil
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

func (provider *serviceTestProvider) Configured() bool {
	return provider.configured
}

func (provider *serviceTestProvider) CreateTranscriptionClientSecret(_ context.Context, safetyIdentifier string) (SpeechTranscriptionClientSecret, error) {
	provider.transcriptionCalls++
	provider.safetyIdentifier = safetyIdentifier
	return provider.clientSecret, provider.transcriptionErr
}

func newServiceTestService(t *testing.T, provider Provider) *Service {
	t.Helper()
	service, err := NewService(context.Background(), ServiceConfig{
		Provider:                provider,
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
