package workspacetrajectory

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"setta/internal/chat"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
)

type ChatSource interface {
	LoadRunActivityPage(workspaceID string, runID string, limit int) (chat.RunActivityPage, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
}

type WorkflowSource interface {
	ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	ReadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (orchestrator.WorkflowExecutionEventPage, error)
	SubscribeEvents(cursor orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error)
}

type SemanticRuntimeSource interface {
	ReadSemanticRuntimeSnapshot(ctx context.Context, filter semanticgraph.SemanticRuntimeFilter) (semanticgraph.SemanticRuntimeSnapshot, error)
	SubscribeSemanticGraphChanges(cursor semanticgraph.SemanticGraphChangeCursor) (*semanticgraph.SemanticGraphChangeSubscription, error)
}

type RuntimeEventCursor struct {
	StreamID string
	Sequence int
}

type RuntimeEventSubscription struct {
	Events <-chan WorkspaceTrajectoryRuntimeEvent

	hub     *runtimeHub
	channel chan WorkspaceTrajectoryRuntimeEvent
}

type Service struct {
	chatSource     ChatSource
	workflowSource WorkflowSource
	semanticSource SemanticRuntimeSource
	hub            *runtimeHub

	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
}

type Config struct {
	ChatSource     ChatSource
	WorkflowSource WorkflowSource
	SemanticSource SemanticRuntimeSource
	Now            func() time.Time
	StreamID       string
}

func NewService(config Config) (*Service, error) {
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Service{
		chatSource:     config.ChatSource,
		workflowSource: config.WorkflowSource,
		semanticSource: config.SemanticSource,
		hub:            newRuntimeHub(config.StreamID, now),
	}, nil
}

func (service *Service) Start(ctx context.Context) error {
	if service == nil {
		return errors.New("workspace trajectory service is required")
	}
	if ctx == nil {
		return errors.New("workspace trajectory context is required")
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.cancel != nil {
		return errors.New("workspace trajectory service is already started")
	}
	runCtx, cancel := context.WithCancel(ctx)
	service.cancel = cancel
	service.done = make(chan struct{})
	go service.observe(runCtx, service.done)
	return nil
}

func (service *Service) Shutdown(ctx context.Context) error {
	if service == nil {
		return nil
	}
	service.mu.Lock()
	cancel := service.cancel
	done := service.done
	service.cancel = nil
	service.done = nil
	service.mu.Unlock()
	if cancel == nil {
		service.hub.close()
		return nil
	}
	cancel()
	if ctx == nil {
		<-done
		service.hub.close()
		return nil
	}
	select {
	case <-done:
		service.hub.close()
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (service *Service) ReadRuntimeSnapshot(ctx context.Context, filter RuntimeFilter) (WorkspaceTrajectoryRuntimeSnapshot, error) {
	if service == nil {
		return WorkspaceTrajectoryRuntimeSnapshot{}, errors.New("workspace trajectory service is required")
	}
	if filter.WorkspaceID == "" {
		return WorkspaceTrajectoryRuntimeSnapshot{}, errors.New("workspace trajectory workspace id is required")
	}
	limit := normalizeLimit(filter.Limit)
	var activity chat.RunActivityPage
	if filter.ChatRunID != "" && service.chatSource != nil {
		page, err := service.chatSource.LoadRunActivityPage(filter.WorkspaceID, filter.ChatRunID, limit)
		if err != nil {
			return WorkspaceTrajectoryRuntimeSnapshot{}, fmt.Errorf("read trajectory chat activity: %w", err)
		}
		activity = page
	}
	var execution *orchestrator.WorkflowExecution
	if filter.WorkflowExecutionID != "" && service.workflowSource != nil {
		read, err := service.workflowSource.ReadExecution(filter.WorkspaceID, filter.WorkflowExecutionID)
		if err != nil {
			return WorkspaceTrajectoryRuntimeSnapshot{}, fmt.Errorf("read trajectory workflow execution: %w", err)
		}
		execution = &read
	}
	var semanticRuntime *semanticgraph.SemanticRuntimeSnapshot
	if service.semanticSource != nil {
		read, err := service.semanticSource.ReadSemanticRuntimeSnapshot(ctx, semanticgraph.SemanticRuntimeFilter{
			WorkspaceID:         filter.WorkspaceID,
			WorkflowExecutionID: filter.WorkflowExecutionID,
			ChatRunID:           filter.ChatRunID,
			Limit:               limit,
		})
		if err != nil {
			return WorkspaceTrajectoryRuntimeSnapshot{}, fmt.Errorf("read trajectory cartographer runtime: %w", err)
		}
		semanticRuntime = &read
	}
	return BuildSnapshot(SnapshotInput{
		Filter:          RuntimeFilter{WorkspaceID: filter.WorkspaceID, WorkflowExecutionID: filter.WorkflowExecutionID, ChatRunID: filter.ChatRunID, Limit: limit},
		Revision:        service.hub.currentRevision(),
		GeneratedAt:     timestamp(service.hub.now()),
		ChatActivity:    activity,
		Workflow:        execution,
		SemanticRuntime: semanticRuntime,
	}), nil
}

func (service *Service) SubscribeRuntimeChanges(cursor RuntimeEventCursor) (*RuntimeEventSubscription, error) {
	if service == nil {
		return nil, errors.New("workspace trajectory service is required")
	}
	return service.hub.subscribe(cursor)
}

func (service *Service) PublishChatEvent(event chat.Event) (WorkspaceTrajectoryRuntimeEvent, bool, error) {
	return service.hub.publishMapped(event.WorkspaceID, func(fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error) {
		return DeltaFromChatEvent(event, fromRevision, toRevision, generatedAt)
	})
}

func (service *Service) PublishWorkflowEvent(event orchestrator.WorkflowEventEnvelope) (WorkspaceTrajectoryRuntimeEvent, bool, error) {
	return service.hub.publishMapped(event.Event.WorkspaceID, func(fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error) {
		return DeltaFromWorkflowEvent(event, fromRevision, toRevision, generatedAt)
	})
}

func (service *Service) PublishSemanticGraphChange(event semanticgraph.SemanticGraphChangeEvent) (WorkspaceTrajectoryRuntimeEvent, bool, error) {
	return service.hub.publishMapped(event.WorkspaceID, func(fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error) {
		return DeltaFromSemanticGraphChange(event, fromRevision, toRevision, generatedAt)
	})
}

func (service *Service) observe(ctx context.Context, done chan<- struct{}) {
	var wait sync.WaitGroup
	if service.chatSource != nil {
		wait.Add(1)
		go func() {
			defer wait.Done()
			service.observeChat(ctx)
		}()
	}
	if service.workflowSource != nil {
		wait.Add(1)
		go func() {
			defer wait.Done()
			service.observeWorkflow(ctx)
		}()
	}
	if service.semanticSource != nil {
		wait.Add(1)
		go func() {
			defer wait.Done()
			service.observeSemantic(ctx)
		}()
	}
	wait.Wait()
	close(done)
}

func (service *Service) observeChat(ctx context.Context) {
	subscription, err := service.chatSource.SubscribeEvents(chat.EventCursor{})
	if err != nil {
		return
	}
	defer subscription.Unsubscribe()
	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			_, _, _ = service.PublishChatEvent(event)
		case <-ctx.Done():
			return
		}
	}
}

func (service *Service) observeWorkflow(ctx context.Context) {
	subscription, err := service.workflowSource.SubscribeEvents(orchestrator.WorkflowEventCursor{})
	if err != nil {
		return
	}
	defer subscription.Unsubscribe()
	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			_, _, _ = service.PublishWorkflowEvent(event)
		case <-ctx.Done():
			return
		}
	}
}

