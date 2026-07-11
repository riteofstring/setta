package speech

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/easyrun"
	"setta/internal/workspace"
)

func TestNewSpeechServiceRequiresDependencies(t *testing.T) {
	configuredProvider := &serviceTestProvider{configured: true}
	snapshots := &serviceTestSnapshotReader{}
	workspaces := newServiceTestWorkspaceResolver()
	tests := []struct {
		name   string
		config ServiceConfig
	}{
		{name: "provider", config: ServiceConfig{EasyRunSnapshots: snapshots, Workspaces: workspaces}},
		{name: "snapshots", config: ServiceConfig{Provider: configuredProvider, Workspaces: workspaces}},
		{name: "workspaces", config: ServiceConfig{Provider: configuredProvider, EasyRunSnapshots: snapshots}},
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
			service := newServiceTestService(t, &serviceTestProvider{configured: configured}, easyrun.EasyRunSnapshot{})
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
	service := newServiceTestService(t, provider, easyrun.EasyRunSnapshot{})

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
	if len(first) != len(safetyIdentifierPrefix)+64 {
		t.Fatalf("safety identifier length = %d, want %d", len(first), len(safetyIdentifierPrefix)+64)
	}
}

func TestSpeechServiceSynthesizesExactPersistedTerminalSummaries(t *testing.T) {
	for _, status := range []easyrun.EasyRunStatus{
		easyrun.EasyRunStatusCompleted,
		easyrun.EasyRunStatusFailed,
		easyrun.EasyRunStatusStopped,
	} {
		t.Run(string(status), func(t *testing.T) {
			summary := "The exact persisted " + string(status) + " summary."
			provider := validServiceTestProvider()
			run := serviceTestRun(status, &summary)
			service := newServiceTestService(t, provider, easyrun.EasyRunSnapshot{LatestRun: &run})

			audio, err := service.SynthesizeEasyRunSummary(context.Background(), run.WorkspaceID, run.ID)
			if err != nil {
				t.Fatalf("synthesize summary: %v", err)
			}
			if provider.synthesisText != summary || provider.synthesisCalls != 1 {
				t.Fatalf("synthesis text = %q calls=%d, want exact persisted summary", provider.synthesisText, provider.synthesisCalls)
			}
			if audio.SourceID != run.ID || audio.AudioBase64 != base64.StdEncoding.EncodeToString(validTestWAV()) {
				t.Fatalf("audio = %+v, want run source and fixture WAV", audio)
			}
			if err := ValidateSpeechAudio(audio); err != nil {
				t.Fatalf("validate audio: %v", err)
			}
		})
	}
}

func TestSpeechServiceRejectsUnavailableSummarySourcesBeforeProvider(t *testing.T) {
	summary := "Persisted terminal summary."
	whitespaceSummary := " Persisted terminal summary. "
	oversizedSummary := strings.Repeat("界", MaximumSynthesisCharacters+1)
	terminalRun := serviceTestRun(easyrun.EasyRunStatusCompleted, &summary)
	tests := []struct {
		name      string
		requestID string
		latestRun *easyrun.EasyRun
	}{
		{name: "no latest run", requestID: terminalRun.ID},
		{name: "stale run id", requestID: "easy_run_old", latestRun: &terminalRun},
		{name: "working run", requestID: terminalRun.ID, latestRun: pointerToServiceTestRun(easyrun.EasyRunStatusWorking, nil)},
		{name: "invalid run status", requestID: terminalRun.ID, latestRun: pointerToServiceTestRun("unknown", &summary)},
		{name: "missing summary", requestID: terminalRun.ID, latestRun: pointerToServiceTestRun(easyrun.EasyRunStatusCompleted, nil)},
		{name: "whitespace-mutated summary", requestID: terminalRun.ID, latestRun: pointerToServiceTestRun(easyrun.EasyRunStatusCompleted, &whitespaceSummary)},
		{name: "oversized summary", requestID: terminalRun.ID, latestRun: pointerToServiceTestRun(easyrun.EasyRunStatusCompleted, &oversizedSummary)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider := validServiceTestProvider()
			service := newServiceTestService(t, provider, easyrun.EasyRunSnapshot{LatestRun: test.latestRun})
			_, err := service.SynthesizeEasyRunSummary(context.Background(), terminalRun.WorkspaceID, test.requestID)
			assertSpeechServiceErrorCode(t, err, ErrorSourceUnavailable)
			if provider.synthesisCalls != 0 {
				t.Fatalf("synthesis calls = %d, want 0", provider.synthesisCalls)
			}
		})
	}
}

