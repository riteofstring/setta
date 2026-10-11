package coordinator

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/projectfile"
)

func TestStructuralCardinalityMutationsPublishBeforeDiagnostics(t *testing.T) {
	tests := []struct {
		name   string
		ids    []string
		setup  func(t *testing.T, coordinator *Coordinator) Snapshot
		invoke func(*Coordinator, Snapshot) (Snapshot, error)
		assert func(*testing.T, Snapshot)
	}{
		{
			name: "create callable",
			ids:  []string{"project:create-callable", "callable:created"},
			setup: func(_ *testing.T, coordinator *Coordinator) Snapshot {
				return coordinator.Snapshot()
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
					ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Created callable",
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.Callables) != 1 || snapshot.State.Callables[0].ID != "callable:created" {
					t.Fatalf("created callables = %#v", snapshot.State.Callables)
				}
			},
		},
		{
			name: "delete callable",
			ids:  []string{"project:delete-callable", "callable:initial"},
			setup: func(t *testing.T, coordinator *Coordinator) Snapshot {
				return createCallableAndSettle(t, coordinator, "Initial callable")
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.DeleteCallable(context.Background(), aggregate.DeleteCallableCommand{
					ProjectID: before.State.Project.ID, CallableID: "callable:initial", ExpectedRevision: before.State.Project.Revision,
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.Callables) != 0 {
					t.Fatalf("deleted callables = %#v", snapshot.State.Callables)
				}
			},
		},
		{
			name: "create parameter dictionary",
			ids:  []string{"project:create-dictionary", "dictionary:created"},
			setup: func(_ *testing.T, coordinator *Coordinator) Snapshot {
				return coordinator.Snapshot()
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.CreateParameterDictionary(context.Background(), aggregate.CreateParameterDictionaryCommand{
					ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Created dictionary",
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.ParameterDictionaries) != 1 || snapshot.State.ParameterDictionaries[0].ID != "dictionary:created" {
					t.Fatalf("created dictionaries = %#v", snapshot.State.ParameterDictionaries)
				}
			},
		},
		{
			name: "delete parameter dictionary",
			ids:  []string{"project:delete-dictionary", "dictionary:initial"},
			setup: func(t *testing.T, coordinator *Coordinator) Snapshot {
				before := coordinator.Snapshot()
				created, err := coordinator.CreateParameterDictionary(context.Background(), aggregate.CreateParameterDictionaryCommand{
					ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Initial dictionary",
				})
				if err != nil {
					t.Fatalf("CreateParameterDictionary() error = %v", err)
				}
				return awaitDiagnosticsSettled(t, coordinator, created.State.Project.Revision)
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.DeleteParameterDictionary(context.Background(), aggregate.DeleteParameterDictionaryCommand{
					ProjectID: before.State.Project.ID, DictionaryID: "dictionary:initial", ExpectedRevision: before.State.Project.Revision,
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.ParameterDictionaries) != 0 {
					t.Fatalf("deleted dictionaries = %#v", snapshot.State.ParameterDictionaries)
				}
			},
		},
		{
			name: "create list",
			ids:  []string{"project:create-list", "list:created"},
			setup: func(_ *testing.T, coordinator *Coordinator) Snapshot {
				return coordinator.Snapshot()
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.CreateList(context.Background(), aggregate.CreateListCommand{
					ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Created list",
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.Lists) != 1 || snapshot.State.Lists[0].ID != "list:created" {
					t.Fatalf("created lists = %#v", snapshot.State.Lists)
				}
			},
		},
		{
			name: "delete list",
			ids:  []string{"project:delete-list", "list:initial"},
			setup: func(t *testing.T, coordinator *Coordinator) Snapshot {
				return createListAndSettle(t, coordinator, "Initial list")
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.DeleteList(context.Background(), aggregate.DeleteListCommand{
					ProjectID: before.State.Project.ID, ListID: "list:initial", ExpectedRevision: before.State.Project.Revision,
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.Lists) != 0 {
					t.Fatalf("deleted lists = %#v", snapshot.State.Lists)
				}
			},
		},
		{
			name: "increment list children",
			ids:  []string{"project:increment-list", "list:initial", "callable:child"},
			setup: func(t *testing.T, coordinator *Coordinator) Snapshot {
				return createListAndSettle(t, coordinator, "Initial list")
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.IncrementListChildren(context.Background(), aggregate.IncrementListChildrenCommand{
					ProjectID: before.State.Project.ID, ListID: "list:initial", ExpectedRevision: before.State.Project.Revision, Count: 1,
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.Callables) != 1 || len(snapshot.State.Lists) != 1 || len(snapshot.State.Lists[0].ChildSectionIDs) != 1 {
					t.Fatalf("incremented list state = %#v", snapshot.State)
				}
			},
		},
		{
			name: "decrement list children",
			ids:  []string{"project:decrement-list", "list:initial", "callable:child"},
			setup: func(t *testing.T, coordinator *Coordinator) Snapshot {
				list := createListAndSettle(t, coordinator, "Initial list")
				incremented, err := coordinator.IncrementListChildren(context.Background(), aggregate.IncrementListChildrenCommand{
					ProjectID: list.State.Project.ID, ListID: "list:initial", ExpectedRevision: list.State.Project.Revision, Count: 1,
				})
				if err != nil {
					t.Fatalf("IncrementListChildren() setup error = %v", err)
				}
				return awaitDiagnosticsSettled(t, coordinator, incremented.State.Project.Revision)
			},
			invoke: func(coordinator *Coordinator, before Snapshot) (Snapshot, error) {
				return coordinator.DecrementListChildren(context.Background(), aggregate.DecrementListChildrenCommand{
					ProjectID: before.State.Project.ID, ListID: "list:initial", ExpectedRevision: before.State.Project.Revision, Count: 1,
				})
			},
			assert: func(t *testing.T, snapshot Snapshot) {
				t.Helper()
				if len(snapshot.State.Callables) != 0 || len(snapshot.State.Lists) != 1 || len(snapshot.State.Lists[0].ChildSectionIDs) != 0 {
					t.Fatalf("decremented list state = %#v", snapshot.State)
				}
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider := newHeldDiagnosticsProvider()
			coordinator, _ := newStructuralDiagnosticsCoordinator(t, provider, test.ids...)
			before := test.setup(t, coordinator)
			provider.setHeld(true)

			snapshot := awaitStructuralMutation(t, func() (Snapshot, error) {
				return test.invoke(coordinator, before)
			})
			requireStructuralMutationPublished(t, before, snapshot)
			test.assert(t, snapshot)
			provider.awaitStarted(t)
			provider.releaseSuccess("Settled structural diagnostics.")
			settled := awaitDiagnosticsSettled(t, coordinator, snapshot.State.Project.Revision)
			requireSettledStructuralDiagnostics(t, settled)
		})
	}
}

func requireStructuralMutationPublished(t *testing.T, before, snapshot Snapshot) {
	t.Helper()
	requirePendingDiagnostics(t, snapshot)
	if snapshot.Rendered.Code == before.Rendered.Code {
		t.Fatal("structural response did not include updated Generated Python")
	}
}

func requireSettledStructuralDiagnostics(t *testing.T, snapshot Snapshot) {
	t.Helper()
	if len(snapshot.Diagnostics) != 1 || snapshot.Diagnostics[0].Message != "Settled structural diagnostics." {
		t.Fatalf("settled diagnostics = %#v", snapshot.Diagnostics)
	}
}

func TestStructuralDeleteRemainsDurableAfterDiagnosticsSettle(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, path := newStructuralDiagnosticsCoordinator(t, provider, "project:delete-durable", "callable:initial")
	created := createCallableAndSettle(t, coordinator, "Initial callable")
	provider.setHeld(true)

	deleted := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.DeleteCallable(context.Background(), aggregate.DeleteCallableCommand{
			ProjectID: created.State.Project.ID, CallableID: "callable:initial", ExpectedRevision: created.State.Project.Revision,
		})
	})
	requirePendingDiagnostics(t, deleted)
	if containsCallable(deleted.State, "callable:initial") {
		t.Fatalf("deleted callable reappeared in immediate snapshot: %#v", deleted.State.Callables)
	}
	provider.awaitStarted(t)
	provider.releaseSuccess("Settled deletion diagnostics.")
	settled := awaitDiagnosticsSettled(t, coordinator, deleted.State.Project.Revision)
	if containsCallable(settled.State, "callable:initial") {
		t.Fatalf("deleted callable reappeared after diagnostics: %#v", settled.State.Callables)
	}
	durable, err := projectfile.NewAdapter().Load(path)
	if err != nil {
		t.Fatalf("load durable deletion state: %v", err)
	}
	if containsCallable(durable, "callable:initial") {
		t.Fatalf("deleted callable remained durable: %#v", durable.Callables)
	}
}

func TestStructuralDiagnosticsDiscardStaleResultAndSettleNewestRevision(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, _ := newStructuralDiagnosticsCoordinator(t, provider, "project:latest", "callable:first", "callable:second")
	provider.setHeld(true)
	initial := coordinator.Snapshot()
	first := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: initial.State.Project.ID, ExpectedRevision: initial.State.Project.Revision, Name: "First",
		})
	})
	provider.awaitStarted(t)
	second := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: first.State.Project.ID, ExpectedRevision: first.State.Project.Revision, Name: "Second",
		})
	})
	requirePendingDiagnostics(t, second)

	provider.releaseSuccess("Stale diagnostics.")
	provider.awaitStarted(t)
	provider.releaseSuccess("Newest diagnostics.")
	settled := awaitDiagnosticsSettled(t, coordinator, second.State.Project.Revision)
	if len(settled.State.Callables) != 2 {
		t.Fatalf("latest structural state = %#v", settled.State.Callables)
	}
	if len(settled.Diagnostics) != 1 || settled.Diagnostics[0].Message != "Newest diagnostics." {
		t.Fatalf("diagnostics after stale result = %#v", settled.Diagnostics)
	}
}

