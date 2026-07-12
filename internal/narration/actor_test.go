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

const narratorActorTestTimeout = 5 * time.Second

type workerFunc func(context.Context, Invocation) (PreparedWork, error)

func (worker workerFunc) Prepare(ctx context.Context, invocation Invocation) (PreparedWork, error) {
	return worker(ctx, invocation)
}

func TestRegistryPrioritizesOneConversationMailbox(t *testing.T) {
	blockerStarted := make(chan struct{})
	releaseBlocker := make(chan struct{})
	var mu sync.Mutex
	var committed []string
	activePreparations := 0
	maxPreparations := 0
	worker := workerFunc(func(ctx context.Context, invocation Invocation) (PreparedWork, error) {
		mu.Lock()
		activePreparations++
		if activePreparations > maxPreparations {
			maxPreparations = activePreparations
		}
		mu.Unlock()
		if invocation.Request.ID == "blocker" {
			close(blockerStarted)
			select {
			case <-releaseBlocker:
			case <-ctx.Done():
				return PreparedWork{}, ctx.Err()
			}
		}
		mu.Lock()
		activePreparations--
		mu.Unlock()
		return successfulPreparedWork(func(context.Context) error {
			mu.Lock()
			committed = append(committed, invocation.Request.ID)
			mu.Unlock()
			return nil
		}), nil
	})
	registry := newTestRegistry(t, worker)
	blocker := submitTestRequest(t, registry, projectionRequest(
		"blocker",
		"conversation-priority",
		conversation.NarrationTriggerPlanChanged,
	))
	waitSignal(t, blockerStarted, "blocking projection start")

	receipts := []*Receipt{
		submitTestRequest(t, registry, checkpointRequest("checkpoint", "conversation-priority")),
		submitTestRequest(t, registry, checkpointRetryRequest("checkpoint-retry", "conversation-priority")),
		submitTestRequest(t, registry, retryRequest("retry", "conversation-priority")),
		submitTestRequest(t, registry, projectionRequest(
			"automatic",
			"conversation-priority",
			conversation.NarrationTriggerPhaseActivityCompleted,
		)),
		submitTestRequest(t, registry, statusRequest("status", "conversation-priority")),
		submitTestRequest(t, registry, projectionRequest(
			"terminal",
			"conversation-priority",
			conversation.NarrationTriggerTurnTerminal,
		)),
		submitTestRequest(t, registry, projectionRequest(
			"approval",
			"conversation-priority",
			conversation.NarrationTriggerApprovalRequired,
		)),
	}
	close(releaseBlocker)
	waitReceipt(t, blocker)
	for _, receipt := range receipts {
		waitReceipt(t, receipt)
	}
	shutdownTestRegistry(t, registry)

	mu.Lock()
	defer mu.Unlock()
	want := []string{
		"blocker",
		"terminal",
		"approval",
		"status",
		"automatic",
		"retry",
		"checkpoint",
		"checkpoint-retry",
	}
	if !reflect.DeepEqual(committed, want) {
		t.Fatalf("committed order = %v, want %v", committed, want)
	}
	if maxPreparations != 1 {
		t.Fatalf("maximum concurrent preparations = %d, want 1", maxPreparations)
	}
}