func TestSpeechServiceRejectsUnknownWorkspaceBeforeProvider(t *testing.T) {
	provider := validServiceTestProvider()
	reader := &serviceTestSnapshotReader{}
	resolver := &serviceTestWorkspaceResolver{workspaces: map[string]workspace.WorkspaceSummary{}}
	service, err := NewService(ServiceConfig{
		Provider:         provider,
		EasyRunSnapshots: reader,
		Workspaces:       resolver,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	_, err = service.CreateTranscriptionSession(context.Background(), "workspace_missing", "device_one")
	if err == nil || !strings.Contains(err.Error(), "workspace not found") {
		t.Fatalf("transcription error = %v, want missing workspace", err)
	}
	_, err = service.SynthesizeEasyRunSummary(context.Background(), "workspace_missing", "easy_run_missing")
	if err == nil || !strings.Contains(err.Error(), "workspace not found") {
		t.Fatalf("summary error = %v, want missing workspace", err)
	}
	if provider.transcriptionCalls != 0 || provider.synthesisCalls != 0 || reader.calls != 0 || resolver.calls != 2 {
		t.Fatalf("unexpected work provider=%+v snapshotCalls=%d workspaceCalls=%d", provider, reader.calls, resolver.calls)
	}
}

func TestSpeechServiceSynthesizesOnlyExactOwnedHighlight(t *testing.T) {
	run := serviceTestRun(easyrun.EasyRunStatusWorking, nil)
	highlight := easyrun.EasyHighlight{
		ID:        "highlight_exact",
		EasyRunID: run.ID,
		Text:      "The exact persisted highlight.",
	}
	provider := validServiceTestProvider()
	service := newServiceTestService(t, provider, easyrun.EasyRunSnapshot{
		LatestRun:  &run,
		Highlights: []easyrun.EasyHighlight{highlight},
	})

	audio, err := service.SynthesizeEasyRunHighlight(context.Background(), run.WorkspaceID, run.ID, highlight.ID)
	if err != nil {
		t.Fatalf("synthesize highlight: %v", err)
	}
	if provider.synthesisText != highlight.Text || provider.synthesisCalls != 1 || audio.SourceID != highlight.ID {
		t.Fatalf("provider text=%q calls=%d audio=%+v", provider.synthesisText, provider.synthesisCalls, audio)
	}
}

func TestSpeechServiceRejectsUnknownAndMismatchedHighlightsBeforeProvider(t *testing.T) {
	run := serviceTestRun(easyrun.EasyRunStatusWorking, nil)
	tests := []struct {
		name      string
		highlight easyrun.EasyHighlight
		requested string
	}{
		{
			name:      "unknown",
			highlight: easyrun.EasyHighlight{ID: "highlight_other", EasyRunID: run.ID, Text: "Other highlight."},
			requested: "highlight_missing",
		},
		{
			name:      "wrong run",
			highlight: easyrun.EasyHighlight{ID: "highlight_requested", EasyRunID: "easy_run_other", Text: "Mismatched highlight."},
			requested: "highlight_requested",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider := validServiceTestProvider()
			service := newServiceTestService(t, provider, easyrun.EasyRunSnapshot{
				LatestRun:  &run,
				Highlights: []easyrun.EasyHighlight{test.highlight},
			})
			_, err := service.SynthesizeEasyRunHighlight(context.Background(), run.WorkspaceID, run.ID, test.requested)
			assertSpeechServiceErrorCode(t, err, ErrorSourceUnavailable)
			if provider.synthesisCalls != 0 {
				t.Fatalf("synthesis calls = %d, want 0", provider.synthesisCalls)
			}
		})
	}
}

func TestSpeechServiceUnconfiguredOperationsDoNotReadWorkspaceOrCallProvider(t *testing.T) {
	provider := &serviceTestProvider{}
	resolver := &serviceTestWorkspaceResolver{}
	reader := &serviceTestSnapshotReader{}
	service, err := NewService(ServiceConfig{Provider: provider, EasyRunSnapshots: reader, Workspaces: resolver})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	operations := []func() error{
		func() error {
			_, err := service.CreateTranscriptionSession(context.Background(), "workspace_missing", "device_one")
			return err
		},
		func() error {
			_, err := service.SynthesizeEasyRunSummary(context.Background(), "workspace_missing", "easy_run_missing")
			return err
		},
		func() error {
			_, err := service.SynthesizeEasyRunHighlight(context.Background(), "workspace_missing", "easy_run_missing", "highlight_missing")
			return err
		},
	}
	for _, operation := range operations {
		assertSpeechServiceErrorCode(t, operation(), ErrorNotConfigured)
	}
	if provider.transcriptionCalls != 0 || provider.synthesisCalls != 0 || reader.calls != 0 || resolver.calls != 0 {
		t.Fatalf("unexpected work provider=%+v snapshotCalls=%d workspaceCalls=%d", provider, reader.calls, resolver.calls)
	}
}

func TestSpeechServicePreservesProviderFailureAndRejectsInvalidAudio(t *testing.T) {
	summary := "Persisted terminal summary."
	run := serviceTestRun(easyrun.EasyRunStatusCompleted, &summary)
	providerFailure := &Error{Code: ErrorRateLimited, Message: "OpenAI speech rate limit or quota was reached."}
	provider := validServiceTestProvider()
	provider.synthesisErr = providerFailure
	service := newServiceTestService(t, provider, easyrun.EasyRunSnapshot{LatestRun: &run})
	_, err := service.SynthesizeEasyRunSummary(context.Background(), run.WorkspaceID, run.ID)
	if !errors.Is(err, providerFailure) {
		t.Fatalf("error = %v, want provider failure", err)
	}

	provider = validServiceTestProvider()
	provider.audio.Bytes = []byte("not WAV")
	service = newServiceTestService(t, provider, easyrun.EasyRunSnapshot{LatestRun: &run})
	_, err = service.SynthesizeEasyRunSummary(context.Background(), run.WorkspaceID, run.ID)
	assertSpeechServiceErrorCode(t, err, ErrorProviderResponseMalformed)
}

func TestSpeechServicePreservesSnapshotFailure(t *testing.T) {
	provider := validServiceTestProvider()
	snapshotErr := errors.New("snapshot storage failed")
	reader := &serviceTestSnapshotReader{err: snapshotErr}
	service, err := NewService(ServiceConfig{
		Provider:         provider,
		EasyRunSnapshots: reader,
		Workspaces:       newServiceTestWorkspaceResolver(),
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	_, err = service.SynthesizeEasyRunSummary(context.Background(), "workspace_api", "easy_run_latest")
	if !errors.Is(err, snapshotErr) {
		t.Fatalf("error = %v, want snapshot failure", err)
	}
	if provider.synthesisCalls != 0 {
		t.Fatalf("synthesis calls = %d, want 0", provider.synthesisCalls)
	}
}

type serviceTestProvider struct {
	configured         bool
	clientSecret       SpeechTranscriptionClientSecret
	transcriptionErr   error
	audio              SynthesizedAudio
	synthesisErr       error
	safetyIdentifier   string
	synthesisText      string
	transcriptionCalls int
	synthesisCalls     int
}

func (provider *serviceTestProvider) Configured() bool {
	return provider.configured
}

func (provider *serviceTestProvider) CreateTranscriptionClientSecret(_ context.Context, safetyIdentifier string) (SpeechTranscriptionClientSecret, error) {
	provider.transcriptionCalls++
	provider.safetyIdentifier = safetyIdentifier
	return provider.clientSecret, provider.transcriptionErr
}

func (provider *serviceTestProvider) SynthesizeSpeech(_ context.Context, text string) (SynthesizedAudio, error) {
	provider.synthesisCalls++
	provider.synthesisText = text
	return provider.audio, provider.synthesisErr
}

type serviceTestSnapshotReader struct {
	snapshot easyrun.EasyRunSnapshot
	err      error
	calls    int
}

func (reader *serviceTestSnapshotReader) ReadSnapshot(string) (easyrun.EasyRunSnapshot, error) {
	reader.calls++
	return reader.snapshot, reader.err
}

type serviceTestWorkspaceResolver struct {
	workspaces map[string]workspace.WorkspaceSummary
	calls      int
}

func (resolver *serviceTestWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
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

func validServiceTestProvider() *serviceTestProvider {
	return &serviceTestProvider{
		configured: true,
		audio: SynthesizedAudio{
			Bytes:     bytes.Clone(validTestWAV()),
			MediaType: SynthesisMediaType,
			Format:    SynthesisFormat,
		},
	}
}

func newServiceTestService(t *testing.T, provider Provider, snapshot easyrun.EasyRunSnapshot) *Service {
	t.Helper()
	service, err := NewService(ServiceConfig{
		Provider:         provider,
		EasyRunSnapshots: &serviceTestSnapshotReader{snapshot: snapshot},
		Workspaces:       newServiceTestWorkspaceResolver(),
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func serviceTestRun(status easyrun.EasyRunStatus, summary *string) easyrun.EasyRun {
	return easyrun.EasyRun{
		ID:          "easy_run_latest",
		WorkspaceID: "workspace_api",
		Status:      status,
		Summary:     summary,
	}
}

func pointerToServiceTestRun(status easyrun.EasyRunStatus, summary *string) *easyrun.EasyRun {
	run := serviceTestRun(status, summary)
	return &run
}

func assertSpeechServiceErrorCode(t *testing.T, err error, want ErrorCode) {
	t.Helper()
	speechError, ok := AsError(err)
	if !ok || speechError.Code != want {
		t.Fatalf("error = %v, want speech code %s", err, want)
	}
}