func TestStructuralDiagnosticsFailureDoesNotRollBackDurableMutation(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, path := newStructuralDiagnosticsCoordinator(t, provider, "project:failure", "callable:created")
	provider.setHeld(true)
	before := coordinator.Snapshot()
	created := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Created callable",
		})
	})
	provider.awaitStarted(t)
	provider.releaseError(errors.New("diagnostics unavailable"))
	settled := awaitDiagnosticsSettled(t, coordinator, created.State.Project.Revision)
	if !containsCallable(settled.State, "callable:created") {
		t.Fatalf("provider failure rolled back callable: %#v", settled.State.Callables)
	}
	if len(settled.Diagnostics) != 0 || settled.ProviderStatus.Availability != ProviderAvailabilityUnavailable || settled.ProviderStatus.State != ProviderLifecycleFailed {
		t.Fatalf("failed diagnostics snapshot = %#v", settled)
	}
	durable, err := projectfile.NewAdapter().Load(path)
	if err != nil {
		t.Fatalf("load durable failure state: %v", err)
	}
	if !containsCallable(durable, "callable:created") {
		t.Fatalf("provider failure removed durable callable: %#v", durable.Callables)
	}
}

func TestSynchronousMutationSupersedesQueuedStructuralDiagnosticsBeforeProviderExecution(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, _ := newStructuralDiagnosticsCoordinator(t, provider, "project:serialized", "callable:created")

	coordinator.providerMu.Lock()
	locked := true
	defer func() {
		if locked {
			coordinator.providerMu.Unlock()
		}
	}()
	initial := coordinator.Snapshot()
	created := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: initial.State.Project.ID, ExpectedRevision: initial.State.Project.Revision, Name: "Created callable",
		})
	})
	awaitCondition(t, "background work capture", func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.pendingAnalysis == nil
	})

	type mutationResult struct {
		snapshot Snapshot
		err      error
	}
	renamedResult := make(chan mutationResult, 1)
	go func() {
		snapshot, err := coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
			ProjectID: created.State.Project.ID, ExpectedRevision: created.State.Project.Revision, Name: "Renamed project",
		})
		renamedResult <- mutationResult{snapshot: snapshot, err: err}
	}()
	newRevision := created.State.Project.Revision + 1
	awaitCondition(t, "new synchronous provider revision", func() bool {
		return coordinator.providerTargetRevision.Load() == int64(newRevision)
	})

	coordinator.providerMu.Unlock()
	locked = false
	select {
	case renamed := <-renamedResult:
		if renamed.err != nil {
			t.Fatalf("RenameProject() error = %v", renamed.err)
		}
		if renamed.snapshot.DiagnosticsRevision != renamed.snapshot.State.Project.Revision || !providerIsReady(renamed.snapshot.ProviderStatus) {
			t.Fatalf("synchronous settled snapshot = %#v", renamed.snapshot)
		}
	case <-time.After(testWaitTimeout):
		t.Fatal("RenameProject() did not complete after provider serialization released")
	}
	requests := provider.requests()
	if len(requests) != 2 || requests[0].Revision != 1 || requests[1].Revision != 2 {
		t.Fatalf("provider requests = %#v, want startup and newer synchronous revisions only", requests)
	}
}