func TestRegistryRunsDifferentConversationActorsConcurrently(t *testing.T) {
	started := make(chan string, 3)
	releaseFirst := make(chan struct{})
	worker := workerFunc(func(ctx context.Context, invocation Invocation) (PreparedWork, error) {
		started <- invocation.Request.ID
		if invocation.Request.ID == "conversation-a-first" {
			select {
			case <-releaseFirst:
			case <-ctx.Done():
				return PreparedWork{}, ctx.Err()
			}
		}
		return successfulPreparedWork(func(context.Context) error { return nil }), nil
	})
	registry := newTestRegistry(t, worker)
	first := submitTestRequest(t, registry, projectionRequest(
		"conversation-a-first",
		"conversation-a",
		conversation.NarrationTriggerPlanChanged,
	))
	if got := waitValue(t, started, "first conversation start"); got != "conversation-a-first" {
		t.Fatalf("first started request = %s", got)
	}
	second := submitTestRequest(t, registry, projectionRequest(
		"conversation-a-second",
		"conversation-a",
		conversation.NarrationTriggerPhaseActivityCompleted,
	))
	other := submitTestRequest(t, registry, projectionRequest(
		"conversation-b-first",
		"conversation-b",
		conversation.NarrationTriggerPlanChanged,
	))
	if got := waitValue(t, started, "other conversation start"); got != "conversation-b-first" {
		t.Fatalf("concurrent started request = %s, want conversation-b-first", got)
	}
	select {
	case unexpected := <-started:
		t.Fatalf("same-conversation request started before its predecessor: %s", unexpected)
	default:
	}
	close(releaseFirst)
	if got := waitValue(t, started, "second request start"); got != "conversation-a-second" {
		t.Fatalf("second started request = %s", got)
	}
	for _, receipt := range []*Receipt{first, second, other} {
		waitReceipt(t, receipt)
	}
	shutdownTestRegistry(t, registry)
}

func TestCheckpointRetryIsCancelledAndItsLateResponseCannotCommit(t *testing.T) {
	checkpointStarted := make(chan struct{})
	checkpointCancelled := make(chan struct{})
	releaseLateResponse := make(chan struct{})
	checkpointReturned := make(chan struct{})
	var mu sync.Mutex
	var committed []string
	var invocations []Invocation
	completions := make(chan Completion, 4)
	worker := workerFunc(func(ctx context.Context, invocation Invocation) (PreparedWork, error) {
		mu.Lock()
		invocations = append(invocations, invocation)
		mu.Unlock()
		if invocation.Request.Kind == RequestKindCheckpoint {
			close(checkpointStarted)
			<-ctx.Done()
			close(checkpointCancelled)
			<-releaseLateResponse
			close(checkpointReturned)
		}
		return successfulPreparedWork(func(context.Context) error {
			mu.Lock()
			committed = append(committed, invocation.Request.ID)
			mu.Unlock()
			return nil
		}), nil
	})
	registry, err := NewRegistry(worker, WithCompletionObserver(func(completion Completion) {
		completions <- completion
	}))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	checkpoint := submitTestRequest(t, registry, checkpointRetryRequest("checkpoint", "conversation-stale"))
	waitSignal(t, checkpointStarted, "checkpoint start")
	status := submitTestRequest(t, registry, statusRequest("status", "conversation-stale"))
	waitSignal(t, checkpointCancelled, "checkpoint cancellation")
	waitReceipt(t, status)
	if err := waitReceiptError(t, checkpoint); !errors.Is(err, ErrCheckpointSuperseded) {
		t.Fatalf("checkpoint receipt error = %v, want ErrCheckpointSuperseded", err)
	}
	superseded := waitCompletionMatching(t, completions, "superseded checkpoint", func(completion Completion) bool {
		return completion.Request.ID == checkpointRequest("checkpoint", "conversation-stale").ID &&
			errors.Is(completion.Err, ErrCheckpointSuperseded) && !completion.Stale
	})
	if superseded.Generation != 1 || superseded.StartedAt == "" || superseded.EndedAt == "" {
		t.Fatalf("superseded checkpoint completion = %+v", superseded)
	}

	mu.Lock()
	if !reflect.DeepEqual(committed, []string{"status"}) {
		t.Fatalf("committed before late checkpoint response = %v, want [status]", committed)
	}
	if len(invocations) != 2 || invocations[0].Generation != 1 || invocations[1].Generation != 2 {
		t.Fatalf("invocation generations = %#v, want checkpoint 1 then status 2", invocations)
	}
	mu.Unlock()
	close(releaseLateResponse)
	waitSignal(t, checkpointReturned, "late checkpoint response")
	stale := waitCompletionMatching(t, completions, "stale checkpoint response", func(completion Completion) bool {
		return completion.Request.ID == "checkpoint" && completion.Stale
	})
	if stale.Generation != 1 || stale.StartedAt == "" || stale.EndedAt == "" {
		t.Fatalf("stale checkpoint completion = %+v", stale)
	}
	shutdownTestRegistry(t, registry)
	mu.Lock()
	defer mu.Unlock()
	if !reflect.DeepEqual(committed, []string{"status"}) {
		t.Fatalf("committed after late checkpoint response = %v, want [status]", committed)
	}
}

