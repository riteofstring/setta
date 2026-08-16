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

func TestInitialProjectSnapshotIsCanonicalV1State(t *testing.T) {
	snapshot := InitialProjectSnapshot()
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("InitialProjectSnapshot().Validate() error = %v", err)
	}
	if snapshot.Project.ID != "project:python-canvas" || snapshot.Project.Revision != 1 {
		t.Fatalf("project = %#v, want stable ID and revision 1", snapshot.Project)
	}
	if snapshot.PythonTarget.Prefix != "import math" || snapshot.PythonTarget.Suffix != "state = SettaState()" {
		t.Fatalf("python target = %#v", snapshot.PythonTarget)
	}
	if len(snapshot.Callables) != 1 {
		t.Fatalf("len(callables) = %d, want 1", len(snapshot.Callables))
	}
	callable := snapshot.Callables[0]
	if callable.ID != "callable:square-root" || callable.Name != "Square Root" {
		t.Fatalf("callable = %#v", callable)
	}
	if callable.AuthoredExpression != "" || len(callable.ParameterIDs) != 0 || len(snapshot.Parameters) != 0 {
		t.Fatalf("initial authored state = callable %#v, parameters %#v", callable, snapshot.Parameters)
	}
	const wantInitialBody = "class SettaState:\n    def __init__(state):\n        pass"
	const wantInitialCode = "import math\n\n" + wantInitialBody + "\n\nstate = SettaState()"
	if snapshot.GeneratedCode.Body != wantInitialBody || snapshot.GeneratedCode.Code != wantInitialCode {
		t.Fatalf("generated code = %#v, want body %q and code %q", snapshot.GeneratedCode, wantInitialBody, wantInitialCode)
	}
	if len(snapshot.GeneratedCode.SourceRanges) != 0 {
		t.Fatalf("initial source ranges = %#v, want none", snapshot.GeneratedCode.SourceRanges)
	}
	if snapshot.ProviderStatus.Provider != contracts.ProviderBasedpyrightV1 ||
		snapshot.ProviderStatus.Status != contracts.ProviderAvailabilityUnavailableV1 ||
		snapshot.ProviderStatus.State != contracts.ProviderLifecycleStateNotStartedV1 {
		t.Fatalf("provider status = %#v", snapshot.ProviderStatus)
	}
}

func TestStoreAutomaticallyReconcilesCallableAndParameter(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, _ := newStoreForTest(t, writer, func(ctx context.Context, request SignatureRequest) (CallableSignature, error) {
		requireSquareRootSignatureRequest(t, ctx, request)
		return squareRootSignature(), nil
	})

	callableSnapshot, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"  math.sqrt  ",
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	requireCallableReconciliation(t, callableSnapshot)
	requireReconciledParameter(t, callableSnapshot)
	parameterID := callableSnapshot.Parameters[0].ID
	const wantCallableCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = math.sqrt()\n\nstate = SettaState()"
	requireMaterializedGeneratedCode(t, callableSnapshot, writer, wantCallableCode, "callable")

	finalSnapshot, err := store.SetParameterExpression(initialProjectID, parameterID, "3")
	if err != nil {
		t.Fatalf("SetParameterExpression() error = %v", err)
	}
	const wantFinalCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root__x = 3\n        state.Square_Root = math.sqrt(state.Square_Root__x)\n\nstate = SettaState()"
	requireParameterReconciliation(t, finalSnapshot, writer, wantFinalCode)
}

func TestStoreUsesCandidateCallOffsetWhenCallableMatchesClassHeader(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, _ := newStoreForTest(t, writer, func(_ context.Context, request SignatureRequest) (CallableSignature, error) {
		const wantSnapshot = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = __init__()\n\nstate = SettaState()"
		if request.Code != wantSnapshot {
			t.Fatalf("signature request code = %q, want %q", request.Code, wantSnapshot)
		}
		wantOffset := strings.LastIndex(wantSnapshot, "__init__(") + len("__init__(")
		if request.CallOffset != wantOffset {
			t.Fatalf("signature request call offset = %d, want candidate call offset %d", request.CallOffset, wantOffset)
		}
		return squareRootSignature(), nil
	})

	_, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"__init__",
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
}