func (service *Service) observeSemantic(ctx context.Context) {
	subscription, err := service.semanticSource.SubscribeSemanticGraphChanges(semanticgraph.SemanticGraphChangeCursor{})
	if err != nil {
		return
	}
	defer subscription.Unsubscribe()
	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			_, _, _ = service.PublishSemanticGraphChange(event)
		case <-ctx.Done():
			return
		}
	}
}

func (subscription *RuntimeEventSubscription) Unsubscribe() {
	if subscription == nil || subscription.hub == nil {
		return
	}
	subscription.hub.unsubscribe(subscription.channel)
}

type runtimeHub struct {
	mu           sync.Mutex
	closed       bool
	nextSequence int
	revision     int
	streamID     string
	retained     []WorkspaceTrajectoryRuntimeEvent
	subscribers  map[chan WorkspaceTrajectoryRuntimeEvent]struct{}
	now          func() time.Time
}

func newRuntimeHub(streamID string, now func() time.Time) *runtimeHub {
	if streamID == "" {
		streamID = defaultRuntimeStreamID
	}
	return &runtimeHub{
		nextSequence: 1,
		streamID:     streamID,
		subscribers:  map[chan WorkspaceTrajectoryRuntimeEvent]struct{}{},
		now:          now,
	}
}

func (hub *runtimeHub) currentRevision() int {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return hub.revision
}

func (hub *runtimeHub) publishMapped(workspaceID string, mapper func(fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error)) (WorkspaceTrajectoryRuntimeEvent, bool, error) {
	if workspaceID == "" {
		return WorkspaceTrajectoryRuntimeEvent{}, false, nil
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return WorkspaceTrajectoryRuntimeEvent{}, false, errors.New("workspace trajectory runtime stream is closed")
	}
	fromRevision := hub.revision
	toRevision := fromRevision + 1
	generatedAt := timestamp(hub.now())
	delta, ok, err := mapper(fromRevision, toRevision, generatedAt)
	if err != nil || !ok {
		return WorkspaceTrajectoryRuntimeEvent{}, false, err
	}
	delta.WorkspaceID = workspaceID
	delta.FromRevision = fromRevision
	delta.ToRevision = toRevision
	delta.GeneratedAt = generatedAt
	finalizeDelta(&delta, runtimeLimits(DefaultRuntimeLimit))
	hub.revision = toRevision
	event := hub.nextEventLocked(workspaceID, toRevision, &delta, false, generatedAt)
	hub.retainLocked(event)
	hub.broadcastLocked(event)
	return event, true, nil
}