func TestReadyRetrySupersedesCompletedCheckpointBeforeCommit(t *testing.T) {
	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()
	var mu sync.Mutex
	var committed []string
	worker := workerFunc(func(_ context.Context, invocation Invocation) (PreparedWork, error) {
		return successfulPreparedWork(func(context.Context) error {
			mu.Lock()
			committed = append(committed, invocation.Request.ID)
			mu.Unlock()
			return nil
		}), nil
	})
	actor := &conversationActor{
		conversationID: "conversation-ready-retry",
		worker:         worker,
		rootCtx:        rootCtx,
		submissions:    make(chan submission, 1),
		retries:        make(chan queuedRequest, 1),
		results:        make(chan invocationResult, 1),
		stop:           make(chan struct{}),
	}
	checkpointReceipt := newReceipt()
	checkpointCancelled := false
	state := actorState{
		active: &activeInvocation{
			queued: queuedRequest{
				request: checkpointRequest("checkpoint", actor.conversationID),
				receipt: checkpointReceipt,
			},
			generation: 1,
			cancel: func() {
				checkpointCancelled = true
			},
		},
		nextGeneration: 1,
	}
	retryReceipt := newReceipt()
	actor.retries <- queuedRequest{
		request: retryRequest("ready-retry", actor.conversationID),
		receipt: retryReceipt,
	}

	state.drainReadyWork(actor)
	if !checkpointCancelled {
		t.Fatal("ready retry did not cancel the completed checkpoint generation")
	}
	if err := waitReceiptError(t, checkpointReceipt); !errors.Is(err, ErrCheckpointSuperseded) {
		t.Fatalf("checkpoint receipt error = %v, want ErrCheckpointSuperseded", err)
	}
	if state.active == nil || state.active.queued.request.ID != "ready-retry" ||
		state.active.generation != 2 {
		t.Fatalf("active invocation after drain = %+v, want retry generation 2", state.active)
	}

	state.finish(actor, invocationResult{
		generation: 1,
		work: successfulPreparedWork(func(context.Context) error {
			mu.Lock()
			committed = append(committed, "stale-checkpoint")
			mu.Unlock()
			return nil
		}),
	})
	retryResult := <-actor.results
	state.finish(actor, retryResult)
	actor.workers.Wait()
	waitReceipt(t, retryReceipt)

	mu.Lock()
	defer mu.Unlock()
	if !reflect.DeepEqual(committed, []string{"ready-retry"}) {
		t.Fatalf("committed work = %v, want only ready retry", committed)
	}
}