func TestStoreLeavesStateAndGeneratedFileUntouchedWhenMutationsFail(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	resolverErr := errors.New("signature unavailable")
	store, provider := newStoreForTest(t, writer, func(context.Context, SignatureRequest) (CallableSignature, error) {
		return CallableSignature{}, resolverErr
	})
	initialSnapshot := store.Snapshot()
	initialCode := writer.code

	_, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
	)
	if !errors.Is(err, resolverErr) {
		t.Fatalf("CommitCallable() error = %v, want signature error", err)
	}
	requireUnchangedStore(t, store, writer, initialSnapshot, initialCode)

	writeErr := errors.New("replace failed")
	writer.writeErr = writeErr
	provider.resolver = func(context.Context, SignatureRequest) (CallableSignature, error) {
		return squareRootSignature(), nil
	}
	_, err = store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
	)
	if !errors.Is(err, writeErr) {
		t.Fatalf("CommitCallable() error = %v, want materialization error", err)
	}
	requireUnchangedStore(t, store, writer, initialSnapshot, initialCode)

	writer.writeErr = nil
	committedSnapshot, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	committedCode := writer.code
	parameterID := committedSnapshot.Parameters[0].ID

	writer.writeErr = writeErr
	_, err = store.SetParameterExpression(initialProjectID, parameterID, "3")
	if !errors.Is(err, writeErr) {
		t.Fatalf("SetParameterExpression() error = %v, want materialization error", err)
	}
	requireUnchangedStore(t, store, writer, committedSnapshot, committedCode)

	writer.writeErr = nil
	for _, testCase := range []struct {
		name       string
		expression string
	}{
		{name: "newline", expression: "3\nstate.other = 4"},
		{name: "statement separator", expression: "3; state.other = 4"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := store.SetParameterExpression(initialProjectID, parameterID, testCase.expression)
			if !errors.Is(err, ErrParameterExpressionInvalid) {
				t.Fatalf("SetParameterExpression() error = %v, want invalid expression", err)
			}
			requireUnchangedStore(t, store, writer, committedSnapshot, committedCode)
		})
	}
}

