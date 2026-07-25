package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
)

func TestRuntimeDiagnosticsReportsStructuredLocalState(t *testing.T) {
	appDataDir := t.TempDir()
	releasePath := filepath.Join(appDataDir, "runtime-install", "current.json")
	writeRuntimeDiagnosticJSON(t, releasePath, map[string]any{
		"schemaVersion": 1,
		"version":       "v1.2.3",
	})
	policyPath := filepath.Join(appDataDir, "runtime", "policy.json")
	writeRuntimeDiagnosticJSON(t, policyPath, map[string]any{
		"schemaVersion": 1,
		"rules": []map[string]any{
			{"action": "deny", "domain": "smtp.example"},
		},
	})
	codexCommand, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	leaseManager := &fakeRuntimeWorkloadLeaseManager{
		lease: runtimeprovider.WorkloadLease{
			Name:      "setta-agent",
			StartedAt: now.Add(-time.Minute),
			ExpiresAt: now.Add(time.Minute),
		},
		found: true,
	}
	service := newRuntimeDiagnosticsService(runtimeDiagnosticsConfig{
		AppDataDir:                  appDataDir,
		CodexAccountService:         fakeRuntimeCodexAccountReader{state: signedInRuntimeCodexAccountState()},
		CodexCommand:                codexCommand,
		Now:                         func() time.Time { return now },
		PolicyPath:                  policyPath,
		ReleaseMetadataPath:         releasePath,
		RuntimeVersion:              "v1.2.3",
		WorkloadLeaseDiagnosticName: "setta-agent",
		WorkloadLeaseManager:        leaseManager,
	})

	diagnostics := service.RuntimeDiagnostics(context.Background())

	if diagnostics.SettaRelease.Status != runtimecapability.DiagnosticStatusOK ||
		diagnostics.Codex.Status != runtimecapability.DiagnosticStatusOK ||
		diagnostics.WorkloadLease.Status != runtimecapability.DiagnosticStatusOK ||
		diagnostics.Policy.Status != runtimecapability.DiagnosticStatusOK ||
		diagnostics.DiskSpace.Status != runtimecapability.DiagnosticStatusOK ||
		diagnostics.ProtectedState.Status != runtimecapability.DiagnosticStatusOK {
		t.Fatalf("diagnostics = %+v", diagnostics)
	}
	if leaseManager.inspectName != "setta-agent" || leaseManager.inspectCalls != 1 {
		t.Fatalf("lease manager inspect name=%q calls=%d", leaseManager.inspectName, leaseManager.inspectCalls)
	}
	if diagnostics.Codex.Authentication.AccountType != string(codexaccount.AccountTypeChatGPT) ||
		diagnostics.Codex.Authentication.AccountStatus != string(codexaccount.AccountStatusSignedIn) {
		t.Fatalf("codex authentication diagnostic = %+v", diagnostics.Codex.Authentication)
	}
	payload, err := json.Marshal(diagnostics)
	if err != nil {
		t.Fatalf("marshal diagnostics: %v", err)
	}
	if strings.Contains(string(payload), "secret@example.com") ||
		strings.Contains(string(payload), "token") ||
		strings.Contains(string(payload), "user-code") {
		t.Fatalf("diagnostic payload exposed sensitive account material: %s", payload)
	}
}

