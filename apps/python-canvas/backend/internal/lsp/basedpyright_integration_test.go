package lsp

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
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
	requireMissingParameterDiagnostic(t, callableSnapshot.Diagnostics, parameter.ID, callableSnapshot.Callables[0].ID)

	missingSnapshot, err := store.SetCallableParameters(
		ctx,
		initial.Project.ID,
		initial.Callables[0].ID,
		callableSnapshot.Project.Revision,
		[]project.ParameterProposal{{ID: parameter.ID, Name: parameter.Name, AuthoredExpression: "missing_value"}},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(missing_value) error = %v", err)
	}
	if missingSnapshot.Project.Revision != 3 {
		t.Fatalf("missing_value revision = %d, want 3", missingSnapshot.Project.Revision)
	}
	requireReadyBasedpyrightStatus(t, missingSnapshot.ProviderStatus)
	if !containsErrorForTarget(missingSnapshot.Diagnostics, parameter.ID) {
		t.Fatalf("missing_value diagnostics = %#v, want an error for %q", missingSnapshot.Diagnostics, parameter.ID)
	}

	clearedSnapshot, err := store.SetCallableParameters(
		ctx,
		initial.Project.ID,
		initial.Callables[0].ID,
		missingSnapshot.Project.Revision,
		[]project.ParameterProposal{{ID: parameter.ID, Name: parameter.Name, AuthoredExpression: "3"}},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(3) error = %v", err)
	}
	if clearedSnapshot.Project.Revision != 4 {
		t.Fatalf("3 revision = %d, want 4", clearedSnapshot.Project.Revision)
	}
	requireReadyBasedpyrightStatus(t, clearedSnapshot.ProviderStatus)
	if containsErrorForTarget(clearedSnapshot.Diagnostics, parameter.ID) {
		t.Fatalf("3 diagnostics = %#v, want the parameter diagnostic cleared", clearedSnapshot.Diagnostics)
	}

	keywordSnapshot, err := store.SetCallableParameters(
		ctx,
		initial.Project.ID,
		initial.Callables[0].ID,
		clearedSnapshot.Project.Revision,
		[]project.ParameterProposal{
			{ID: parameter.ID, Name: parameter.Name, AuthoredExpression: "3"},
			{ID: "parameter:authored:scale", Name: "scale", AuthoredExpression: "2"},
		},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(scale=2) error = %v", err)
	}
	requireReadyBasedpyrightStatus(t, keywordSnapshot.ProviderStatus)
	if !containsErrorForTarget(keywordSnapshot.Diagnostics, keywordSnapshot.Callables[0].ID) {
		t.Fatalf("scale=2 diagnostics = %#v, want an error for callable %q", keywordSnapshot.Diagnostics, keywordSnapshot.Callables[0].ID)
	}
	if _, err := os.Stat(generatedPath); err != nil {
		t.Fatalf("generated file stat before Close() = %v", err)
	}
}

func TestPinnedBasedpyrightCompletesCallableNameInCanonicalMathContext(t *testing.T) {
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
	before := store.Snapshot()
	if before.PythonTarget.Prefix != "import math" {
		t.Fatalf("canonical Python prefix = %q, want import math", before.PythonTarget.Prefix)
	}
	beforeCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read canonical generated file before completion: %v", err)
	}
	items, err := store.CompleteCallable(
		ctx,
		before.Project.ID,
		before.Callables[0].ID,
		"math.sq",
		7,
	)
	if err != nil {
		t.Fatalf("CompleteCallable(math.sq) error = %v", err)
	}
	if !hasCallableCompletion(items, "sqrt") {
		t.Fatalf("math.sq completion items = %#v, want sqrt", items)
	}
	if after := store.Snapshot(); !reflect.DeepEqual(after, before) {
		t.Fatalf("canonical snapshot changed after completion:\n got: %#v\nwant: %#v", after, before)
	}
	afterCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read canonical generated file after completion: %v", err)
	}
	if string(afterCode) != string(beforeCode) {
		t.Fatalf("canonical generated file changed after completion: got %q, want %q", afterCode, beforeCode)
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

func requireMissingParameterDiagnostic(
	t *testing.T,
	diagnostics []contracts.DiagnosticV1,
	parameterID string,
	callableID string,
) {
	t.Helper()
	if !containsErrorForTarget(diagnostics, parameterID) {
		t.Fatalf("initial math.sqrt diagnostics = %#v, want a missing-argument error for %q", diagnostics, parameterID)
	}
	if containsErrorForTarget(diagnostics, callableID) {
		t.Fatalf("initial math.sqrt diagnostics = %#v, do not want the callable blamed for its missing parameter", diagnostics)
	}
}

func containsErrorForTarget(diagnostics []contracts.DiagnosticV1, targetID string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.TargetID != nil && *diagnostic.TargetID == targetID && diagnostic.Severity == contracts.DiagnosticSeverityErrorV1 {
			return true
		}
	}
	return false
}

func hasCallableCompletion(items []project.CallableCompletionItem, label string) bool {
	for _, item := range items {
		if item.Label == label && item.InsertText == label {
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
