package project

import (
	"context"
	"errors"
	"reflect"
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

func TestMapProviderDiagnosticsUsesRangesRatherThanProviderMessageWordsAndKeepsDocumentDiagnostics(t *testing.T) {
	code := "state.value = missing_value\nstate.call = math.sqrt(state.value)"
	parameterStart := strings.Index(code, "missing_value")
	callableStart := strings.Index(code, "math.sqrt")
	diagnostics := mapProviderDiagnostics(code, []codegen.SourceRange{
		{TargetID: "callable:square-root", Start: callableStart, End: callableStart + len("math.sqrt")},
		{TargetID: "parameter:square-root:provider", Start: parameterStart, End: parameterStart + len("missing_value")},
	}, "", -1, nil, []ProviderDiagnostic{
		{
			Start:    parameterStart,
			End:      parameterStart + len("missing_value"),
			Severity: ProviderDiagnosticSeverityError,
			Message:  "Name \"missing_value\" is not defined",
			Code:     "reportUndefinedVariable",
		},
		{
			Start:    0,
			End:      5,
			Severity: ProviderDiagnosticSeverityError,
			Message:  "unrelated generated prefix problem",
		},
	})
	if len(diagnostics) != 2 {
		t.Fatalf("mapped diagnostics = %#v", diagnostics)
	}
	if diagnostics[0].TargetID != nil {
		t.Fatalf("document diagnostic target = %#v, want nil", diagnostics[0])
	}
	if diagnostics[1].TargetID == nil || *diagnostics[1].TargetID != "parameter:square-root:provider" {
		t.Fatalf("parameter diagnostic target = %#v", diagnostics[1])
	}
}

func TestMapProviderDiagnosticsMapsExactCallIssueToEmptyRequiredProviderParameter(t *testing.T) {
	code := "state.call = math.sqrt()"
	callableStart := strings.Index(code, "math.sqrt")
	defaultExpression := "0"
	diagnostics := mapProviderDiagnostics(code, []codegen.SourceRange{{
		TargetID: "callable:square-root",
		Start:    callableStart,
		End:      callableStart + len("math.sqrt"),
	}}, "callable:square-root", callableStart+len("math.sqrt()"), []parameterState{
		{
			ID:           "parameter:required",
			PassingStyle: codegen.ParameterPassingStylePositionalOnly,
		},
		{
			ID:           "parameter:defaulted",
			PassingStyle: codegen.ParameterPassingStylePositionalOnly,
			Default:      &defaultExpression,
		},
		{
			ID:           "parameter:authored",
			NameEditable: true,
		},
		{
			ID:           "parameter:variadic",
			PassingStyle: codegen.ParameterPassingStyle("variadic_positional"),
		},
	}, []ProviderDiagnostic{{
		Start:    callableStart,
		End:      callableStart + len("math.sqrt"),
		Severity: ProviderDiagnosticSeverityError,
		Message:  "Basedpyright's wording is not part of this mapping.",
		Code:     "reportCallIssue",
	}})
	if len(diagnostics) != 1 || diagnostics[0].TargetID == nil || *diagnostics[0].TargetID != "parameter:required" {
		t.Fatalf("missing required parameter diagnostics = %#v", diagnostics)
	}
}

func TestMapProviderDiagnosticsKeepsCallIssueOnCallableWithoutMissingRequiredProviderParameter(t *testing.T) {
	code := "state.call = math.sqrt(state.value)"
	callableStart := strings.Index(code, "math.sqrt")
	diagnostics := mapProviderDiagnostics(code, []codegen.SourceRange{{
		TargetID: "callable:square-root",
		Start:    callableStart,
		End:      callableStart + len("math.sqrt"),
	}}, "callable:square-root", callableStart+len("math.sqrt(state.value)"), []parameterState{{
		ID:           "parameter:required",
		PassingStyle: codegen.ParameterPassingStylePositionalOnly,
		Expression:   "3",
	}}, []ProviderDiagnostic{{
		Start:    callableStart,
		End:      callableStart + len("math.sqrt"),
		Severity: ProviderDiagnosticSeverityError,
		Message:  "Unexpected argument.",
		Code:     "reportCallIssue",
	}})
	if len(diagnostics) != 1 || diagnostics[0].TargetID == nil || *diagnostics[0].TargetID != "callable:square-root" {
		t.Fatalf("callable diagnostics = %#v", diagnostics)
	}
}

func TestMapProviderDiagnosticsMapsKeywordCallIssueWithinCallableToCallable(t *testing.T) {
	code := "state.call = math.sqrt(state.value, scale=state.scale)"
	callableStart := strings.Index(code, "math.sqrt")
	keywordStart := strings.Index(code, "scale=")
	diagnostics := mapProviderDiagnostics(code, []codegen.SourceRange{{
		TargetID: "callable:square-root",
		Start:    callableStart,
		End:      callableStart + len("math.sqrt"),
	}}, "callable:square-root", callableStart+len("math.sqrt(state.value, scale=state.scale)"), []parameterState{{
		ID:           "parameter:required",
		PassingStyle: codegen.ParameterPassingStylePositionalOnly,
		Expression:   "3",
	}}, []ProviderDiagnostic{{
		Start:    keywordStart,
		End:      keywordStart + len("scale"),
		Severity: ProviderDiagnosticSeverityError,
		Message:  "No parameter named \"scale\"",
		Code:     "reportCallIssue",
	}})
	if len(diagnostics) != 1 || diagnostics[0].TargetID == nil || *diagnostics[0].TargetID != "callable:square-root" {
		t.Fatalf("keyword call diagnostics = %#v, want callable target", diagnostics)
	}
}

func TestMapProviderDiagnosticsKeepsSameRangeDifferentSeverityIDsDistinctAndStable(t *testing.T) {
	code := "state.value = missing_value"
	start := strings.Index(code, "missing_value")
	providerDiagnostics := []ProviderDiagnostic{
		{Start: start, End: start + len("missing_value"), Severity: ProviderDiagnosticSeverityWarning, Message: "warning"},
		{Start: start, End: start + len("missing_value"), Severity: ProviderDiagnosticSeverityError, Message: "error"},
	}
	first := mapProviderDiagnostics(code, []codegen.SourceRange{{
		TargetID: "parameter:square-root:provider",
		Start:    start,
		End:      start + len("missing_value"),
	}}, "", -1, nil, providerDiagnostics)
	second := mapProviderDiagnostics(code, []codegen.SourceRange{{
		TargetID: "parameter:square-root:provider",
		Start:    start,
		End:      start + len("missing_value"),
	}}, "", -1, nil, []ProviderDiagnostic{providerDiagnostics[1], providerDiagnostics[0]})
	if len(first) != 2 || first[0].ID == first[1].ID {
		t.Fatalf("diagnostics = %#v, want two distinct stable IDs", first)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("diagnostic ordering and IDs changed with provider order:\nfirst: %#v\nsecond: %#v", first, second)
	}
}

func TestStoreReplacesDiagnosticsForEachCanonicalSnapshot(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	provider := &recordingProvider{
		syncResolver: func(_ context.Context, request GeneratedDocumentRequest) (GeneratedDocumentResult, error) {
			callableStart := strings.Index(request.Code, "math.sqrt")
			diagnostics := []ProviderDiagnostic{}
			if strings.Contains(request.Code, "math.sqrt()") {
				diagnostics = append(diagnostics, ProviderDiagnostic{
					Start:    callableStart,
					End:      callableStart + len("math.sqrt"),
					Severity: ProviderDiagnosticSeverityError,
					Message:  "Argument missing for parameter \"x\"",
					Code:     "reportCallIssue",
				})
			}
			return GeneratedDocumentResult{
				Diagnostics:    diagnostics,
				ProviderStatus: readyProviderStatusForTest(),
			}, nil
		},
	}
	store, err := NewStoreWithProvider(writer, provider)
	if err != nil {
		t.Fatalf("NewStoreWithProvider() error = %v", err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	}()

	initial := store.Snapshot()
	missing, err := store.CommitCallable(context.Background(), initial.Project.ID, initial.Callables[0].ID, "math.sqrt")
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	parameter := missing.Parameters[0]
	if len(missing.Diagnostics) != 1 || missing.Diagnostics[0].TargetID == nil || *missing.Diagnostics[0].TargetID != parameter.ID {
		t.Fatalf("missing snapshot diagnostics = %#v", missing.Diagnostics)
	}

	cleared, err := setParameterExpression(store, missing, "3")
	if err != nil {
		t.Fatalf("SetCallableParameters() error = %v", err)
	}
	if len(cleared.Diagnostics) != 0 {
		t.Fatalf("cleared snapshot diagnostics = %#v", cleared.Diagnostics)
	}
}

func TestStoreDropsDiagnosticsForDeletedParametersBeforeValidatingTheCandidate(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	provider := &recordingProvider{
		syncResolver: func(_ context.Context, request GeneratedDocumentRequest) (GeneratedDocumentResult, error) {
			const scaleAssignment = "state.Square_Root__scale = 2"
			assignmentStart := strings.Index(request.Code, scaleAssignment)
			diagnostics := []ProviderDiagnostic{}
			if assignmentStart >= 0 {
				expressionStart := assignmentStart + len(scaleAssignment) - 1
				diagnostics = append(diagnostics, ProviderDiagnostic{
					Start:    expressionStart,
					End:      expressionStart + 1,
					Severity: ProviderDiagnosticSeverityError,
					Message:  "scale is not a valid math.sqrt argument",
					Code:     "reportCallIssue",
				})
			}
			return GeneratedDocumentResult{
				Diagnostics:    diagnostics,
				ProviderStatus: readyProviderStatusForTest(),
			}, nil
		},
	}
	store, err := NewStoreWithProvider(writer, provider)
	if err != nil {
		t.Fatalf("NewStoreWithProvider() error = %v", err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	}()

	initial := store.Snapshot()
	callable, err := store.CommitCallable(
		context.Background(),
		initial.Project.ID,
		initial.Callables[0].ID,
		"math.sqrt",
	)
	if err != nil {
		t.Fatalf("CommitCallable(math.sqrt) error = %v", err)
	}
	provided := callable.Parameters[0]
	authored, err := store.SetCallableParameters(
		context.Background(),
		callable.Project.ID,
		callable.Callables[0].ID,
		callable.Project.Revision,
		[]ParameterProposal{
			{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"},
			{ID: "parameter:authored:scale", Name: "scale", AuthoredExpression: "2"},
		},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(scale) error = %v", err)
	}
	if len(authored.Diagnostics) != 1 || authored.Diagnostics[0].TargetID == nil ||
		*authored.Diagnostics[0].TargetID != "parameter:authored:scale" {
		t.Fatalf("authored diagnostics = %#v, want the scale diagnostic", authored.Diagnostics)
	}

	deleted, err := store.SetCallableParameters(
		context.Background(),
		authored.Project.ID,
		authored.Callables[0].ID,
		authored.Project.Revision,
		[]ParameterProposal{{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"}},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(delete scale) error = %v", err)
	}
	if deleted.Project.Revision != authored.Project.Revision+1 {
		t.Fatalf("delete revision = %d, want %d", deleted.Project.Revision, authored.Project.Revision+1)
	}
	if len(deleted.Parameters) != 1 || deleted.Parameters[0].ID != provided.ID {
		t.Fatalf("deleted parameters = %#v, want only %#v", deleted.Parameters, provided)
	}
	if len(deleted.Diagnostics) != 0 {
		t.Fatalf("deleted diagnostics = %#v, want stale scale diagnostics cleared", deleted.Diagnostics)
	}
}

type recordingProvider struct {
	resolver                 signatureResolverFunc
	completionResolver       completionResolverFunc
	targetCompletionResolver pythonTargetCompletionResolverFunc
	syncResolver             func(context.Context, GeneratedDocumentRequest) (GeneratedDocumentResult, error)
	pending                  bool
	syncErr                  error
	closed                   bool
	resolveCalls             int
	completionCalls          int
	targetCompletionCalls    int
	synchronizeCalls         int
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
) ([]CompletionItem, error) {
	provider.completionCalls++
	if provider.completionResolver != nil {
		return provider.completionResolver(ctx, request)
	}
	return []CompletionItem{}, nil
}

func (provider *recordingProvider) CompletePythonTarget(
	ctx context.Context,
	request PythonTargetCompletionRequest,
) ([]CompletionItem, error) {
	provider.targetCompletionCalls++
	if provider.targetCompletionResolver != nil {
		return provider.targetCompletionResolver(ctx, request)
	}
	return []CompletionItem{}, nil
}

func (provider *recordingProvider) SynchronizeGeneratedDocument(
	ctx context.Context,
	request GeneratedDocumentRequest,
) (GeneratedDocumentResult, error) {
	provider.synchronizeCalls++
	if provider.syncErr != nil {
		return GeneratedDocumentResult{}, provider.syncErr
	}
	if provider.syncResolver != nil {
		return provider.syncResolver(ctx, request)
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