func TestRuntimeDiagnosticsDistinguishesUnavailableUnknownAndFailing(t *testing.T) {
	if goruntime.GOOS == "windows" {
		t.Skip("POSIX protected-state mode assertions are not meaningful on Windows")
	}
	appDataDir := t.TempDir()
	policyPath := filepath.Join(appDataDir, "runtime", "policy.json")
	if err := os.MkdirAll(filepath.Dir(policyPath), 0o755); err != nil {
		t.Fatalf("create policy dir: %v", err)
	}
	if err := os.WriteFile(policyPath, []byte("{"), 0o600); err != nil {
		t.Fatalf("write policy: %v", err)
	}
	unprotectedDir := filepath.Join(appDataDir, "unprotected")
	if err := os.Mkdir(unprotectedDir, 0o777); err != nil {
		t.Fatalf("create unprotected dir: %v", err)
	}
	if err := os.Chmod(unprotectedDir, 0o777); err != nil {
		t.Fatalf("chmod unprotected dir: %v", err)
	}
	codexCommand, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	service := newRuntimeDiagnosticsService(runtimeDiagnosticsConfig{
		AppDataDir:               appDataDir,
		CodexAccountService:      fakeRuntimeCodexAccountReader{state: codexaccount.CodexAccountState{Status: codexaccount.AccountStatusUnauthenticated}},
		CodexCommand:             codexCommand,
		DiskSpacePath:            filepath.Join(appDataDir, "missing-disk-path"),
		Now:                      func() time.Time { return time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC) },
		PolicyPath:               policyPath,
		ProtectedRuntimeStateDir: unprotectedDir,
		RuntimeVersion:           "v1.2.3",
	})

	diagnostics := service.RuntimeDiagnostics(context.Background())

	if diagnostics.SettaRelease.Status != runtimecapability.DiagnosticStatusUnknown ||
		diagnostics.SettaRelease.ReasonCode != "release_metadata_not_found" {
		t.Fatalf("release diagnostic = %+v", diagnostics.SettaRelease)
	}
	if diagnostics.Codex.Status != runtimecapability.DiagnosticStatusFailing ||
		diagnostics.Codex.Binary.Status != runtimecapability.DiagnosticStatusOK ||
		diagnostics.Codex.Authentication.Status != runtimecapability.DiagnosticStatusFailing {
		t.Fatalf("codex diagnostic = %+v", diagnostics.Codex)
	}
	if diagnostics.WorkloadLease.Status != runtimecapability.DiagnosticStatusUnavailable {
		t.Fatalf("workload lease diagnostic = %+v", diagnostics.WorkloadLease)
	}
	if diagnostics.Policy.Status != runtimecapability.DiagnosticStatusFailing ||
		diagnostics.DiskSpace.Status != runtimecapability.DiagnosticStatusFailing ||
		diagnostics.ProtectedState.Status != runtimecapability.DiagnosticStatusFailing {
		t.Fatalf("diagnostics = %+v", diagnostics)
	}
}

func TestRuntimeDiagnosticsReportsWorkloadLeaseInspectFailure(t *testing.T) {
	appDataDir := t.TempDir()
	service := newRuntimeDiagnosticsService(runtimeDiagnosticsConfig{
		AppDataDir:                  appDataDir,
		CodexAccountService:         fakeRuntimeCodexAccountReader{state: signedInRuntimeCodexAccountState()},
		CodexCommand:                "missing-codex",
		Now:                         func() time.Time { return time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC) },
		WorkloadLeaseDiagnosticName: "setta-agent",
		WorkloadLeaseManager:        &fakeRuntimeWorkloadLeaseManager{err: errors.New("inspect failed")},
	})

	diagnostics := service.RuntimeDiagnostics(context.Background())

	if diagnostics.WorkloadLease.Status != runtimecapability.DiagnosticStatusFailing ||
		diagnostics.WorkloadLease.ReasonCode != "workload_lease_inspect_failed" {
		t.Fatalf("workload lease diagnostic = %+v", diagnostics.WorkloadLease)
	}
}

type fakeRuntimeCodexAccountReader struct {
	state codexaccount.CodexAccountState
	err   error
}

func (reader fakeRuntimeCodexAccountReader) Read(context.Context) (codexaccount.CodexAccountState, error) {
	return reader.state, reader.err
}

func signedInRuntimeCodexAccountState() codexaccount.CodexAccountState {
	return codexaccount.CodexAccountState{
		Status:             codexaccount.AccountStatusSignedIn,
		RequiresOpenAIAuth: true,
		Account: &codexaccount.CodexAccount{
			Type:  codexaccount.AccountTypeChatGPT,
			Email: "secret@example.com",
		},
	}
}

type fakeRuntimeWorkloadLeaseManager struct {
	lease        runtimeprovider.WorkloadLease
	found        bool
	err          error
	inspectName  string
	inspectCalls int
}

func (manager *fakeRuntimeWorkloadLeaseManager) Acquire(context.Context, runtimeprovider.WorkloadLeaseRequest) (runtimeprovider.WorkloadLease, error) {
	return runtimeprovider.WorkloadLease{}, errors.New("unexpected acquire")
}

func (manager *fakeRuntimeWorkloadLeaseManager) Renew(context.Context, string, time.Duration) (runtimeprovider.WorkloadLease, error) {
	return runtimeprovider.WorkloadLease{}, errors.New("unexpected renew")
}

func (manager *fakeRuntimeWorkloadLeaseManager) Inspect(_ context.Context, name string) (runtimeprovider.WorkloadLease, bool, error) {
	manager.inspectName = name
	manager.inspectCalls++
	return manager.lease, manager.found, manager.err
}

func (manager *fakeRuntimeWorkloadLeaseManager) Release(context.Context, string) error {
	return errors.New("unexpected release")
}

func writeRuntimeDiagnosticJSON(t *testing.T, path string, value any) {
	t.Helper()
	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s: %v", path, err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create %s dir: %v", path, err)
	}
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
