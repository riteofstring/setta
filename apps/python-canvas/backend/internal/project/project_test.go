package project

import (
	"context"
	"errors"
	"fmt"
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

func TestBootstrapShippedExampleCommitsTheDemoThroughTheProviderPath(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, func(ctx context.Context, request SignatureRequest) (CallableSignature, error) {
		requireSquareRootSignatureRequest(t, ctx, request)
		return squareRootSignature(), nil
	})

	if err := store.BootstrapShippedExample(context.Background()); err != nil {
		t.Fatalf("BootstrapShippedExample() error = %v", err)
	}

	snapshot := store.Snapshot()
	requireCallableReconciliation(t, snapshot)
	requireReconciledParameter(t, snapshot)
	const wantCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = math.sqrt()\n\nstate = SettaState()"
	requireMaterializedGeneratedCode(t, snapshot, writer, wantCode, "bootstrap")
	if provider.resolveCalls != 1 {
		t.Fatalf("bootstrap signature requests = %d, want the ordinary commit path's single request", provider.resolveCalls)
	}
}

func TestBootstrapShippedExampleFailsRatherThanServingAnEmptyDemo(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	resolverErr := errors.New("signature unavailable")
	store, _ := newStoreForTest(t, writer, func(context.Context, SignatureRequest) (CallableSignature, error) {
		return CallableSignature{}, resolverErr
	})
	uncommitted := store.Snapshot()
	uncommittedCode := writer.code

	err := store.BootstrapShippedExample(context.Background())

	if !errors.Is(err, resolverErr) {
		t.Fatalf("BootstrapShippedExample() error = %v, want the provider failure", err)
	}
	requireUnchangedStore(t, store, writer, uncommitted, uncommittedCode)
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

	finalSnapshot, err := store.SetCallableParameters(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		callableSnapshot.Project.Revision,
		[]ParameterProposal{{ID: parameterID, Name: "x", AuthoredExpression: "3"}},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters() error = %v", err)
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

	writer.writeErr = writeErr
	_, err = setParameterExpression(store, committedSnapshot, "3")
	if !errors.Is(err, writeErr) {
		t.Fatalf("SetCallableParameters() error = %v, want materialization error", err)
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
			_, err := setParameterExpression(store, committedSnapshot, testCase.expression)
			if !errors.Is(err, ErrParameterExpressionInvalid) {
				t.Fatalf("SetCallableParameters() error = %v, want invalid expression", err)
			}
			requireUnchangedStore(t, store, writer, committedSnapshot, committedCode)
		})
	}
}