func TestRegistryShutdownCancelsActiveAndRejectsPendingWork(t *testing.T) {
	activeStarted := make(chan struct{})
	cancellationObserved := make(chan struct{})
	completions := make(chan Completion, 1)
	worker := workerFunc(func(ctx context.Context, invocation Invocation) (PreparedWork, error) {
		if invocation.Request.ID != "active" {
			return PreparedWork{}, fmt.Errorf("unexpected preparation for %s", invocation.Request.ID)
		}
		if invocation.observeCall == nil {
			return PreparedWork{}, errors.New("missing narrator call observer")
		}
		invocation.observeCall(
			CallRequest{ID: invocation.Request.ID, Generation: invocation.Generation},
			CallResult{
				RequestID:      invocation.Request.ID,
				Generation:     invocation.Generation,
				ConversationID: invocation.Request.ConversationID,
				InputBytes:     64,
				InputTokens:    17,
				StartedAt:      invocation.StartedAt,
			},
		)
		close(activeStarted)
		<-ctx.Done()
		close(cancellationObserved)
		return PreparedWork{}, ctx.Err()
	})
	registry, err := NewRegistry(worker, WithCompletionObserver(func(completion Completion) {
		completions <- completion
	}))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	active := submitTestRequest(t, registry, projectionRequest(
		"active",
		"conversation-shutdown",
		conversation.NarrationTriggerPlanChanged,
	))
	waitSignal(t, activeStarted, "active request start")
	pending := submitTestRequest(t, registry, projectionRequest(
		"pending",
		"conversation-shutdown",
		conversation.NarrationTriggerPhaseActivityCompleted,
	))
	shutdownTestRegistry(t, registry)
	waitSignal(t, cancellationObserved, "active request cancellation")
	for label, receipt := range map[string]*Receipt{"active": active, "pending": pending} {
		if err := waitReceiptError(t, receipt); !errors.Is(err, ErrMailboxClosed) {
			t.Fatalf("%s receipt error = %v, want ErrMailboxClosed", label, err)
		}
	}
	cancelled := waitCompletionMatching(t, completions, "cancelled active request", func(completion Completion) bool {
		return completion.Request.ID == "active" && errors.Is(completion.Err, ErrMailboxClosed)
	})
	if cancelled.Generation != 1 || cancelled.Stale || cancelled.StartedAt == "" || cancelled.EndedAt == "" {
		t.Fatalf("cancelled active completion = %+v", cancelled)
	}
	if cancelled.ProviderRequest == nil || cancelled.ProviderResult == nil ||
		cancelled.ProviderResult.InputTokens != 17 {
		t.Fatalf("cancelled active provider observation = %+v", cancelled)
	}
	_, err = registry.Submit(context.Background(), statusRequest("after-close", "conversation-shutdown"))
	if !errors.Is(err, ErrMailboxClosed) {
		t.Fatalf("submit after shutdown error = %v, want ErrMailboxClosed", err)
	}
}

func TestRegistryDoesNotScheduleRetryWhenFailureCommitDoesNotCommit(t *testing.T) {
	sentinel := errors.New("degradation store unavailable")
	retryStarted := make(chan time.Duration, 1)
	worker := workerFunc(func(context.Context, Invocation) (PreparedWork, error) {
		return PreparedWork{
			Commit:          func(context.Context) error { return sentinel },
			CompletionError: errors.New("narrator degraded"),
			Retry: &RetryDirective{
				Request: retryRequest("retry-after-commit", "conversation-commit-failure"),
				After:   time.Second,
			},
		}, nil
	})
	registry, err := NewRegistry(worker, WithRetryWait(func(context.Context, time.Duration) error {
		retryStarted <- time.Second
		return nil
	}))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	receipt := submitTestRequest(t, registry, projectionRequest(
		"initial",
		"conversation-commit-failure",
		conversation.NarrationTriggerPhaseActivityCompleted,
	))
	if err := waitReceiptError(t, receipt); !errors.Is(err, sentinel) {
		t.Fatalf("failure commit receipt error = %v, want sentinel", err)
	}
	select {
	case <-retryStarted:
		t.Fatal("retry started before its degradation commit succeeded")
	default:
	}
	shutdownTestRegistry(t, registry)
}