func TestCoordinatorCloseCancelsBackgroundDiagnosticsBeforeClosingProvider(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, _ := newStructuralDiagnosticsCoordinator(t, provider, "project:close", "callable:created")
	provider.setHeld(true)
	before := coordinator.Snapshot()
	_ = awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Created callable",
		})
	})
	provider.awaitStarted(t)

	closed := make(chan error, 1)
	go func() {
		closed <- coordinator.Close()
	}()
	select {
	case err := <-closed:
		if err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	case <-time.After(testWaitTimeout):
		t.Fatal("Close() did not stop held background diagnostics")
	}
	if !provider.isClosed() {
		t.Fatal("Close() did not close the provider after stopping background diagnostics")
	}
}

func TestCoordinatorCloseCancelsHeldDiagnosticsWhileSynchronousMutationWaits(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, _ := newStructuralDiagnosticsCoordinator(t, provider, "project:close-interleaving", "callable:created")
	provider.setHeld(true)
	before := coordinator.Snapshot()
	created := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Created callable",
		})
	})
	provider.awaitStarted(t)

	type mutationResult struct {
		snapshot Snapshot
		err      error
	}
	renamedResult := make(chan mutationResult, 1)
	go func() {
		snapshot, err := coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
			ProjectID: created.State.Project.ID, ExpectedRevision: created.State.Project.Revision, Name: "Renamed project",
		})
		renamedResult <- mutationResult{snapshot: snapshot, err: err}
	}()
	awaitCondition(t, "synchronous provider mutation", func() bool {
		return coordinator.providerTargetRevision.Load() == int64(created.State.Project.Revision+1)
	})

	closed := make(chan error, 1)
	go func() {
		closed <- coordinator.Close()
	}()

	provider.awaitStarted(t)
	provider.releaseSuccess("Renamed diagnostics.")
	select {
	case renamed := <-renamedResult:
		if renamed.err != nil {
			t.Fatalf("RenameProject() error = %v", renamed.err)
		}
	case <-time.After(testWaitTimeout):
		t.Fatal("RenameProject() remained blocked after Close cancelled diagnostics")
	}
	select {
	case err := <-closed:
		if err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	case <-time.After(testWaitTimeout):
		t.Fatal("Close() remained blocked behind held diagnostics and a synchronous mutation")
	}
	if !provider.isClosed() {
		t.Fatal("Close() did not close the provider after the interleaving settled")
	}
}