func TestStoreRejectsUnsupportedSignatureWithoutCommitting(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, _ := newStoreForTest(t, writer, func(context.Context, SignatureRequest) (CallableSignature, error) {
		return CallableSignature{Parameters: []SignatureParameter{
			{Name: "x", PassingStyle: codegen.ParameterPassingStylePositionalOnly},
			{Name: "base", PassingStyle: codegen.ParameterPassingStylePositionalOnly},
		}}, nil
	})
	before := store.Snapshot()
	beforeCode := writer.code

	_, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
	)
	if !errors.Is(err, ErrUnsupportedSignature) {
		t.Fatalf("CommitCallable() error = %v, want unsupported signature", err)
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func TestStoreRejectsKeywordNamedSignatureParameterWithoutCommitting(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, _ := newStoreForTest(t, writer, func(context.Context, SignatureRequest) (CallableSignature, error) {
		return CallableSignature{Parameters: []SignatureParameter{{
			Name:         "class",
			PassingStyle: codegen.ParameterPassingStylePositionalOrKeyword,
		}}}, nil
	})
	before := store.Snapshot()
	beforeCode := writer.code

	_, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
	)
	if !errors.Is(err, ErrUnsupportedSignature) {
		t.Fatalf("CommitCallable() error = %v, want unsupported signature", err)
	}
	var unsupported UnsupportedSignatureError
	if !errors.As(err, &unsupported) || unsupported.Reason != "parameter name is a Python keyword" {
		t.Fatalf("CommitCallable() error = %v, want typed keyword-name failure", err)
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func requireSquareRootSignatureRequest(t *testing.T, ctx context.Context, request SignatureRequest) {
	t.Helper()
	if ctx == nil {
		t.Fatal("ResolveCallableSignature() context = nil")
	}
	if request.ProjectID != initialProjectID || request.SectionID != squareRootCallableID {
		t.Fatalf("signature request identity = %#v", request)
	}
	if request.CallableExpression != "math.sqrt" {
		t.Fatalf("signature request expression = %q, want math.sqrt", request.CallableExpression)
	}
	const wantSnapshot = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = math.sqrt()\n\nstate = SettaState()"
	if request.Code != wantSnapshot {
		t.Fatalf("signature request code = %q, want %q", request.Code, wantSnapshot)
	}
	wantOffset := strings.Index(wantSnapshot, "math.sqrt(") + len("math.sqrt(")
	if request.CallOffset != wantOffset {
		t.Fatalf("signature request call offset = %d, want %d", request.CallOffset, wantOffset)
	}
}

func requireCallableReconciliation(t *testing.T, snapshot contracts.ProjectSnapshotV1) {
	t.Helper()
	if snapshot.Project.Revision != 2 {
		t.Fatalf("callable revision = %d, want 2", snapshot.Project.Revision)
	}
	callable := snapshot.Callables[0]
	if callable.AuthoredExpression != "math.sqrt" || !reflect.DeepEqual(callable.ParameterIDs, []string{"parameter:square-root:1"}) {
		t.Fatalf("callable after commit = %#v", callable)
	}
	if len(snapshot.Parameters) != 1 {
		t.Fatalf("parameters after callable commit = %#v", snapshot.Parameters)
	}
}

func requireReconciledParameter(t *testing.T, snapshot contracts.ProjectSnapshotV1) {
	t.Helper()
	parameter := snapshot.Parameters[0]
	if parameter.ID != "parameter:square-root:1" || parameter.Name != "x" ||
		parameter.PassingStyle != contracts.ParameterPassingStylePositionalOnlyV1 ||
		parameter.TypeAnnotation != "float" || parameter.Default != nil || parameter.AuthoredExpression != "" {
		t.Fatalf("parameter after callable commit = %#v", parameter)
	}
}

func requireMaterializedGeneratedCode(
	t *testing.T,
	snapshot contracts.ProjectSnapshotV1,
	writer *memoryGeneratedFileWriter,
	wantCode string,
	stage string,
) {
	t.Helper()
	if snapshot.GeneratedCode.Code != wantCode || writer.code != wantCode {
		t.Fatalf("%s generated code = %q; materialized = %q; want %q", stage, snapshot.GeneratedCode.Code, writer.code, wantCode)
	}
}

func requireParameterReconciliation(
	t *testing.T,
	snapshot contracts.ProjectSnapshotV1,
	writer *memoryGeneratedFileWriter,
	wantCode string,
) {
	t.Helper()
	if snapshot.Project.Revision != 3 {
		t.Fatalf("parameter revision = %d, want 3", snapshot.Project.Revision)
	}
	requireMaterializedGeneratedCode(t, snapshot, writer, wantCode, "final")
	if len(writer.writes) != 3 {
		t.Fatalf("materialized writes = %d, want initial, callable, and parameter writes", len(writer.writes))
	}
}

type signatureResolverFunc func(context.Context, SignatureRequest) (CallableSignature, error)

func newStoreForTest(
	t *testing.T,
	writer GeneratedFileWriter,
	resolver signatureResolverFunc,
) (*Store, *recordingProvider) {
	t.Helper()
	provider := &recordingProvider{resolver: resolver}
	store, err := NewStoreWithProvider(writer, provider)
	if err != nil {
		t.Fatalf("NewStoreWithProvider() error = %v", err)
	}
	return store, provider
}

type memoryGeneratedFileWriter struct {
	path     string
	code     string
	writes   []string
	writeErr error
	closed   bool
}

func (writer *memoryGeneratedFileWriter) Write(code string) error {
	if writer.writeErr != nil {
		return writer.writeErr
	}
	if writer.closed {
		return ErrGeneratedFileClosed
	}
	writer.code = code
	writer.writes = append(writer.writes, code)
	return nil
}

func (writer *memoryGeneratedFileWriter) Path() string {
	return writer.path
}

func (writer *memoryGeneratedFileWriter) Close() error {
	writer.closed = true
	return nil
}

func squareRootSignature() CallableSignature {
	return CallableSignature{Parameters: []SignatureParameter{{
		Name:           "x",
		PassingStyle:   codegen.ParameterPassingStylePositionalOnly,
		TypeAnnotation: "float",
	}}}
}

func requireUnchangedStore(
	t *testing.T,
	store *Store,
	writer *memoryGeneratedFileWriter,
	wantSnapshot contracts.ProjectSnapshotV1,
	wantCode string,
) {
	t.Helper()
	if got := store.Snapshot(); !reflect.DeepEqual(got, wantSnapshot) {
		t.Fatalf("store snapshot changed after failed mutation:\n got: %#v\nwant: %#v", got, wantSnapshot)
	}
	if writer.code != wantCode {
		t.Fatalf("materialized generated file changed after failed mutation: got %q, want %q", writer.code, wantCode)
	}
}