func TestRegistryShutdownCancelsPendingRetryTimer(t *testing.T) {
	retryStarted := make(chan struct{})
	retryCancelled := make(chan struct{})
	worker := workerFunc(func(_ context.Context, invocation Invocation) (PreparedWork, error) {
		retry := retryRequest("retry-after-shutdown", invocation.Request.ConversationID)
		retry.Trigger = invocation.Request.Trigger
		return PreparedWork{
			Commit:          func(context.Context) error { return nil },
			CompletionError: errors.New("narrator degraded"),
			Retry:           &RetryDirective{Request: retry, After: time.Minute},
		}, nil
	})
	registry, err := NewRegistry(worker, WithRetryWait(func(ctx context.Context, _ time.Duration) error {
		close(retryStarted)
		<-ctx.Done()
		close(retryCancelled)
		return ctx.Err()
	}))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	receipt := submitTestRequest(t, registry, projectionRequest(
		"initial",
		"conversation-retry-shutdown",
		conversation.NarrationTriggerPhaseActivityCompleted,
	))
	if err := waitReceiptError(t, receipt); err == nil {
		t.Fatal("degraded receipt error = nil")
	}
	waitSignal(t, retryStarted, "pending retry timer")
	shutdownTestRegistry(t, registry)
	waitSignal(t, retryCancelled, "pending retry cancellation")
}

func TestPreparedWorkRejectsMalformedRetryDirective(t *testing.T) {
	request := projectionRequest("initial", "conversation", conversation.NarrationTriggerPlanChanged)
	validRetry := retryRequest("retry", request.ConversationID)
	validRetry.Trigger = request.Trigger
	tests := []struct {
		name string
		work PreparedWork
	}{
		{name: "missing commit", work: PreparedWork{}},
		{
			name: "retry without failure",
			work: PreparedWork{
				Commit: func(context.Context) error { return nil },
				Retry:  &RetryDirective{Request: validRetry, After: time.Second},
			},
		},
		{
			name: "zero delay",
			work: PreparedWork{
				Commit:          func(context.Context) error { return nil },
				CompletionError: errors.New("degraded"),
				Retry:           &RetryDirective{Request: validRetry},
			},
		},
		{
			name: "same identity",
			work: PreparedWork{
				Commit:          func(context.Context) error { return nil },
				CompletionError: errors.New("degraded"),
				Retry: &RetryDirective{
					Request: Request{
						ID:               request.ID,
						ConversationID:   request.ConversationID,
						Kind:             request.Kind,
						Trigger:          request.Trigger,
						RecoverableRetry: true,
						RetryAttempt:     1,
					},
					After: time.Second,
				},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validatePreparedWork(request, test.work); err == nil {
				t.Fatal("validatePreparedWork() error = nil")
			}
		})
	}
}

func TestPreparedRetryPreservesExactStatusOperation(t *testing.T) {
	request := statusRequest("status", "conversation")
	retry := cloneRequest(request)
	retry.ID = "status-retry"
	retry.RecoverableRetry = true
	retry.RetryAttempt = 1

	if err := validatePreparedRetry(
		request,
		errors.New("degraded"),
		RetryDirective{Request: retry, After: time.Second},
	); err != nil {
		t.Fatalf("validate exact status retry: %v", err)
	}

	for _, mutate := range []func(*StatusOperation){
		func(operation *StatusOperation) { operation.WorkspaceID = "workspace-changed" },
		func(operation *StatusOperation) { operation.Question = "What changed?" },
	} {
		changed := cloneRequest(retry)
		mutate(changed.Status)
		if err := validatePreparedRetry(
			request,
			errors.New("degraded"),
			RetryDirective{Request: changed, After: time.Second},
		); err == nil {
			t.Fatal("validatePreparedRetry accepted a changed status operation")
		}
	}
}