const testWaitTimeout = 2 * time.Second

type heldDiagnosticsProvider struct {
	mu sync.Mutex

	held             bool
	closed           bool
	recordedRequests []GeneratedDocumentRequest
	started          chan GeneratedDocumentRequest
	releases         chan heldDiagnosticsResult
}

type heldDiagnosticsResult struct {
	result GeneratedDocumentResult
	err    error
}

func newHeldDiagnosticsProvider() *heldDiagnosticsProvider {
	return &heldDiagnosticsProvider{
		started:  make(chan GeneratedDocumentRequest, 8),
		releases: make(chan heldDiagnosticsResult, 8),
	}
}

func (provider *heldDiagnosticsProvider) ResolveCallableSignature(context.Context, SignatureRequest) ([]aggregate.ProviderParameter, error) {
	return []aggregate.ProviderParameter{}, nil
}

func (provider *heldDiagnosticsProvider) SynchronizeGeneratedDocument(ctx context.Context, request GeneratedDocumentRequest) (GeneratedDocumentResult, error) {
	provider.mu.Lock()
	if provider.closed {
		provider.mu.Unlock()
		return GeneratedDocumentResult{}, errors.New("provider is closed")
	}
	provider.recordedRequests = append(provider.recordedRequests, request)
	held := provider.held
	provider.mu.Unlock()
	if !held {
		return readyDiagnosticsResult(), nil
	}
	select {
	case provider.started <- request:
	case <-ctx.Done():
		return GeneratedDocumentResult{}, ctx.Err()
	}
	select {
	case result := <-provider.releases:
		return result.result, result.err
	case <-ctx.Done():
		return GeneratedDocumentResult{}, ctx.Err()
	}
}

func (provider *heldDiagnosticsProvider) Close() error {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.closed = true
	return nil
}

func (provider *heldDiagnosticsProvider) setHeld(held bool) {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.held = held
}

func (provider *heldDiagnosticsProvider) awaitStarted(t *testing.T) GeneratedDocumentRequest {
	t.Helper()
	select {
	case request := <-provider.started:
		return request
	case <-time.After(testWaitTimeout):
		t.Fatal("background diagnostics did not reach the held provider")
		return GeneratedDocumentRequest{}
	}
}

