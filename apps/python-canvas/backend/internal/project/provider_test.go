package project

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/codegen"
	"github.com/setta/python-canvas/backend/internal/contracts"
)

func TestStoreCommitsWithExplicitProviderStatusWhenDiagnosticsArePendingOrUnavailable(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	provider := &recordingProvider{pending: true}
	store, err := NewStoreWithProvider(writer, provider)
	if err != nil {
		t.Fatalf("NewStoreWithProvider() error = %v", err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if !provider.closed {
			t.Fatal("Close() did not close the owned provider")
		}
	}()

	initial := store.Snapshot()
	pendingSnapshot, err := store.CommitCallable(
		context.Background(),
		initial.Project.ID,
		initial.Callables[0].ID,
		"math.sqrt",
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	if pendingSnapshot.ProviderStatus.Status != contracts.ProviderAvailabilityAvailableV1 ||
		pendingSnapshot.ProviderStatus.State != contracts.ProviderLifecycleStatePendingV1 {
		t.Fatalf("pending provider status = %#v", pendingSnapshot.ProviderStatus)
	}
	if provider.resolveCalls != 1 || provider.synchronizeCalls != 1 {
		t.Fatalf("owned provider calls = resolve %d, synchronize %d; want 1 each", provider.resolveCalls, provider.synchronizeCalls)
	}

	provider.syncErr = errors.New("server exited")
	unavailableSnapshot, err := setParameterExpression(store, pendingSnapshot, "missing_value")
	if err != nil {
		t.Fatalf("SetCallableParameters() error = %v", err)
	}
	if unavailableSnapshot.ProviderStatus.Status != contracts.ProviderAvailabilityUnavailableV1 ||
		unavailableSnapshot.ProviderStatus.State != contracts.ProviderLifecycleStateFailedV1 {
		t.Fatalf("unavailable provider status = %#v", unavailableSnapshot.ProviderStatus)
	}
	if len(unavailableSnapshot.Diagnostics) != 0 {
		t.Fatalf("unavailable diagnostics = %#v", unavailableSnapshot.Diagnostics)
	}
	if provider.synchronizeCalls != 2 {
		t.Fatalf("owned provider synchronize calls = %d, want 2", provider.synchronizeCalls)
	}
}

func TestMapProviderDiagnosticsUsesRangesRatherThanProviderMessageWords(t *testing.T) {
	code := "state.value = missing_value\nstate.call = math.sqrt(state.value)"
	parameterStart := strings.Index(code, "missing_value")
	callableStart := strings.Index(code, "math.sqrt")
	diagnostics := mapProviderDiagnostics(code, []codegen.SourceRange{
		{TargetID: "callable:square-root", Start: callableStart, End: callableStart + len("math.sqrt")},
		{TargetID: "parameter:square-root:provider", Start: parameterStart, End: parameterStart + len("missing_value")},
	}, []ProviderDiagnostic{
		{
			Start:    parameterStart,
			End:      parameterStart + len("missing_value"),
			Severity: ProviderDiagnosticSeverityError,
			Message:  "Name \"missing_value\" is not defined",
		},
		{
			Start:    0,
			End:      5,
			Severity: ProviderDiagnosticSeverityError,
			Message:  "unrelated generated prefix problem",
		},
	})
	if len(diagnostics) != 1 {
		t.Fatalf("mapped diagnostics = %#v", diagnostics)
	}
	if diagnostics[0].TargetID != "parameter:square-root:provider" {
		t.Fatalf("diagnostic target = %#v", diagnostics[0])
	}
}

func TestMapProviderDiagnosticsKeepsSameRangeDifferentSeverityIDsDistinct(t *testing.T) {
	code := "state.value = missing_value"
	start := strings.Index(code, "missing_value")
	diagnostics := mapProviderDiagnostics(code, []codegen.SourceRange{{
		TargetID: "parameter:square-root:provider",
		Start:    start,
		End:      start + len("missing_value"),
	}}, []ProviderDiagnostic{
		{Start: start, End: start + len("missing_value"), Severity: ProviderDiagnosticSeverityError, Message: "error"},
		{Start: start, End: start + len("missing_value"), Severity: ProviderDiagnosticSeverityWarning, Message: "warning"},
	})
	if len(diagnostics) != 2 || diagnostics[0].ID == diagnostics[1].ID {
		t.Fatalf("diagnostics = %#v, want two distinct stable IDs", diagnostics)
	}
}

type recordingProvider struct {
	resolver           signatureResolverFunc
	completionResolver completionResolverFunc
	pending            bool
	syncErr            error
	closed             bool
	resolveCalls       int
	completionCalls    int
	synchronizeCalls   int
}

func (provider *recordingProvider) ResolveCallableSignature(
	ctx context.Context,
	request SignatureRequest,
) (CallableSignature, error) {
	provider.resolveCalls++
	if provider.resolver != nil {
		return provider.resolver(ctx, request)
	}
	return squareRootSignature(), nil
}

func (provider *recordingProvider) CompleteCallable(
	ctx context.Context,
	request CallableCompletionRequest,
) ([]CallableCompletionItem, error) {
	provider.completionCalls++
	if provider.completionResolver != nil {
		return provider.completionResolver(ctx, request)
	}
	return []CallableCompletionItem{}, nil
}

func (provider *recordingProvider) SynchronizeGeneratedDocument(
	_ context.Context,
	_ GeneratedDocumentRequest,
) (GeneratedDocumentResult, error) {
	provider.synchronizeCalls++
	if provider.syncErr != nil {
		return GeneratedDocumentResult{}, provider.syncErr
	}
	if provider.pending {
		return GeneratedDocumentResult{
			Diagnostics: []ProviderDiagnostic{},
			ProviderStatus: contracts.ProviderStatusV1{
				Provider: contracts.ProviderBasedpyrightV1,
				Status:   contracts.ProviderAvailabilityAvailableV1,
				State:    contracts.ProviderLifecycleStatePendingV1,
			},
		}, nil
	}
	return GeneratedDocumentResult{
		Diagnostics:    []ProviderDiagnostic{},
		ProviderStatus: readyProviderStatusForTest(),
	}, nil
}

func (provider *recordingProvider) Close() error {
	provider.closed = true
	return nil
}

func readyProviderStatusForTest() contracts.ProviderStatusV1 {
	return contracts.ProviderStatusV1{
		Provider: contracts.ProviderBasedpyrightV1,
		Status:   contracts.ProviderAvailabilityAvailableV1,
		State:    contracts.ProviderLifecycleStateReadyV1,
	}
}