func TestRequestValidationRejectsMismatchedKindsAndTriggers(t *testing.T) {
	tests := []struct {
		name    string
		request Request
	}{
		{name: "missing id", request: projectionRequest("", "conversation", conversation.NarrationTriggerPlanChanged)},
		{name: "spaced conversation", request: statusRequest("status", " conversation")},
		{
			name: "status trigger on projection",
			request: projectionRequest(
				"projection",
				"conversation",
				conversation.NarrationTriggerExplicitStatusRequested,
			),
		},
		{
			name: "automatic trigger on status",
			request: Request{
				ID:             "status",
				ConversationID: "conversation",
				Kind:           RequestKindStatus,
				Trigger:        conversation.NarrationTriggerPlanChanged,
				Status: &StatusOperation{
					WorkspaceID: "workspace",
					Question:    "What is happening?",
				},
			},
		},
		{
			name: "automatic trigger on checkpoint",
			request: Request{
				ID:             "checkpoint",
				ConversationID: "conversation",
				Kind:           RequestKindCheckpoint,
				Trigger:        conversation.NarrationTriggerPlanChanged,
			},
		},
		{
			name: "unknown retry trigger",
			request: Request{
				ID:               "retry",
				ConversationID:   "conversation",
				Kind:             RequestKindProjection,
				Trigger:          conversation.NarrationTrigger("unknown"),
				RecoverableRetry: true,
			},
		},
		{
			name: "retry flag without attempt",
			request: Request{
				ID:               "retry",
				ConversationID:   "conversation",
				Kind:             RequestKindProjection,
				Trigger:          conversation.NarrationTriggerPlanChanged,
				RecoverableRetry: true,
			},
		},
		{
			name: "retry attempt without flag",
			request: Request{
				ID:             "retry",
				ConversationID: "conversation",
				Kind:           RequestKindProjection,
				Trigger:        conversation.NarrationTriggerPlanChanged,
				RetryAttempt:   1,
			},
		},
		{
			name: "unknown kind",
			request: Request{
				ID:             "unknown",
				ConversationID: "conversation",
				Kind:           RequestKind("unknown"),
				Trigger:        conversation.NarrationTriggerPlanChanged,
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.request.Validate(); err == nil {
				t.Fatal("Validate() error = nil")
			}
		})
	}
	for _, request := range []Request{
		projectionRequest("projection", "conversation", conversation.NarrationTriggerPlanChanged),
		statusRequest("status", "conversation"),
		retryRequest("retry", "conversation"),
		checkpointRequest("checkpoint", "conversation"),
		checkpointRetryRequest("checkpoint-retry", "conversation"),
	} {
		if err := request.Validate(); err != nil {
			t.Errorf("Validate(%s): %v", request.ID, err)
		}
	}
}

func TestRegistryFreezesStatusOperationAtAdmission(t *testing.T) {
	release := make(chan struct{})
	observed := make(chan StatusOperation, 1)
	worker := workerFunc(func(ctx context.Context, invocation Invocation) (PreparedWork, error) {
		select {
		case <-release:
		case <-ctx.Done():
			return PreparedWork{}, ctx.Err()
		}
		observed <- *invocation.Request.Status
		return successfulPreparedWork(func(context.Context) error { return nil }), nil
	})
	registry := newTestRegistry(t, worker)
	request := statusRequest("status-frozen", "conversation-frozen")
	receipt := submitTestRequest(t, registry, request)
	request.Status.WorkspaceID = "workspace-mutated"
	request.Status.Question = "Mutated question"
	close(release)
	waitReceipt(t, receipt)
	shutdownTestRegistry(t, registry)

	operation := <-observed
	if operation.WorkspaceID != "workspace-status" || operation.Question != "What is happening?" {
		t.Fatalf("admitted status operation changed through caller mutation: %+v", operation)
	}
}

func TestCheckpointResumeOperationRequiresMatchingTargetTurn(t *testing.T) {
	projection := ProjectionOperation{
		WorkspaceID:     "workspace-checkpoint",
		TurnID:          "turn-projection",
		ThroughSequence: 3,
	}
	operation := CheckpointOperation{
		WorkspaceID:      projection.WorkspaceID,
		ResumeProjection: &projection,
		ResumeTrigger:    conversation.NarrationTriggerTurnTerminal,
	}
	if err := operation.Validate(); err == nil {
		t.Fatal("checkpoint resume without target turn error = nil")
	}
	mismatched := "turn-other"
	operation.TurnID = &mismatched
	if err := operation.Validate(); err == nil {
		t.Fatal("checkpoint resume with mismatched target turn error = nil")
	}
	matching := projection.TurnID
	operation.TurnID = &matching
	if err := operation.Validate(); err != nil {
		t.Fatalf("matching checkpoint resume: %v", err)
	}
}