func TestStoreAppliesOneCompleteOrderedParameterListPerTransaction(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store := newCommittedStoreForTest(t, writer)
	committed := store.Snapshot()
	provided := committed.Parameters[0]

	// One transaction adds two authored records, values the provider-derived row, and
	// puts an authored record ahead of it. A blank record is legal and stays out of the
	// rendered call until it has a name.
	authoredSnapshot, err := store.SetCallableParameters(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		committed.Project.Revision,
		[]ParameterProposal{
			{ID: "parameter:authored:scale", Name: "scale", AuthoredExpression: "2"},
			{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"},
			{ID: "parameter:authored:blank", Name: "", AuthoredExpression: ""},
		},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters() error = %v", err)
	}
	if authoredSnapshot.Project.Revision != committed.Project.Revision+1 {
		t.Fatalf("one transaction produced revision %d, want %d", authoredSnapshot.Project.Revision, committed.Project.Revision+1)
	}
	wantIDs := []string{"parameter:authored:scale", provided.ID, "parameter:authored:blank"}
	if !reflect.DeepEqual(authoredSnapshot.Callables[0].ParameterIDs, wantIDs) {
		t.Fatalf("parameter order = %#v, want %#v", authoredSnapshot.Callables[0].ParameterIDs, wantIDs)
	}
	requireAuthoredParameterDefaults(t, authoredSnapshot.Parameters[0])
	if authoredSnapshot.Parameters[1].NameEditable {
		t.Fatalf("provider-derived parameter = %#v, want a name this store owns", authoredSnapshot.Parameters[1])
	}
	// The authored record is assigned in its own list position and passed as a keyword
	// argument, which Python requires to follow the positional one.
	const wantAuthoredCode = "import math\n\nclass SettaState:\n" +
		"    def __init__(state):\n" +
		"        state.Square_Root__scale = 2\n" +
		"        state.Square_Root__x = 3\n" +
		"        state.Square_Root = math.sqrt(state.Square_Root__x, scale=state.Square_Root__scale)\n" +
		"\nstate = SettaState()"
	requireMaterializedGeneratedCode(t, authoredSnapshot, writer, wantAuthoredCode, "authored list")

	// Naming the blank record is what admits it to the generated call.
	namedSnapshot, err := store.SetCallableParameters(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		authoredSnapshot.Project.Revision,
		[]ParameterProposal{
			{ID: "parameter:authored:scale", Name: "scale", AuthoredExpression: "2"},
			{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"},
			{ID: "parameter:authored:blank", Name: "offset", AuthoredExpression: "1"},
		},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(named) error = %v", err)
	}
	if !strings.Contains(namedSnapshot.GeneratedCode.Code, "state.Square_Root__offset = 1") {
		t.Fatalf("named record generated code = %q", namedSnapshot.GeneratedCode.Code)
	}

	// Delete Selected is one transaction rather than a loop of partial deletes.
	deletedSnapshot, err := store.SetCallableParameters(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		namedSnapshot.Project.Revision,
		[]ParameterProposal{{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"}},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(deleted) error = %v", err)
	}
	if deletedSnapshot.Project.Revision != namedSnapshot.Project.Revision+1 {
		t.Fatalf("bulk delete revision = %d, want one new revision", deletedSnapshot.Project.Revision)
	}
	if !reflect.DeepEqual(deletedSnapshot.Callables[0].ParameterIDs, []string{provided.ID}) {
		t.Fatalf("parameters after bulk delete = %#v", deletedSnapshot.Callables[0].ParameterIDs)
	}
	const wantDeletedCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root__x = 3\n        state.Square_Root = math.sqrt(state.Square_Root__x)\n\nstate = SettaState()"
	requireMaterializedGeneratedCode(t, deletedSnapshot, writer, wantDeletedCode, "bulk delete")

	// Proposing exactly what the store already holds publishes nothing.
	repeated, err := store.SetCallableParameters(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		deletedSnapshot.Project.Revision,
		[]ParameterProposal{{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"}},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters(repeated) error = %v", err)
	}
	if !reflect.DeepEqual(repeated, deletedSnapshot) {
		t.Fatalf("repeating the canonical list published revision %d", repeated.Project.Revision)
	}
}

func TestStoreRejectsInvalidParameterListsWithoutPublishing(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store := newCommittedStoreForTest(t, writer)
	committed := store.Snapshot()
	committedCode := writer.code
	provided := committed.Parameters[0]
	revision := committed.Project.Revision

	for _, testCase := range []struct {
		name      string
		revision  int
		proposals []ParameterProposal
		wantErr   error
	}{
		{
			name:      "stale revision",
			revision:  revision - 1,
			proposals: []ParameterProposal{{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"}},
			wantErr:   ErrProjectRevisionStale,
		},
		{
			name:      "renamed provider parameter",
			revision:  revision,
			proposals: []ParameterProposal{{ID: provided.ID, Name: "renamed", AuthoredExpression: ""}},
			wantErr:   ErrParameterListInvalid,
		},
		{
			name:      "repeated id",
			revision:  revision,
			proposals: []ParameterProposal{{ID: provided.ID, Name: provided.Name}, {ID: provided.ID, Name: provided.Name}},
			wantErr:   ErrParameterListInvalid,
		},
		{
			name:      "id colliding with the callable",
			revision:  revision,
			proposals: []ParameterProposal{{ID: squareRootCallableID, Name: "scale"}},
			wantErr:   ErrParameterListInvalid,
		},
		{
			name:      "keyword name",
			revision:  revision,
			proposals: []ParameterProposal{{ID: "parameter:authored:1", Name: "class"}},
			wantErr:   ErrParameterNameInvalid,
		},
		{
			name:      "name that is not an identifier",
			revision:  revision,
			proposals: []ParameterProposal{{ID: "parameter:authored:1", Name: "2 scale"}},
			wantErr:   ErrParameterNameInvalid,
		},
		{
			name:      "authored expression carrying a statement separator",
			revision:  revision,
			proposals: []ParameterProposal{{ID: "parameter:authored:1", Name: "scale", AuthoredExpression: "2; state.other = 4"}},
			wantErr:   ErrParameterExpressionInvalid,
		},
		{
			// One call cannot take the same keyword argument twice, so this candidate
			// would render a module Python refuses to parse.
			name:     "two records claiming one name",
			revision: revision,
			proposals: []ParameterProposal{
				{ID: "parameter:authored:1", Name: "scale", AuthoredExpression: "2"},
				{ID: "parameter:authored:2", Name: "scale", AuthoredExpression: "3"},
			},
			wantErr: ErrParameterNameInvalid,
		},
		{
			// The quieter half of the same defect: both records render one generated
			// path, so one assignment would silently overwrite the other.
			name:     "authored record claiming the resolved signature's name",
			revision: revision,
			proposals: []ParameterProposal{
				{ID: provided.ID, Name: provided.Name, AuthoredExpression: "3"},
				{ID: "parameter:authored:1", Name: provided.Name, AuthoredExpression: "4"},
			},
			wantErr: ErrParameterNameInvalid,
		},
		{
			name:      "more records than one call takes",
			revision:  revision,
			proposals: proposalsBeyondTheAcceptedBound(),
			wantErr:   ErrParameterListInvalid,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := store.SetCallableParameters(
				context.Background(),
				initialProjectID,
				squareRootCallableID,
				testCase.revision,
				testCase.proposals,
			)
			if !errors.Is(err, testCase.wantErr) {
				t.Fatalf("SetCallableParameters() error = %v, want %v", err, testCase.wantErr)
			}
			requireUnchangedStore(t, store, writer, committed, committedCode)
		})
	}
}

func TestStoreReplacesAuthoredParametersWhenANewCallableIsCommitted(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store := newCommittedStoreForTest(t, writer)
	committed := store.Snapshot()

	authored, err := store.SetCallableParameters(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		committed.Project.Revision,
		[]ParameterProposal{
			{ID: committed.Parameters[0].ID, Name: committed.Parameters[0].Name},
			{ID: "parameter:authored:scale", Name: "scale", AuthoredExpression: "2"},
		},
	)
	if err != nil {
		t.Fatalf("SetCallableParameters() error = %v", err)
	}

	recommitted, err := store.CommitCallable(context.Background(), initialProjectID, squareRootCallableID, "math.floor")
	if err != nil {
		t.Fatalf("CommitCallable(math.floor) error = %v", err)
	}
	if len(recommitted.Parameters) != 1 || recommitted.Parameters[0].NameEditable {
		t.Fatalf("parameters after recommit = %#v, want the resolved signature alone", recommitted.Parameters)
	}
	if strings.Contains(recommitted.GeneratedCode.Code, "scale") {
		t.Fatalf("generated code after recommit = %q, want the authored record gone", recommitted.GeneratedCode.Code)
	}
	if recommitted.Project.Revision != authored.Project.Revision+1 {
		t.Fatalf("recommit revision = %d, want one new revision", recommitted.Project.Revision)
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
	if callable.AuthoredExpression != "math.sqrt" || !reflect.DeepEqual(callable.ParameterIDs, []string{"parameter:square-root:provider"}) {
		t.Fatalf("callable after commit = %#v", callable)
	}
	if len(snapshot.Parameters) != 1 {
		t.Fatalf("parameters after callable commit = %#v", snapshot.Parameters)
	}
}

func requireReconciledParameter(t *testing.T, snapshot contracts.ProjectSnapshotV1) {
	t.Helper()
	parameter := snapshot.Parameters[0]
	if parameter.ID != "parameter:square-root:provider" || parameter.Name != "x" || parameter.NameEditable ||
		parameter.PassingStyle != contracts.ParameterPassingStylePositionalOnlyV1 ||
		parameter.TypeAnnotation != "float" || parameter.Default != nil || parameter.AuthoredExpression != "" {
		t.Fatalf("parameter after callable commit = %#v", parameter)
	}
}

func requireAuthoredParameterDefaults(t *testing.T, parameter contracts.ParameterV1) {
	t.Helper()
	if !parameter.NameEditable ||
		parameter.PassingStyle != contracts.ParameterPassingStylePositionalOrKeywordV1 ||
		parameter.TypeAnnotation != "" || parameter.Default != nil {
		t.Fatalf("authored parameter = %#v, want the backend's own authored defaults", parameter)
	}
}

// One valid record past the bound the store accepts, so the list itself is what the
// store refuses rather than anything about the records in it.
func proposalsBeyondTheAcceptedBound() []ParameterProposal {
	proposals := make([]ParameterProposal, 0, maxProposedParameters+1)
	for index := 0; index <= maxProposedParameters; index++ {
		proposals = append(proposals, ParameterProposal{
			ID:   fmt.Sprintf("parameter:authored:%d", index),
			Name: fmt.Sprintf("scale_%d", index),
		})
	}
	return proposals
}

// The store's own two-step demo state: the shipped callable committed through the
// provider path, which is where every parameter-list case starts.
func newCommittedStoreForTest(t *testing.T, writer GeneratedFileWriter) *Store {
	t.Helper()
	store, _ := newStoreForTest(t, writer, func(_ context.Context, _ SignatureRequest) (CallableSignature, error) {
		return squareRootSignature(), nil
	})
	if _, err := store.CommitCallable(context.Background(), initialProjectID, squareRootCallableID, "math.sqrt"); err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	return store
}

// Editing one value is the same complete-list transaction as every other change,
// so tests that only care about a value send the list the snapshot already holds.
func setParameterExpression(
	store *Store,
	snapshot contracts.ProjectSnapshotV1,
	expression string,
) (contracts.ProjectSnapshotV1, error) {
	proposals := make([]ParameterProposal, 0, len(snapshot.Parameters))
	for _, parameter := range snapshot.Parameters {
		proposals = append(proposals, ParameterProposal{
			ID:                 parameter.ID,
			Name:               parameter.Name,
			AuthoredExpression: expression,
		})
	}
	return store.SetCallableParameters(
		context.Background(),
		snapshot.Project.ID,
		snapshot.Callables[0].ID,
		snapshot.Project.Revision,
		proposals,
	)
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
