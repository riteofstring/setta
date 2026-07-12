package narration

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"setta/internal/conversation"
)

var (
	ErrMailboxClosed        = errors.New("narrator mailbox is closed")
	ErrCheckpointSuperseded = errors.New("narrator checkpoint request was superseded")
)

// PreparedCommit is returned only after external narrator work and output
// validation finish. The actor invokes it while the request generation remains
// commit-eligible, keeping durable narrator state changes serialized. A commit
// must contain only bounded persistence work and must not call back into the
// registry.
type PreparedCommit func(context.Context) error

// RetryDirective asks the actor to enqueue the same typed operation after a
// recoverable failure commit succeeds. Waiting is push-based and cancellable;
// it never holds the conversation actor or SQLite writer.
type RetryDirective struct {
	Request Request
	After   time.Duration
}

// PreparedWork contains exactly one bounded durable commit. A successful
// provider attempt has no CompletionError or Retry. A handled narrator failure
// commits its typed degradation first, then completes the original receipt
// with CompletionError and optionally schedules Retry.
type PreparedWork struct {
	Commit          PreparedCommit
	CompletionError error
	Retry           *RetryDirective
}

// Worker prepares one bounded result without mutating durable narrator state.
// Prepare must honor cancellation, although generation invalidation also
// prevents a late checkpoint response from committing when a provider returns
// after it was cancelled.
type Worker interface {
	Prepare(context.Context, Invocation) (PreparedWork, error)
}

type Invocation struct {
	Request    Request
	Generation uint64
}

type Receipt struct {
	done chan struct{}
	once sync.Once
	mu   sync.Mutex
	err  error
}

func newReceipt() *Receipt {
	return &Receipt{done: make(chan struct{})}
}

