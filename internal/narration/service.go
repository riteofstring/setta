package narration

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"setta/internal/conversation"
	"setta/internal/workspace"
)

type WorkspaceResolver interface {
	ResolveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type Config struct {
	Store                    *conversation.Store
	Caller                   ModelCaller
	WorkspaceResolver        WorkspaceResolver
	Now                      func() time.Time
	NewID                    func(string) (string, error)
	ProgressDelay            time.Duration
	CheckpointEventThreshold int
	RecordInvocation         func(InvocationRecord)
}

type InvocationRecord struct {
	ConversationID         string                        `json:"conversationId"`
	TurnID                 *string                       `json:"turnId"`
	CallKind               CallKind                      `json:"callKind"`
	Trigger                conversation.NarrationTrigger `json:"trigger"`
	ContextRange           ContextRange                  `json:"contextRange"`
	CheckpointBefore       int                           `json:"checkpointBefore"`
	ObservedBefore         int                           `json:"observedBefore"`
	PreviousMilestoneCount int                           `json:"previousMilestoneCount"`
	PreviousSummaryCount   int                           `json:"previousSummaryCount"`
	RequestedModel         string                        `json:"requestedModel"`
	ResolvedModel          string                        `json:"resolvedModel"`
	Generation             int64                         `json:"generation"`
	Outcome                string                        `json:"outcome"`
	DiagnosticReference    string                        `json:"diagnosticReference"`
}

type Service struct {
	store             *conversation.Store
	caller            ModelCaller
	contexts          *ContextBuilder
	workspaceResolver WorkspaceResolver
	now               func() time.Time
	newID             func(string) (string, error)
	progressDelay     time.Duration
	checkpointEvents  int
	record            func(InvocationRecord)

	mu     sync.Mutex
	actors map[string]*actor
	closed bool
}

type workKind uint8

const (
	workTerminal workKind = iota
	workApproval
	workStatus
	workAutomatic
	workRetry
	workCheckpoint
)

type actorWork struct {
	kind       workKind
	trigger    conversation.NarrationTrigger
	question   string
	result     chan statusResult
	retryCount int
}

type statusResult struct {
	event conversation.NarrationEvent
	err   error
}

type actor struct {
	service        *Service
	conversationID string
	wake           chan struct{}
	done           chan struct{}
	stop           context.CancelFunc

	mu             sync.Mutex
	queue          []actorWork
	progressTimer  *time.Timer
	inFlightKind   workKind
	inFlightCancel context.CancelFunc
	generation     int64
}

func NewService(config Config) (*Service, error) {
	if config.Store == nil || config.Caller == nil || config.WorkspaceResolver == nil {
		return nil, errors.New("narration store, caller, and workspace resolver are required")
	}
	contexts, err := NewContextBuilder(config.Store)
	if err != nil {
		return nil, err
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	newID := config.NewID
	if newID == nil {
		newID = randomID
	}
	progressDelay := config.ProgressDelay
	if progressDelay <= 0 {
		progressDelay = 2 * time.Second
	}
	checkpointEvents := config.CheckpointEventThreshold
	if checkpointEvents <= 0 {
		checkpointEvents = 128
	}
	record := config.RecordInvocation
	if record == nil {
		record = func(InvocationRecord) {}
	}
	return &Service{
		store: config.Store, caller: config.Caller, contexts: contexts,
		workspaceResolver: config.WorkspaceResolver, now: now, newID: newID,
		progressDelay: progressDelay, checkpointEvents: checkpointEvents,
		record: record, actors: map[string]*actor{},
	}, nil
}

func (service *Service) ObserveTrajectory(_ context.Context, event conversation.TrajectoryEvent) error {
	if err := event.Validate(); err != nil {
		return err
	}
	actor, err := service.actor(event.ConversationID)
	if err != nil {
		return err
	}
	work, immediate := workForTrajectory(event)
	if immediate {
		actor.enqueue(work)
		return nil
	}
	actor.scheduleProgress()
	return nil
}

func (service *Service) RequestStatus(ctx context.Context, conversationID string, question string) (conversation.NarrationEvent, error) {
	if ctx == nil {
		return conversation.NarrationEvent{}, errors.New("narrator status context is required")
	}
	if strings.TrimSpace(question) == "" || strings.TrimSpace(question) != question {
		return conversation.NarrationEvent{}, errors.New("narrator status question must be non-empty and trimmed")
	}
	actor, err := service.actor(conversationID)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	result := make(chan statusResult, 1)
	actor.enqueue(actorWork{kind: workStatus, trigger: conversation.NarrationTriggerExplicitStatusRequested, question: question, result: result})
	select {
	case <-ctx.Done():
		return conversation.NarrationEvent{}, ctx.Err()
	case response := <-result:
		return response.event, response.err
	}
}

func (service *Service) Shutdown(ctx context.Context) error {
	service.mu.Lock()
	if service.closed {
		service.mu.Unlock()
		return nil
	}
	service.closed = true
	actors := make([]*actor, 0, len(service.actors))
	for _, actor := range service.actors {
		actors = append(actors, actor)
	}
	service.mu.Unlock()
	for _, actor := range actors {
		actor.shutdown()
	}
	for _, actor := range actors {
		select {
		case <-actor.done:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

func (service *Service) actor(conversationID string) (*actor, error) {
	if strings.TrimSpace(conversationID) == "" {
		return nil, errors.New("narrator conversation id is required")
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return nil, errors.New("narration service is closed")
	}
	if existing := service.actors[conversationID]; existing != nil {
		return existing, nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	created := &actor{
		service: service, conversationID: conversationID,
		wake: make(chan struct{}, 1), done: make(chan struct{}), stop: cancel,
		inFlightKind: workAutomatic,
	}
	service.actors[conversationID] = created
	go created.run(ctx)
	return created, nil
}

func workForTrajectory(event conversation.TrajectoryEvent) (actorWork, bool) {
	switch event.Kind {
	case conversation.TrajectoryEventTurnCompleted,
		conversation.TrajectoryEventTurnFailed,
		conversation.TrajectoryEventTurnInterrupted:
		return actorWork{kind: workTerminal, trigger: conversation.NarrationTriggerTurnTerminal}, true
	case conversation.TrajectoryEventApprovalRequested:
		return actorWork{kind: workApproval, trigger: conversation.NarrationTriggerApprovalRequired}, true
	case conversation.TrajectoryEventTurnSteered:
		return actorWork{kind: workAutomatic, trigger: conversation.NarrationTriggerUserSteered}, true
	case conversation.TrajectoryEventPlanChanged:
		return actorWork{kind: workAutomatic, trigger: conversation.NarrationTriggerPlanChanged}, true
	case conversation.TrajectoryEventActivityCompleted,
		conversation.TrajectoryEventActivityFailed,
		conversation.TrajectoryEventFileChangeCompleted,
		conversation.TrajectoryEventSubagentCompleted:
		return actorWork{kind: workAutomatic, trigger: conversation.NarrationTriggerPhaseActivityCompleted}, true
	default:
		return actorWork{kind: workAutomatic, trigger: conversation.NarrationTriggerProgressWindowElapsed}, false
	}
}

func (actor *actor) enqueue(work actorWork) {
	actor.mu.Lock()
	if actor.inFlightCancel != nil && actor.inFlightKind == workCheckpoint && work.kind < workCheckpoint {
		actor.generation++
		actor.inFlightCancel()
	}
	actor.queue = append(actor.queue, work)
	actor.mu.Unlock()
	select {
	case actor.wake <- struct{}{}:
	default:
	}
}

func (actor *actor) scheduleProgress() {
	actor.mu.Lock()
	if actor.progressTimer != nil {
		actor.progressTimer.Stop()
	}
	actor.progressTimer = time.AfterFunc(actor.service.progressDelay, func() {
		actor.enqueue(actorWork{kind: workAutomatic, trigger: conversation.NarrationTriggerProgressWindowElapsed})
	})
	actor.mu.Unlock()
}

func (actor *actor) shutdown() {
	actor.mu.Lock()
	if actor.progressTimer != nil {
		actor.progressTimer.Stop()
	}
	if actor.inFlightCancel != nil {
		actor.inFlightCancel()
	}
	actor.stop()
	actor.mu.Unlock()
}

func (actor *actor) run(ctx context.Context) {
	defer close(actor.done)
	for {
		select {
		case <-ctx.Done():
			actor.failPending(ctx.Err())
			return
		case <-actor.wake:
			for {
				work, ok := actor.pop()
				if !ok {
					break
				}
				actor.process(ctx, work)
			}
		}
	}
}

func (actor *actor) pop() (actorWork, bool) {
	actor.mu.Lock()
	defer actor.mu.Unlock()
	if len(actor.queue) == 0 {
		return actorWork{}, false
	}
	selected := 0
	for index := 1; index < len(actor.queue); index++ {
		if actor.queue[index].kind < actor.queue[selected].kind {
			selected = index
		}
	}
	work := actor.queue[selected]
	actor.queue = append(actor.queue[:selected], actor.queue[selected+1:]...)
	return work, true
}

func (actor *actor) process(parent context.Context, work actorWork) {
	ctx, cancel := context.WithCancel(parent)
	actor.mu.Lock()
	actor.generation++
	generation := actor.generation
	actor.inFlightKind = work.kind
	actor.inFlightCancel = cancel
	actor.mu.Unlock()
	var result statusResult
	switch work.kind {
	case workStatus:
		result.event, result.err = actor.handleStatus(ctx, work, generation)
	case workCheckpoint:
		result.err = actor.handleCheckpoint(ctx, generation)
	default:
		result.err = actor.handleProjection(ctx, work, generation)
	}
	cancel()
	actor.mu.Lock()
	actor.inFlightCancel = nil
	actor.mu.Unlock()
	if work.result != nil {
		work.result <- result
	}
}

func (actor *actor) failPending(err error) {
	actor.mu.Lock()
	queue := actor.queue
	actor.queue = nil
	actor.mu.Unlock()
	for _, work := range queue {
		if work.result != nil {
			work.result <- statusResult{err: err}
		}
	}
}

func (actor *actor) generationCurrent(generation int64) bool {
	actor.mu.Lock()
	defer actor.mu.Unlock()
	return actor.generation == generation
}

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}