func (provider *heldDiagnosticsProvider) releaseSuccess(message string) {
	provider.releases <- heldDiagnosticsResult{result: GeneratedDocumentResult{
		Diagnostics: []ProviderDiagnostic{{
			Start: 0, End: 0, Severity: ProviderDiagnosticInformation, Message: message,
		}},
		ProviderStatus: readyDiagnosticsResult().ProviderStatus,
	}}
}

func (provider *heldDiagnosticsProvider) releaseError(err error) {
	provider.releases <- heldDiagnosticsResult{err: err}
}

func (provider *heldDiagnosticsProvider) requests() []GeneratedDocumentRequest {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	return append([]GeneratedDocumentRequest{}, provider.recordedRequests...)
}

func (provider *heldDiagnosticsProvider) isClosed() bool {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	return provider.closed
}

func readyDiagnosticsResult() GeneratedDocumentResult {
	return GeneratedDocumentResult{
		Diagnostics: []ProviderDiagnostic{},
		ProviderStatus: ProviderStatus{
			Provider: "basedpyright", Availability: ProviderAvailabilityAvailable, State: ProviderLifecycleReady,
		},
	}
}

func newStructuralDiagnosticsCoordinator(t *testing.T, provider Provider, ids ...string) (*Coordinator, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "project.json")
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, Create: true, IDGenerator: sequenceIDs(ids...), Materializer: newMaterialization(t, path), Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	t.Cleanup(func() {
		if err := coordinator.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	})
	return coordinator, path
}

func createCallableAndSettle(t *testing.T, coordinator *Coordinator, name string) Snapshot {
	t.Helper()
	before := coordinator.Snapshot()
	created, err := coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: name,
	})
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	return awaitDiagnosticsSettled(t, coordinator, created.State.Project.Revision)
}

func createListAndSettle(t *testing.T, coordinator *Coordinator, name string) Snapshot {
	t.Helper()
	before := coordinator.Snapshot()
	created, err := coordinator.CreateList(context.Background(), aggregate.CreateListCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: name,
	})
	if err != nil {
		t.Fatalf("CreateList() error = %v", err)
	}
	return awaitDiagnosticsSettled(t, coordinator, created.State.Project.Revision)
}

func awaitStructuralMutation(t *testing.T, mutate func() (Snapshot, error)) Snapshot {
	t.Helper()
	type result struct {
		snapshot Snapshot
		err      error
	}
	completed := make(chan result, 1)
	go func() {
		snapshot, err := mutate()
		completed <- result{snapshot: snapshot, err: err}
	}()
	select {
	case result := <-completed:
		if result.err != nil {
			t.Fatalf("structural mutation error = %v", result.err)
		}
		return result.snapshot
	case <-time.After(testWaitTimeout):
		t.Fatal("structural mutation waited for held diagnostics")
		return Snapshot{}
	}
}

func awaitDiagnosticsSettled(t *testing.T, coordinator *Coordinator, revision int) Snapshot {
	t.Helper()
	var snapshot Snapshot
	awaitCondition(t, fmt.Sprintf("diagnostics revision %d", revision), func() bool {
		snapshot = coordinator.Snapshot()
		return snapshot.State.Project.Revision == revision && snapshot.DiagnosticsRevision == revision
	})
	return snapshot
}

func awaitCondition(t *testing.T, name string, condition func() bool) {
	t.Helper()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	timeout := time.NewTimer(testWaitTimeout)
	defer timeout.Stop()
	for {
		if condition() {
			return
		}
		select {
		case <-ticker.C:
		case <-timeout.C:
			t.Fatalf("timed out waiting for %s", name)
		}
	}
}

func requirePendingDiagnostics(t *testing.T, snapshot Snapshot) {
	t.Helper()
	if snapshot.DiagnosticsRevision >= snapshot.State.Project.Revision {
		t.Fatalf("diagnostics freshness = %d for project revision %d, want trailing", snapshot.DiagnosticsRevision, snapshot.State.Project.Revision)
	}
	if len(snapshot.Diagnostics) != 0 || snapshot.ProviderStatus.Availability != ProviderAvailabilityAvailable || snapshot.ProviderStatus.State != ProviderLifecyclePending {
		t.Fatalf("pending structural snapshot = %#v", snapshot)
	}
}

func containsCallable(state aggregate.State, callableID string) bool {
	for _, callable := range state.Callables {
		if callable.ID == callableID {
			return true
		}
	}
	return false
}