func (receipt *Receipt) Wait(ctx context.Context) error {
	if ctx == nil {
		return errors.New("narrator receipt wait context is required")
	}
	select {
	case <-receipt.done:
		receipt.mu.Lock()
		defer receipt.mu.Unlock()
		return receipt.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (receipt *Receipt) complete(err error) {
	receipt.once.Do(func() {
		receipt.mu.Lock()
		receipt.err = err
		receipt.mu.Unlock()
		close(receipt.done)
	})
}

type mailboxPriority int

const (
	priorityUrgent mailboxPriority = iota
	priorityStatus
	priorityAutomatic
	priorityRetry
	priorityCheckpoint
	mailboxPriorityCount
)

type queuedRequest struct {
	request Request
	receipt *Receipt
}

type submission struct {
	queued queuedRequest
	ack    chan struct{}
}

type invocationResult struct {
	generation uint64
	work       PreparedWork
	err        error
}

type activeInvocation struct {
	queued     queuedRequest
	generation uint64
	cancel     context.CancelFunc
	result     <-chan invocationResult
}

type conversationActor struct {
	conversationID string
	worker         Worker
	retryWait      RetryWait
	observer       CompletionObserver
	rootCtx        context.Context
	rootCancel     context.CancelFunc
	submissions    chan submission
	retries        chan queuedRequest
	stop           chan struct{}
	loopDone       chan struct{}
	done           chan struct{}
	stopOnce       sync.Once
	workers        sync.WaitGroup
}

func newConversationActor(
	conversationID string,
	worker Worker,
	retryWait RetryWait,
	observer CompletionObserver,
) *conversationActor {
	rootCtx, rootCancel := context.WithCancel(context.Background())
	actor := &conversationActor{
		conversationID: conversationID,
		worker:         worker,
		retryWait:      retryWait,
		observer:       observer,
		rootCtx:        rootCtx,
		rootCancel:     rootCancel,
		submissions:    make(chan submission),
		retries:        make(chan queuedRequest),
		stop:           make(chan struct{}),
		loopDone:       make(chan struct{}),
		done:           make(chan struct{}),
	}
	go actor.run()
	go func() {
		<-actor.loopDone
		actor.workers.Wait()
		close(actor.done)
	}()
	return actor
}

func (actor *conversationActor) submit(ctx context.Context, request Request) (*Receipt, error) {
	if ctx == nil {
		return nil, errors.New("narrator submit context is required")
	}
	if request.ConversationID != actor.conversationID {
		return nil, fmt.Errorf(
			"narrator request conversation %s does not match mailbox %s",
			request.ConversationID,
			actor.conversationID,
		)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	receipt := newReceipt()
	command := submission{
		queued: queuedRequest{request: request, receipt: receipt},
		ack:    make(chan struct{}),
	}
	select {
	case actor.submissions <- command:
		// Once the unbuffered send succeeds, the actor owns the request and
		// always acknowledges it before selecting another command.
		<-command.ack
		return receipt, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-actor.stop:
		return nil, ErrMailboxClosed
	}
}

func (actor *conversationActor) beginShutdown() {
	actor.stopOnce.Do(func() {
		actor.rootCancel()
		close(actor.stop)
	})
}

func (actor *conversationActor) wait(ctx context.Context) error {
	if ctx == nil {
		return errors.New("narrator shutdown context is required")
	}
	select {
	case <-actor.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (actor *conversationActor) run() {
	defer close(actor.loopDone)
	state := actorState{}
	for {
		if actor.stopping() {
			state.stop()
			return
		}
		state.startNext(actor)
		result := state.activeResult()
		select {
		case <-actor.stop:
			state.stop()
			return
		case command := <-actor.submissions:
			if actor.stopping() {
				rejectSubmission(command, ErrMailboxClosed)
				state.stop()
				return
			}
			state.accept(actor, command)
		case retry := <-actor.retries:
			if actor.stopping() {
				retry.receipt.complete(fmt.Errorf(
					"narrator request %s: %w",
					retry.request.ID,
					ErrMailboxClosed,
				))
				state.stop()
				return
			}
			state.acceptQueued(actor, retry)
		case prepared := <-result:
			if actor.stopping() {
				state.stop()
				return
			}
			state.drainReadyWork(actor)
			state.finish(actor, prepared)
		}
	}
}

func (actor *conversationActor) stopping() bool {
	select {
	case <-actor.stop:
		return true
	default:
		return false
	}
}

type actorState struct {
	queues         [mailboxPriorityCount][]queuedRequest
	active         *activeInvocation
	nextGeneration uint64
}

func (state *actorState) accept(actor *conversationActor, command submission) {
	state.enqueue(actor, command.queued)
	close(command.ack)
	state.drainReadyWork(actor)
}

func (state *actorState) acceptQueued(actor *conversationActor, queued queuedRequest) {
	state.enqueue(actor, queued)
	state.drainReadyWork(actor)
}

func (state *actorState) enqueue(actor *conversationActor, queued queuedRequest) {
	priority := requestPriority(queued.request)
	state.queues[priority] = append(state.queues[priority], queued)
	if state.active != nil &&
		state.active.queued.request.Kind == RequestKindCheckpoint &&
		priority < priorityCheckpoint {
		state.supersedeCheckpoint(actor)
	}
}

// drainReadyWork batches every request that is already ready when an invocation
// result wins the select. This preserves mailbox priority across the external
// submission and delayed-retry channels before a completed checkpoint is
// allowed to commit or a superseding request is started.
func (state *actorState) drainReadyWork(actor *conversationActor) {
	for {
		if actor.stopping() {
			return
		}
		select {
		case <-actor.stop:
			return
		case command := <-actor.submissions:
			state.enqueue(actor, command.queued)
			close(command.ack)
		case retry := <-actor.retries:
			state.enqueue(actor, retry)
		default:
			state.startNext(actor)
			return
		}
	}
}

func rejectSubmission(command submission, reason error) {
	close(command.ack)
	command.queued.receipt.complete(fmt.Errorf(
		"narrator request %s: %w",
		command.queued.request.ID,
		reason,
	))
}

func (state *actorState) supersedeCheckpoint(actor *conversationActor) {
	active := state.active
	active.cancel()
	err := fmt.Errorf(
		"narrator request %s: %w",
		active.queued.request.ID,
		ErrCheckpointSuperseded,
	)
	actor.complete(active.queued, err, false)
	state.active = nil
}

func (state *actorState) startNext(actor *conversationActor) {
	if state.active != nil {
		return
	}
	queued, ok := state.popNext()
	if !ok {
		return
	}
	state.nextGeneration++
	generation := state.nextGeneration
	invocationCtx, cancel := context.WithCancel(actor.rootCtx)
	result := make(chan invocationResult, 1)
	state.active = &activeInvocation{
		queued:     queued,
		generation: generation,
		cancel:     cancel,
		result:     result,
	}
	actor.workers.Add(1)
	go func() {
		defer actor.workers.Done()
		work, err := actor.worker.Prepare(invocationCtx, Invocation{
			Request:    queued.request,
			Generation: generation,
		})
		result <- invocationResult{generation: generation, work: work, err: err}
	}()
}

func (state *actorState) popNext() (queuedRequest, bool) {
	for priority := mailboxPriority(0); priority < mailboxPriorityCount; priority++ {
		queue := state.queues[priority]
		if len(queue) == 0 {
			continue
		}
		next := queue[0]
		state.queues[priority] = queue[1:]
		return next, true
	}
	return queuedRequest{}, false
}

func (state *actorState) activeResult() <-chan invocationResult {
	if state.active == nil {
		return nil
	}
	return state.active.result
}

func (state *actorState) finish(actor *conversationActor, result invocationResult) {
	active := state.active
	if active == nil || active.generation != result.generation {
		return
	}
	active.cancel()
	state.active = nil
	if result.err != nil {
		actor.complete(active.queued, fmt.Errorf(
			"prepare narrator request %s: %w",
			active.queued.request.ID,
			result.err,
		), false)
		return
	}
	if err := validatePreparedWork(active.queued.request, result.work); err != nil {
		actor.complete(active.queued, fmt.Errorf(
			"prepare narrator request %s: %w",
			active.queued.request.ID,
			err,
		), false)
		return
	}
	if err := result.work.Commit(actor.rootCtx); err != nil {
		actor.complete(active.queued, fmt.Errorf(
			"commit narrator request %s: %w",
			active.queued.request.ID,
			err,
		), false)
		return
	}
	if result.work.Retry != nil {
		actor.scheduleRetry(*result.work.Retry)
	}
	actor.complete(active.queued, result.work.CompletionError, result.work.Retry != nil)
}

func (actor *conversationActor) complete(
	queued queuedRequest,
	err error,
	retryScheduled bool,
) {
	queued.receipt.complete(err)
	if actor.observer != nil {
		actor.observer(Completion{
			Request:        cloneRequest(queued.request),
			Err:            err,
			RetryScheduled: retryScheduled,
		})
	}
}

func validatePreparedWork(request Request, work PreparedWork) error {
	if work.Commit == nil {
		return errors.New("worker returned no commit")
	}
	if work.Retry == nil {
		return nil
	}
	return validatePreparedRetry(request, work.CompletionError, *work.Retry)
}

func validatePreparedRetry(
	request Request,
	completionError error,
	retry RetryDirective,
) error {
	if completionError == nil {
		return errors.New("worker returned a retry without a completion error")
	}
	if retry.After <= 0 {
		return errors.New("worker returned a non-positive retry delay")
	}
	if err := retry.Request.Validate(); err != nil {
		return fmt.Errorf("validate retry request: %w", err)
	}
	if err := validateRetryOperation(request, retry.Request); err != nil {
		return err
	}
	return validateRetryIdentity(request, retry.Request)
}

func validateRetryOperation(request Request, retry Request) error {
	if retry.ConversationID != request.ConversationID ||
		retry.Kind != request.Kind || retry.Trigger != request.Trigger {
		return errors.New("worker retry changed the conversation operation")
	}
	if !sameProjectionOperation(request.Projection, retry.Projection) {
		return errors.New("worker retry changed the narrator projection operation")
	}
	if !sameStatusOperation(request.Status, retry.Status) {
		return errors.New("worker retry changed the narrator status operation")
	}
	if !sameCheckpointOperation(request.Checkpoint, retry.Checkpoint) {
		return errors.New("worker retry changed the narrator checkpoint operation")
	}
	return nil
}

func sameProjectionOperation(left *ProjectionOperation, right *ProjectionOperation) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func sameStatusOperation(left *StatusOperation, right *StatusOperation) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func sameCheckpointOperation(left *CheckpointOperation, right *CheckpointOperation) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	if left.WorkspaceID != right.WorkspaceID || left.ResumeTrigger != right.ResumeTrigger ||
		!sameOptionalOperationString(left.TurnID, right.TurnID) {
		return false
	}
	return sameProjectionOperation(left.ResumeProjection, right.ResumeProjection)
}

func sameOptionalOperationString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func validateRetryIdentity(request Request, retry Request) error {
	if retry.ID == request.ID ||
		retry.RetryAttempt != request.RetryAttempt+1 ||
		!retry.RecoverableRetry {
		return errors.New("worker retry has an invalid identity or attempt")
	}
	return nil
}

func (actor *conversationActor) scheduleRetry(directive RetryDirective) {
	retry := queuedRequest{request: directive.Request, receipt: newReceipt()}
	actor.workers.Add(1)
	go func() {
		defer actor.workers.Done()
		if err := actor.retryWait(actor.rootCtx, directive.After); err != nil {
			retry.receipt.complete(fmt.Errorf(
				"wait to retry narrator request %s: %w",
				retry.request.ID,
				err,
			))
			return
		}
		select {
		case actor.retries <- retry:
		case <-actor.rootCtx.Done():
			retry.receipt.complete(fmt.Errorf(
				"narrator request %s: %w",
				retry.request.ID,
				ErrMailboxClosed,
			))
		}
	}()
}

func (state *actorState) stop() {
	if state.active != nil {
		state.active.cancel()
		state.active.queued.receipt.complete(fmt.Errorf(
			"narrator request %s: %w",
			state.active.queued.request.ID,
			ErrMailboxClosed,
		))
		state.active = nil
	}
	for priority := mailboxPriority(0); priority < mailboxPriorityCount; priority++ {
		for _, queued := range state.queues[priority] {
			queued.receipt.complete(fmt.Errorf(
				"narrator request %s: %w",
				queued.request.ID,
				ErrMailboxClosed,
			))
		}
		state.queues[priority] = nil
	}
}

func requestPriority(request Request) mailboxPriority {
	// A retried checkpoint is still low-priority maintenance. Keeping its
	// operation kind intact also ensures higher-priority work can supersede it
	// and later workers can materialize checkpoint context deterministically.
	if request.Kind == RequestKindCheckpoint {
		return priorityCheckpoint
	}
	if request.RecoverableRetry {
		return priorityRetry
	}
	if request.Kind == RequestKindProjection {
		switch request.Trigger {
		case conversation.NarrationTriggerTurnTerminal,
			conversation.NarrationTriggerApprovalRequired:
			return priorityUrgent
		default:
			return priorityAutomatic
		}
	}
	switch request.Kind {
	case RequestKindStatus:
		return priorityStatus
	default:
		panic(fmt.Sprintf("validated narrator request has unsupported kind %q", request.Kind))
	}
}
