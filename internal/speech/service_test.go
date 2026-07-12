package speech

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestNewSpeechServiceRequiresDependencies(t *testing.T) {
	configuredProvider := &serviceTestProvider{configured: true}
	workspaces := newServiceTestWorkspaceResolver()
	tests := []struct {
		name   string
		config ServiceConfig
	}{
		{name: "provider", config: ServiceConfig{Workspaces: workspaces}},
		{name: "workspaces", config: ServiceConfig{Provider: configuredProvider}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewService(test.config); err == nil {
				t.Fatal("NewService unexpectedly succeeded")
			}
		})
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

func TestSpeechServiceCreatesScopedTranscriptionSession(t *testing.T) {
	expiresAt := time.Now().Add(5 * time.Minute).UTC().Truncate(time.Second)
	provider := &serviceTestProvider{
		configured: true,
		clientSecret: SpeechTranscriptionClientSecret{
			Value:     "ek_test_scoped",
			ExpiresAt: expiresAt,
		},
	}
	service := newServiceTestService(t, provider)

	session, err := service.CreateTranscriptionSession(context.Background(), "workspace_api", "device_sensitive_principal")
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

func TestSpeechServiceRejectsUnknownWorkspaceBeforeProvider(t *testing.T) {
	provider := &serviceTestProvider{configured: true}
	resolver := &serviceTestWorkspaceResolver{workspaces: map[string]workspace.WorkspaceSummary{}}
	service, err := NewService(ServiceConfig{Provider: provider, Workspaces: resolver})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	_, err = service.CreateTranscriptionSession(context.Background(), "workspace_missing", "device_one")
	if err == nil || !strings.Contains(err.Error(), "workspace not found") {
		t.Fatalf("transcription error = %v, want missing workspace", err)
	}
	if provider.transcriptionCalls != 0 || resolver.calls != 1 {
		t.Fatalf("unexpected work provider=%+v workspaceCalls=%d", provider, resolver.calls)
	}
}

func TestSpeechServiceUnconfiguredTranscriptionDoesNotReadWorkspaceOrCallProvider(t *testing.T) {
	provider := &serviceTestProvider{}
	resolver := &serviceTestWorkspaceResolver{}
	service, err := NewService(ServiceConfig{Provider: provider, Workspaces: resolver})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	_, err = service.CreateTranscriptionSession(context.Background(), "workspace_missing", "device_one")
	assertSpeechServiceErrorCode(t, err, ErrorNotConfigured)
	if provider.transcriptionCalls != 0 || resolver.calls != 0 {
		t.Fatalf("unexpected work provider=%+v workspaceCalls=%d", provider, resolver.calls)
	}
}

func TestSpeechServicePreservesTranscriptionProviderFailure(t *testing.T) {
	providerFailure := errors.New("transcription provider failed")
	provider := &serviceTestProvider{configured: true, transcriptionErr: providerFailure}
	service := newServiceTestService(t, provider)
	_, err := service.CreateTranscriptionSession(context.Background(), "workspace_api", "device_one")
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

func (provider *serviceTestProvider) Configured() bool {
	return provider.configured
}

func (provider *serviceTestProvider) CreateTranscriptionClientSecret(_ context.Context, safetyIdentifier string) (SpeechTranscriptionClientSecret, error) {
	provider.transcriptionCalls++
	provider.safetyIdentifier = safetyIdentifier
	return provider.clientSecret, provider.transcriptionErr
}

type serviceTestWorkspaceResolver struct {
	workspaces map[string]workspace.WorkspaceSummary
	calls      int
}

func (resolver *serviceTestWorkspaceResolver) ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	resolver.calls++
	if summary, ok := resolver.workspaces[id]; ok {
		return summary, nil
	}
	return workspace.WorkspaceSummary{}, errors.New("workspace not found")
}

func newServiceTestWorkspaceResolver() *serviceTestWorkspaceResolver {
	return &serviceTestWorkspaceResolver{workspaces: map[string]workspace.WorkspaceSummary{
		"workspace_api": {ID: "workspace_api"},
	}}
}

func newServiceTestService(t *testing.T, provider Provider) *Service {
	t.Helper()
	service, err := NewService(ServiceConfig{
		Provider:   provider,
		Workspaces: newServiceTestWorkspaceResolver(),
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