func newTestRegistry(t *testing.T, worker Worker) *Registry {
	t.Helper()
	registry, err := NewRegistry(worker)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	return registry
}

func submitTestRequest(t *testing.T, registry *Registry, request Request) *Receipt {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), narratorActorTestTimeout)
	defer cancel()
	receipt, err := registry.Submit(ctx, request)
	if err != nil {
		t.Fatalf("submit %s: %v", request.ID, err)
	}
	return receipt
}

func shutdownTestRegistry(t *testing.T, registry *Registry) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), narratorActorTestTimeout)
	defer cancel()
	if err := registry.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown registry: %v", err)
	}
}

func waitReceipt(t *testing.T, receipt *Receipt) {
	t.Helper()
	if err := waitReceiptError(t, receipt); err != nil {
		t.Fatalf("wait receipt: %v", err)
	}
}

func waitReceiptError(t *testing.T, receipt *Receipt) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), narratorActorTestTimeout)
	defer cancel()
	return receipt.Wait(ctx)
}

func waitSignal(t *testing.T, signal <-chan struct{}, label string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), narratorActorTestTimeout)
	defer cancel()
	select {
	case <-signal:
	case <-ctx.Done():
		t.Fatalf("wait for %s: %v", label, ctx.Err())
	}
}

func waitValue(t *testing.T, values <-chan string, label string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), narratorActorTestTimeout)
	defer cancel()
	select {
	case value := <-values:
		return value
	case <-ctx.Done():
		t.Fatalf("wait for %s: %v", label, ctx.Err())
		return ""
	}
}

func waitCompletionMatching(
	t *testing.T,
	completions <-chan Completion,
	label string,
	matches func(Completion) bool,
) Completion {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), narratorActorTestTimeout)
	defer cancel()
	for {
		select {
		case completion := <-completions:
			if matches(completion) {
				return completion
			}
		case <-ctx.Done():
			t.Fatalf("wait for %s: %v", label, ctx.Err())
			return Completion{}
		}
	}
}

func successfulPreparedWork(commit PreparedCommit) PreparedWork {
	return PreparedWork{Commit: commit}
}

func projectionRequest(
	id string,
	conversationID string,
	trigger conversation.NarrationTrigger,
) Request {
	return Request{
		ID:             id,
		ConversationID: conversationID,
		Kind:           RequestKindProjection,
		Trigger:        trigger,
		Projection: &ProjectionOperation{
			WorkspaceID:     "workspace-projection",
			TurnID:          "turn-projection",
			ThroughSequence: 1,
		},
	}
}

func statusRequest(id string, conversationID string) Request {
	return Request{
		ID:             id,
		ConversationID: conversationID,
		Kind:           RequestKindStatus,
		Trigger:        conversation.NarrationTriggerExplicitStatusRequested,
		Status: &StatusOperation{
			WorkspaceID: "workspace-status",
			Question:    "What is happening?",
		},
	}
}

func retryRequest(id string, conversationID string) Request {
	return Request{
		ID:             id,
		ConversationID: conversationID,
		Kind:           RequestKindProjection,
		Trigger:        conversation.NarrationTriggerPhaseActivityCompleted,
		Projection: &ProjectionOperation{
			WorkspaceID:     "workspace-projection",
			TurnID:          "turn-projection",
			ThroughSequence: 1,
		},
		RecoverableRetry: true,
		RetryAttempt:     1,
	}
}

func checkpointRequest(id string, conversationID string) Request {
	return Request{
		ID:             id,
		ConversationID: conversationID,
		Kind:           RequestKindCheckpoint,
		Trigger:        conversation.NarrationTriggerCheckpointWindowExceeded,
		Checkpoint: &CheckpointOperation{
			WorkspaceID: "workspace-checkpoint",
		},
	}
}

func checkpointRetryRequest(id string, conversationID string) Request {
	request := checkpointRequest(id, conversationID)
	request.RecoverableRetry = true
	request.RetryAttempt = 1
	return request
}
