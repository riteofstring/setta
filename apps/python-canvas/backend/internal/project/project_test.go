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
	store, err := NewStore(writer)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	resolver := signatureResolverFunc(func(ctx context.Context, request SignatureRequest) (CallableSignature, error) {
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
		return squareRootSignature(), nil
	})

	callableSnapshot, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"  math.sqrt  ",
		resolver,
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	if callableSnapshot.Project.Revision != 2 {
		t.Fatalf("callable revision = %d, want 2", callableSnapshot.Project.Revision)
	}
	callable := callableSnapshot.Callables[0]
	if callable.AuthoredExpression != "math.sqrt" || !reflect.DeepEqual(callable.ParameterIDs, []string{"parameter:square-root:1"}) {
		t.Fatalf("callable after commit = %#v", callable)
	}
	if len(callableSnapshot.Parameters) != 1 {
		t.Fatalf("parameters after callable commit = %#v", callableSnapshot.Parameters)
	}
	parameter := callableSnapshot.Parameters[0]
	if parameter.ID != "parameter:square-root:1" || parameter.Name != "x" ||
		parameter.PassingStyle != contracts.ParameterPassingStylePositionalOnlyV1 ||
		parameter.TypeAnnotation != "float" || parameter.Default != nil || parameter.AuthoredExpression != "" {
		t.Fatalf("parameter after callable commit = %#v", parameter)
	}
	const wantCallableCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = math.sqrt()\n\nstate = SettaState()"
	if callableSnapshot.GeneratedCode.Code != wantCallableCode || writer.code != wantCallableCode {
		t.Fatalf("callable generated code = %q; materialized = %q; want %q", callableSnapshot.GeneratedCode.Code, writer.code, wantCallableCode)
	}

	finalSnapshot, err := store.SetParameterExpression(initialProjectID, parameter.ID, "3")
	if err != nil {
		t.Fatalf("SetParameterExpression() error = %v", err)
	}
	if finalSnapshot.Project.Revision != 3 {
		t.Fatalf("parameter revision = %d, want 3", finalSnapshot.Project.Revision)
	}
	const wantFinalCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root__x = 3\n        state.Square_Root = math.sqrt(state.Square_Root__x)\n\nstate = SettaState()"
	if finalSnapshot.GeneratedCode.Code != wantFinalCode || writer.code != wantFinalCode {
		t.Fatalf("final generated code = %q; materialized = %q; want %q", finalSnapshot.GeneratedCode.Code, writer.code, wantFinalCode)
	}
	if len(writer.writes) != 3 {
		t.Fatalf("materialized writes = %d, want initial, callable, and parameter writes", len(writer.writes))
	}
}

func TestStoreUsesCandidateCallOffsetWhenCallableMatchesClassHeader(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, err := NewStore(writer)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	_, err = store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"__init__",
		signatureResolverFunc(func(_ context.Context, request SignatureRequest) (CallableSignature, error) {
			const wantSnapshot = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = __init__()\n\nstate = SettaState()"
			if request.Code != wantSnapshot {
				t.Fatalf("signature request code = %q, want %q", request.Code, wantSnapshot)
			}
			wantOffset := strings.LastIndex(wantSnapshot, "__init__(") + len("__init__(")
			if request.CallOffset != wantOffset {
				t.Fatalf("signature request call offset = %d, want candidate call offset %d", request.CallOffset, wantOffset)
			}
			return squareRootSignature(), nil
		}),
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
}

func TestStoreLeavesStateAndGeneratedFileUntouchedWhenMutationsFail(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, err := NewStore(writer)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	initialSnapshot := store.Snapshot()
	initialCode := writer.code

	resolverErr := errors.New("signature unavailable")
	_, err = store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
		signatureResolverFunc(func(context.Context, SignatureRequest) (CallableSignature, error) {
			return CallableSignature{}, resolverErr
		}),
	)
	if !errors.Is(err, resolverErr) {
		t.Fatalf("CommitCallable() error = %v, want signature error", err)
	}
	requireUnchangedStore(t, store, writer, initialSnapshot, initialCode)

	writeErr := errors.New("replace failed")
	writer.writeErr = writeErr
	_, err = store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
		signatureResolverFunc(func(context.Context, SignatureRequest) (CallableSignature, error) {
			return squareRootSignature(), nil
		}),
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
		signatureResolverFunc(func(context.Context, SignatureRequest) (CallableSignature, error) {
			return squareRootSignature(), nil
		}),
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
	store, err := NewStore(writer)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	before := store.Snapshot()
	beforeCode := writer.code

	_, err = store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
		signatureResolverFunc(func(context.Context, SignatureRequest) (CallableSignature, error) {
			return CallableSignature{Parameters: []SignatureParameter{
				{Name: "x", PassingStyle: codegen.ParameterPassingStylePositionalOnly},
				{Name: "base", PassingStyle: codegen.ParameterPassingStylePositionalOnly},
			}}, nil
		}),
	)
	if !errors.Is(err, ErrUnsupportedSignature) {
		t.Fatalf("CommitCallable() error = %v, want unsupported signature", err)
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func TestStoreRejectsKeywordNamedSignatureParameterWithoutCommitting(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, err := NewStore(writer)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	before := store.Snapshot()
	beforeCode := writer.code

	_, err = store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
		signatureResolverFunc(func(context.Context, SignatureRequest) (CallableSignature, error) {
			return CallableSignature{Parameters: []SignatureParameter{{
				Name:         "class",
				PassingStyle: codegen.ParameterPassingStylePositionalOrKeyword,
			}}}, nil
		}),
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

type signatureResolverFunc func(context.Context, SignatureRequest) (CallableSignature, error)

func (resolver signatureResolverFunc) ResolveCallableSignature(ctx context.Context, request SignatureRequest) (CallableSignature, error) {
	return resolver(ctx, request)
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
