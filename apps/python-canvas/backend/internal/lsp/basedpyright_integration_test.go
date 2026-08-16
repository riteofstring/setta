package lsp

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project"
)

func TestPinnedBasedpyrightResolvesAndClearsMappedParameterDiagnostic(t *testing.T) {
	generatedFile, err := project.NewTemporaryGeneratedFile()
	if err != nil {
		t.Fatalf("NewTemporaryGeneratedFile() error = %v", err)
	}
	workspaceRoot := filepath.Dir(generatedFile.Path())
	provider, err := NewBasedpyrightProvider(BasedpyrightOptions{
		AppRoot:           appRootForIntegrationTest(t),
		WorkspaceRoot:     workspaceRoot,
		RequestTimeout:    20 * time.Second,
		DiagnosticTimeout: 15 * time.Second,
	})
	if err != nil {
		_ = generatedFile.Close()
		t.Fatalf("NewBasedpyrightProvider() error = %v", err)
	}
	store, err := project.NewStoreWithProvider(generatedFile, provider)
	if err != nil {
		_ = provider.Close()
		_ = generatedFile.Close()
		t.Fatalf("NewStoreWithProvider() error = %v", err)
	}
	generatedPath := store.GeneratedFilePath()
	defer func() {
		if err := store.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if _, err := os.Stat(workspaceRoot); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("temporary workspace stat after Close() = %v, want removed", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
	defer cancel()
	initial := store.Snapshot()
	callableSnapshot, err := store.CommitCallable(
		ctx,
		initial.Project.ID,
		initial.Callables[0].ID,
		"math.sqrt",
	)
	if err != nil {
		t.Fatalf("CommitCallable(math.sqrt) error = %v", err)
	}
	if callableSnapshot.Project.Revision != 2 {
		t.Fatalf("callable revision = %d, want 2", callableSnapshot.Project.Revision)
	}
	if len(callableSnapshot.Parameters) != 1 {
		t.Fatalf("math.sqrt parameters = %#v", callableSnapshot.Parameters)
	}
	parameter := callableSnapshot.Parameters[0]
	if parameter.Name != "x" || parameter.PassingStyle != contracts.ParameterPassingStylePositionalOnlyV1 {
		t.Fatalf("math.sqrt parameter = %#v", parameter)
	}
	requireReadyBasedpyrightStatus(t, callableSnapshot.ProviderStatus)

	missingSnapshot, err := store.SetParameterExpression(initial.Project.ID, parameter.ID, "missing_value")
	if err != nil {
		t.Fatalf("SetParameterExpression(missing_value) error = %v", err)
	}
	if missingSnapshot.Project.Revision != 3 {
		t.Fatalf("missing_value revision = %d, want 3", missingSnapshot.Project.Revision)
	}
	requireReadyBasedpyrightStatus(t, missingSnapshot.ProviderStatus)
	if !containsErrorForTarget(missingSnapshot.Diagnostics, parameter.ID) {
		t.Fatalf("missing_value diagnostics = %#v, want an error for %q", missingSnapshot.Diagnostics, parameter.ID)
	}

	clearedSnapshot, err := store.SetParameterExpression(initial.Project.ID, parameter.ID, "3")
	if err != nil {
		t.Fatalf("SetParameterExpression(3) error = %v", err)
	}
	if clearedSnapshot.Project.Revision != 4 {
		t.Fatalf("3 revision = %d, want 4", clearedSnapshot.Project.Revision)
	}
	requireReadyBasedpyrightStatus(t, clearedSnapshot.ProviderStatus)
	if containsErrorForTarget(clearedSnapshot.Diagnostics, parameter.ID) {
		t.Fatalf("3 diagnostics = %#v, want the parameter diagnostic cleared", clearedSnapshot.Diagnostics)
	}
	if _, err := os.Stat(generatedPath); err != nil {
		t.Fatalf("generated file stat before Close() = %v", err)
	}
}

func requireReadyBasedpyrightStatus(t *testing.T, status contracts.ProviderStatusV1) {
	t.Helper()
	if status.Provider != contracts.ProviderBasedpyrightV1 ||
		status.Status != contracts.ProviderAvailabilityAvailableV1 ||
		status.State != contracts.ProviderLifecycleStateReadyV1 {
		t.Fatalf("provider status = %#v, want available/ready Basedpyright", status)
	}
}

func containsErrorForTarget(diagnostics []contracts.DiagnosticV1, targetID string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.TargetID == targetID && diagnostic.Severity == contracts.DiagnosticSeverityErrorV1 {
			return true
		}
	}
	return false
}

func appRootForIntegrationTest(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if info, err := os.Stat(filepath.Join(directory, "backend", "go.mod")); err == nil && info.Mode().IsRegular() {
			return directory
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("find Python Canvas app root")
		}
		directory = parent
	}
}
