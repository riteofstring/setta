package narration

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"

	"setta/internal/conversation"
)

const failureTestTimeout = 5 * time.Second

type attemptWorkerFunc func(context.Context, Invocation) (PreparedCommit, error)

func (worker attemptWorkerFunc) PrepareAttempt(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	return worker(ctx, invocation)
}

func TestResilientWorkerCommitsDegradationThenRetriesBelowNewWork(t *testing.T) {
	store := newFailureTestStore()
	retryWait := newControlledRetryWait()
	handler := newFailureTestHandler(t, store, RetryPolicy{Delays: []time.Duration{time.Minute}})

	blockerStarted := make(chan struct{})
	releaseBlocker := make(chan struct{})
	retryCommitted := make(chan struct{})
	var mu sync.Mutex
	var attempted []string
	attempts := attemptWorkerFunc(func(ctx context.Context, invocation Invocation) (PreparedCommit, error) {
		mu.Lock()
		attempted = append(attempted, invocation.Request.ID)
		mu.Unlock()
		switch invocation.Request.ID {
		case "initial":
			return nil, NewAttemptFailure(FailureKindProviderUnavailable, errors.New("provider session closed"))
		case "blocker":
			close(blockerStarted)
			select {
			case <-releaseBlocker:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		return func(context.Context) error {
			store.markReady()
			if invocation.Request.RetryAttempt == 1 {
				close(retryCommitted)
			}
			return nil
		}, nil
	})
	worker := newFailureTestWorker(t, attempts, handler)
	registry, err := NewRegistry(worker, WithRetryWait(retryWait.Wait))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	initial := submitTestRequest(t, registry, projectionRequest(
		"initial",
		store.state.ConversationID,
		conversation.NarrationTriggerPlanChanged,
	))
	err = waitReceiptError(t, initial)
	var degraded *DegradedError
	if !errors.As(err, &degraded) {
		t.Fatalf("initial receipt error = %T %v, want DegradedError", err, err)
	}
	if degraded.Degradation.Code != string(FailureKindProviderUnavailable) ||
		!degraded.Degradation.Retryable || degraded.Generation != 1 {
		t.Fatalf("typed degraded error = %+v", degraded)
	}
	assertFailureStoreDegraded(t, store)
	waitRetryDelay(t, retryWait.started, time.Minute)

	blocker := submitTestRequest(t, registry, projectionRequest(
		"blocker",
		store.state.ConversationID,
		conversation.NarrationTriggerPhaseActivityCompleted,
	))
	waitSignal(t, blockerStarted, "blocking automatic projection")
	newer := submitTestRequest(t, registry, projectionRequest(
		"newer",
		store.state.ConversationID,
		conversation.NarrationTriggerUserSteered,
	))
	close(retryWait.release)
	close(releaseBlocker)
	waitReceipt(t, blocker)
	waitReceipt(t, newer)
	waitSignal(t, retryCommitted, "recoverable retry commit")
	shutdownTestRegistry(t, registry)

	mu.Lock()
	defer mu.Unlock()
	wantOrder := []string{"initial", "blocker", "newer", "narrator_retry-3"}
	if !reflect.DeepEqual(attempted, wantOrder) {
		t.Fatalf("attempt order = %v, want %v", attempted, wantOrder)
	}
	if state := store.snapshot(); state.Status != conversation.NarratorStatusReady || state.Degradation != nil {
		t.Fatalf("successful retry did not recover narrator state: %+v", state)
	}
}

func TestFailureHandlerDoesNotRetryStatusOrNonrecoverableFailures(t *testing.T) {
	tests := []struct {
		name      string
		request   Request
		failure   error
		wantCode  FailureKind
		retryable bool
	}{
		{
			name:      "explicit status provider failure",
			request:   statusRequest("status", "conversation-failure"),
			failure:   NewAttemptFailure(FailureKindProviderUnavailable, errors.New("provider unavailable")),
			wantCode:  FailureKindProviderUnavailable,
			retryable: true,
		},
		{
			name:      "invalid model configuration",
			request:   projectionRequest("projection", "conversation-failure", conversation.NarrationTriggerPlanChanged),
			failure:   NewAttemptFailure(FailureKindConfigurationInvalid, errors.New("configured model unavailable")),
			wantCode:  FailureKindConfigurationInvalid,
			retryable: false,
		},
		{
			name:      "untyped failure is internal and nonretryable",
			request:   checkpointRequest("checkpoint", "conversation-failure"),
			failure:   errors.New("temporary provider-looking text is not a typed provider failure"),
			wantCode:  FailureKindInternal,
			retryable: false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newFailureTestStore()
			handler := newFailureTestHandler(t, store, RetryPolicy{Delays: []time.Duration{time.Second}})
			work, err := handler.Prepare(context.Background(), Invocation{
				Request:    test.request,
				Generation: 4,
			}, test.failure)
			if err != nil {
				t.Fatalf("prepare degradation: %v", err)
			}
			if work.Retry != nil {
				t.Fatalf("unexpected retry = %+v", work.Retry)
			}
			if err := work.Commit(context.Background()); err != nil {
				t.Fatalf("commit degradation: %v", err)
			}
			var degraded *DegradedError
			if !errors.As(work.CompletionError, &degraded) {
				t.Fatalf("completion error = %T %v, want DegradedError", work.CompletionError, work.CompletionError)
			}
			if degraded.Degradation.Code != string(test.wantCode) ||
				degraded.Degradation.Retryable != test.retryable || degraded.Generation != 4 {
				t.Fatalf("degradation = %+v", degraded.Degradation)
			}
		})
	}
}

func TestFailureHandlerBoundsRetriesAndPreservesOperationKind(t *testing.T) {
	store := newFailureTestStore()
	policy := RetryPolicy{Delays: []time.Duration{time.Second, 3 * time.Second}}
	handler := newFailureTestHandler(t, store, policy)
	request := checkpointRequest("checkpoint", store.state.ConversationID)

	first, err := handler.Prepare(context.Background(), Invocation{Request: request, Generation: 1},
		NewAttemptFailure(FailureKindProviderOutputInvalid, errors.New("invalid output")))
	if err != nil {
		t.Fatalf("prepare first retry: %v", err)
	}
	if first.Retry == nil || first.Retry.After != time.Second ||
		first.Retry.Request.Kind != RequestKindCheckpoint ||
		first.Retry.Request.Trigger != conversation.NarrationTriggerCheckpointWindowExceeded ||
		first.Retry.Request.RetryAttempt != 1 || !first.Retry.Request.RecoverableRetry {
		t.Fatalf("first retry directive = %+v", first.Retry)
	}

	exhaustedRequest := first.Retry.Request
	exhaustedRequest.RetryAttempt = len(policy.Delays)
	exhaustedRequest.RecoverableRetry = true
	exhausted, err := handler.Prepare(context.Background(), Invocation{
		Request: exhaustedRequest, Generation: 3,
	}, NewAttemptFailure(FailureKindProviderUnavailable, errors.New("still unavailable")))
	if err != nil {
		t.Fatalf("prepare exhausted retry: %v", err)
	}
	if exhausted.Retry != nil {
		t.Fatalf("retry policy exceeded its finite delays: %+v", exhausted.Retry)
	}
}

func TestCallerClassifiesFailureAtTheOwningStage(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	sentinel := errors.New("provider transport stopped")
	provider := &recordingFreshStructuredProvider{err: sentinel}
	caller := newTestCaller(t, provider)
	_, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-provider-failure",
		Generation:    1,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	assertAttemptFailure(t, err, FailureKindProviderUnavailable, sentinel)

	provider.err = nil
	provider.output = []byte(`{"kind":"working_projection"}`)
	_, err = caller.Call(context.Background(), CallRequest{
		ID:            "narrator-output-failure",
		Generation:    2,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	assertAttemptFailure(t, err, FailureKindProviderOutputInvalid, nil)

	catalogFailure := errors.New("configured narrator model is unavailable")
	models := newTestModelResolver(
		t,
		&modelResolverProfileSource{},
		&modelResolverCatalog{err: catalogFailure},
	)
	configurationCaller, err := NewCaller(models, &recordingFreshStructuredProvider{})
	if err != nil {
		t.Fatalf("NewCaller for configuration failure: %v", err)
	}
	_, err = configurationCaller.Call(context.Background(), CallRequest{
		ID:            "narrator-configuration-failure",
		Generation:    3,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	assertAttemptFailure(t, err, FailureKindConfigurationInvalid, catalogFailure)

	stateUnavailable := &conversation.PersistenceError{
		Operation: "read narrator role profile",
		Path:      "/tmp/conversations.sqlite",
		Err:       errors.New("database is unavailable"),
	}
	stateCaller, err := NewCaller(
		newTestModelResolver(
			t,
			&modelResolverProfileSource{err: stateUnavailable},
			&modelResolverCatalog{},
		),
		&recordingFreshStructuredProvider{},
	)
	if err != nil {
		t.Fatalf("NewCaller for durable state failure: %v", err)
	}
	_, err = stateCaller.Call(context.Background(), CallRequest{
		ID:            "narrator-state-failure",
		Generation:    4,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	assertAttemptFailure(t, err, FailureKindStateUnavailable, stateUnavailable)

	stateCorrupt := &conversation.CorruptStateError{
		Path: "/tmp/conversations.sqlite",
		Err:  errors.New("role profile is malformed"),
	}
	corruptCaller, err := NewCaller(
		newTestModelResolver(
			t,
			&modelResolverProfileSource{err: stateCorrupt},
			&modelResolverCatalog{},
		),
		&recordingFreshStructuredProvider{},
	)
	if err != nil {
		t.Fatalf("NewCaller for corrupt durable state: %v", err)
	}
	_, err = corruptCaller.Call(context.Background(), CallRequest{
		ID:            "narrator-corrupt-state-failure",
		Generation:    5,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	assertAttemptFailure(t, err, FailureKindStateCorrupt, stateCorrupt)

	profile := conversation.DefaultNarratorRoleProfile()
	profile.ContextBudget.MaxInputBytes = bundle.InputBytes - 1
	budgetModels := newTestModelResolver(
		t,
		&modelResolverProfileSource{profile: &profile},
		&modelResolverCatalog{},
	)
	budgetCaller, err := NewCaller(budgetModels, &recordingFreshStructuredProvider{})
	if err != nil {
		t.Fatalf("NewCaller for context budget failure: %v", err)
	}
	_, err = budgetCaller.Call(context.Background(), CallRequest{
		ID:            "narrator-context-budget-failure",
		Generation:    6,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	assertAttemptFailure(t, err, FailureKindContextBudgetExceeded, ErrContextBudgetExceeded)
}

func TestClassifyFailureRecognizesDurableStateAvailability(t *testing.T) {
	tests := []error{
		&conversation.PersistenceError{
			Operation: "read narrator context",
			Path:      "/tmp/conversations.sqlite",
			Err:       errors.New("input/output error"),
		},
		conversation.ErrStoreClosed,
		&conversation.StateConflictError{
			Entity: "narrator state",
			ID:     "conversation",
			Reason: "stale cursor",
		},
		&conversation.WriteOutcomeError{
			Operation: "commit narrator state",
			Outcome:   conversation.WriteOutcomeSaturated,
		},
	}
	for _, stateErr := range tests {
		kind, err := classifyFailure(stateErr)
		if err != nil || kind != FailureKindStateUnavailable {
			t.Errorf("classifyFailure(%T) = %s, %v, want %s", stateErr, kind, err, FailureKindStateUnavailable)
		}
	}
}

func assertAttemptFailure(t *testing.T, err error, kind FailureKind, cause error) {
	t.Helper()
	var failure *AttemptFailure
	if !errors.As(err, &failure) || failure.Kind != kind {
		t.Fatalf("attempt failure = %T %v, want kind %s", err, err, kind)
	}
	if cause != nil && !errors.Is(err, cause) {
		t.Fatalf("attempt failure does not unwrap cause %v: %v", cause, err)
	}
}

type failureTestStore struct {
	mu      sync.Mutex
	state   conversation.NarratorState
	commits []conversation.NarratorDegradationCommit
}

func newFailureTestStore() *failureTestStore {
	return &failureTestStore{state: conversation.NarratorState{
		ConversationID:            "conversation-failure",
		ObservedThroughSequence:   8,
		CheckpointThroughSequence: 4,
		CheckpointText:            "The last valid historical checkpoint.",
		CurrentFocus:              "The last valid narrator focus.",
		CurrentFocusRevision:      2,
		TopicDescriptor:           "Typed narrator failure recovery",
		Status:                    conversation.NarratorStatusReady,
		UpdatedAt:                 "2026-07-11T20:00:00Z",
	}}
}

func (store *failureTestStore) ReadNarratorState(
	_ context.Context,
	conversationID string,
) (conversation.NarratorState, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if conversationID != store.state.ConversationID {
		return conversation.NarratorState{}, fmt.Errorf("unknown conversation %s", conversationID)
	}
	return cloneFailureTestState(store.state), nil
}

func (store *failureTestStore) CommitNarratorDegradation(
	_ context.Context,
	request conversation.NarratorDegradationCommit,
) (conversation.NarratorState, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := request.Validate(); err != nil {
		return conversation.NarratorState{}, err
	}
	if request.Expected.UpdatedAt != store.state.UpdatedAt ||
		request.Expected.ObservedThroughSequence != store.state.ObservedThroughSequence ||
		request.Expected.CheckpointThroughSequence != store.state.CheckpointThroughSequence ||
		request.Expected.CurrentFocusRevision != store.state.CurrentFocusRevision {
		return conversation.NarratorState{}, &conversation.StateConflictError{
			Entity: "narrator state",
			ID:     request.ConversationID,
			Reason: "stale failure test expectation",
		}
	}
	degradation := request.Degradation
	store.state.Status = conversation.NarratorStatusDegraded
	store.state.Degradation = &degradation
	store.state.LastInvocationAt = stringPointerForFailureTest(request.Degradation.DegradedAt)
	store.state.UpdatedAt = request.CommittedAt
	store.commits = append(store.commits, request)
	return cloneFailureTestState(store.state), nil
}

func (store *failureTestStore) markReady() {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.state.Status = conversation.NarratorStatusReady
	store.state.Degradation = nil
}

func (store *failureTestStore) snapshot() conversation.NarratorState {
	store.mu.Lock()
	defer store.mu.Unlock()
	return cloneFailureTestState(store.state)
}

func cloneFailureTestState(state conversation.NarratorState) conversation.NarratorState {
	cloned := state
	cloned.LastInvocationAt = cloneOptionalString(state.LastInvocationAt)
	if state.Degradation != nil {
		degradation := *state.Degradation
		cloned.Degradation = &degradation
	}
	return cloned
}

func stringPointerForFailureTest(value string) *string {
	return &value
}

func newFailureTestHandler(
	t *testing.T,
	store NarratorFailureStore,
	policy RetryPolicy,
) *FailureHandler {
	t.Helper()
	var mu sync.Mutex
	nextID := 0
	handler, err := NewFailureHandler(
		store,
		WithFailureRetryPolicy(policy),
		WithFailureHandlerClock(func() time.Time {
			return time.Date(2026, 7, 11, 20, 1, 0, 0, time.UTC)
		}),
		WithFailureHandlerIDGenerator(func(prefix string) (string, error) {
			mu.Lock()
			defer mu.Unlock()
			nextID++
			return fmt.Sprintf("%s-%d", prefix, nextID), nil
		}),
	)
	if err != nil {
		t.Fatalf("NewFailureHandler: %v", err)
	}
	return handler
}

func newFailureTestWorker(
	t *testing.T,
	attempts AttemptWorker,
	handler *FailureHandler,
) *ResilientWorker {
	t.Helper()
	worker, err := NewResilientWorker(attempts, handler)
	if err != nil {
		t.Fatalf("NewResilientWorker: %v", err)
	}
	return worker
}

type controlledRetryWait struct {
	started chan time.Duration
	release chan struct{}
}

func newControlledRetryWait() *controlledRetryWait {
	return &controlledRetryWait{
		started: make(chan time.Duration, 1),
		release: make(chan struct{}),
	}
}

func (waiter *controlledRetryWait) Wait(ctx context.Context, delay time.Duration) error {
	select {
	case waiter.started <- delay:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-waiter.release:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func waitRetryDelay(t *testing.T, delays <-chan time.Duration, want time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), failureTestTimeout)
	defer cancel()
	select {
	case delay := <-delays:
		if delay != want {
			t.Fatalf("retry delay = %s, want %s", delay, want)
		}
	case <-ctx.Done():
		t.Fatalf("wait for retry delay: %v", ctx.Err())
	}
}

func assertFailureStoreDegraded(t *testing.T, store *failureTestStore) {
	t.Helper()
	state := store.snapshot()
	if state.Status != conversation.NarratorStatusDegraded || state.Degradation == nil {
		t.Fatalf("failure store state = %+v, want degraded", state)
	}
	if state.ObservedThroughSequence != 8 || state.CheckpointThroughSequence != 4 ||
		state.CheckpointText != "The last valid historical checkpoint." ||
		state.CurrentFocus != "The last valid narrator focus." ||
		state.CurrentFocusRevision != 2 ||
		state.TopicDescriptor != "Typed narrator failure recovery" {
		t.Fatalf("degradation changed last valid projection: %+v", state)
	}
}
