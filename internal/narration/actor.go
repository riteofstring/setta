package narration

import (
	"context"
	"errors"
	"fmt"
	"sync"

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

// Worker prepares one commit without mutating durable narrator state. Prepare
// must honor cancellation, although generation invalidation also prevents a
// late checkpoint response from committing when a provider returns after it
// was cancelled.
type Worker interface {
	Prepare(context.Context, Invocation) (PreparedCommit, error)
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
	commit     PreparedCommit
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
	rootCtx        context.Context
	rootCancel     context.CancelFunc
	submissions    chan submission
	stop           chan struct{}
	loopDone       chan struct{}
	done           chan struct{}
	stopOnce       sync.Once
	workers        sync.WaitGroup
}

func newConversationActor(conversationID string, worker Worker) *conversationActor {
	rootCtx, rootCancel := context.WithCancel(context.Background())
	actor := &conversationActor{
		conversationID: conversationID,
		worker:         worker,
		rootCtx:        rootCtx,
		rootCancel:     rootCancel,
		submissions:    make(chan submission),
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
		case prepared := <-result:
			if actor.stopping() {
				state.stop()
				return
			}
			state.drainSubmissions(actor)
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
	priority := requestPriority(command.queued.request)
	state.queues[priority] = append(state.queues[priority], command.queued)
	close(command.ack)
	if state.active != nil &&
		state.active.queued.request.Kind == RequestKindCheckpoint &&
		priority < priorityCheckpoint {
		state.supersedeCheckpoint()
	}
	state.startNext(actor)
}

func (state *actorState) drainSubmissions(actor *conversationActor) {
	for {
		if actor.stopping() {
			return
		}
		select {
		case <-actor.stop:
			return
		case command := <-actor.submissions:
			state.accept(actor, command)
		default:
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

func (state *actorState) supersedeCheckpoint() {
	active := state.active
	active.cancel()
	active.queued.receipt.complete(fmt.Errorf(
		"narrator request %s: %w",
		active.queued.request.ID,
		ErrCheckpointSuperseded,
	))
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
		commit, err := actor.worker.Prepare(invocationCtx, Invocation{
			Request:    queued.request,
			Generation: generation,
		})
		result <- invocationResult{generation: generation, commit: commit, err: err}
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
		active.queued.receipt.complete(fmt.Errorf(
			"prepare narrator request %s: %w",
			active.queued.request.ID,
			result.err,
		))
		return
	}
	if result.commit == nil {
		active.queued.receipt.complete(fmt.Errorf(
			"prepare narrator request %s: worker returned no commit",
			active.queued.request.ID,
		))
		return
	}
	if err := result.commit(actor.rootCtx); err != nil {
		active.queued.receipt.complete(fmt.Errorf(
			"commit narrator request %s: %w",
			active.queued.request.ID,
			err,
		))
		return
	}
	active.queued.receipt.complete(nil)
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
	case RequestKindRetry:
		return priorityRetry
	case RequestKindCheckpoint:
		return priorityCheckpoint
	default:
		panic(fmt.Sprintf("validated narrator request has unsupported kind %q", request.Kind))
	}
}