func (hub *runtimeHub) subscribe(cursor RuntimeEventCursor) (*RuntimeEventSubscription, error) {
	if err := validateRuntimeEventCursor(cursor); err != nil {
		return nil, err
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	replay := hub.replayAfterLocked(cursor)
	if hub.requiresSnapshotLocked(cursor) {
		replay = []WorkspaceTrajectoryRuntimeEvent{hub.snapshotRequiredEventLocked(cursor)}
	}
	channel := make(chan WorkspaceTrajectoryRuntimeEvent, len(replay)+defaultRuntimeBufferSize)
	for _, event := range replay {
		channel <- event
	}
	if hub.closed {
		close(channel)
		return &RuntimeEventSubscription{Events: channel, hub: hub, channel: channel}, nil
	}
	hub.subscribers[channel] = struct{}{}
	return &RuntimeEventSubscription{Events: channel, hub: hub, channel: channel}, nil
}

func validateRuntimeEventCursor(cursor RuntimeEventCursor) error {
	if cursor.Sequence < 0 {
		return fmt.Errorf("workspace trajectory runtime event sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("workspace trajectory runtime stream id is required for non-zero sequence")
	}
	return nil
}

func (hub *runtimeHub) unsubscribe(channel chan WorkspaceTrajectoryRuntimeEvent) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if _, ok := hub.subscribers[channel]; !ok {
		return
	}
	delete(hub.subscribers, channel)
	close(channel)
}

func (hub *runtimeHub) close() {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	hub.closed = true
	for channel := range hub.subscribers {
		close(channel)
		delete(hub.subscribers, channel)
	}
}

func (hub *runtimeHub) nextEventLocked(workspaceID string, revision int, delta *WorkspaceTrajectoryRuntimeDelta, snapshotRequired bool, occurredAt string) WorkspaceTrajectoryRuntimeEvent {
	sequence := hub.nextSequence
	hub.nextSequence++
	return WorkspaceTrajectoryRuntimeEvent{
		SchemaVersion:    SchemaVersion,
		StreamID:         hub.streamID,
		Sequence:         sequence,
		EventID:          fmt.Sprintf("%s:%d", hub.streamID, sequence),
		Type:             RuntimeEventTypeChanged,
		WorkspaceID:      workspaceID,
		Revision:         revision,
		Delta:            delta,
		SnapshotRequired: snapshotRequired,
		OccurredAt:       occurredAt,
	}
}

func (hub *runtimeHub) retainLocked(event WorkspaceTrajectoryRuntimeEvent) {
	hub.retained = append(hub.retained, event)
	if len(hub.retained) > defaultRuntimeBufferSize {
		hub.retained = append([]WorkspaceTrajectoryRuntimeEvent{}, hub.retained[len(hub.retained)-defaultRuntimeBufferSize:]...)
	}
}

func (hub *runtimeHub) broadcastLocked(event WorkspaceTrajectoryRuntimeEvent) {
	for channel := range hub.subscribers {
		select {
		case channel <- event:
		default:
			close(channel)
			delete(hub.subscribers, channel)
		}
	}
}

func (hub *runtimeHub) replayAfterLocked(cursor RuntimeEventCursor) []WorkspaceTrajectoryRuntimeEvent {
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return []WorkspaceTrajectoryRuntimeEvent{}
	}
	replay := []WorkspaceTrajectoryRuntimeEvent{}
	for _, event := range hub.retained {
		if event.Sequence > cursor.Sequence {
			replay = append(replay, event)
		}
	}
	return replay
}

func (hub *runtimeHub) requiresSnapshotLocked(cursor RuntimeEventCursor) bool {
	currentSequence := hub.nextSequence - 1
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return true
	}
	if cursor.Sequence == 0 {
		return false
	}
	if cursor.Sequence > currentSequence {
		return true
	}
	if len(hub.retained) == 0 {
		return cursor.Sequence < currentSequence
	}
	return cursor.Sequence < hub.retained[0].Sequence-1
}

func (hub *runtimeHub) snapshotRequiredEventLocked(cursor RuntimeEventCursor) WorkspaceTrajectoryRuntimeEvent {
	sequence := hub.nextSequence - 1
	if sequence < 0 {
		sequence = 0
	}
	eventID := fmt.Sprintf("%s:%d", hub.streamID, sequence)
	return WorkspaceTrajectoryRuntimeEvent{
		SchemaVersion:    SchemaVersion,
		StreamID:         hub.streamID,
		Sequence:         sequence,
		EventID:          eventID,
		Type:             RuntimeEventTypeChanged,
		WorkspaceID:      "",
		Revision:         hub.revision,
		Delta:            nil,
		SnapshotRequired: true,
		OccurredAt:       timestamp(hub.now()),
	}
}
