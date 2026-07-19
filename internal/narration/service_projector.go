package narration

import (
	"context"
	"errors"

	"setta/internal/conversation"
)

type progressWindow struct {
	cancel    context.CancelFunc
	operation ProjectionOperation
}

type focusBarrier struct {
	sourceSequence int
	done           chan struct{}
}

type terminalProjectionQueue struct {
	active         ProjectionOperation
	activeInFlight bool
	retryRequested bool
	pending        []ProjectionOperation
	deferred       []deferredProjection
}

type deferredProjection struct {
	operation ProjectionOperation
	trigger   conversation.NarrationTrigger
}

// ObserveCommittedTrajectory is the production push boundary from the topic
// conversation lifecycle. It performs no provider or persistence work inline.
func (service *Service) ObserveCommittedTrajectory(
	observation conversation.NarrationTrajectoryObservation,
) {
	if service == nil || service.registry == nil || len(observation.Trajectory) == 0 {
		return
	}
	operation := ProjectionOperation{
		WorkspaceID:     observation.WorkspaceID,
		TurnID:          observation.TurnID,
		ThroughSequence: observationThroughSequence(observation.Trajectory),
		SemanticEvents:  append([]conversation.NarratorSemanticEvent{}, observation.Semantic...),
	}
	service.submitFocusObservations(observation)
	if len(operation.SemanticEvents) == 0 && !observation.Terminal {
		return
	}
	trigger, immediate := observationTrigger(observation)
	if immediate {
		service.cancelProgressWindow(observation.ConversationID)
		if trigger == conversation.NarrationTriggerTurnTerminal {
			service.enqueueTerminalProjection(observation.ConversationID, operation)
			return
		}
		service.submitProjection(observation.ConversationID, operation, trigger)
		return
	}
	service.scheduleProgressWindow(observation.ConversationID, operation)
}

func (service *Service) submitFocusObservations(
	observation conversation.NarrationTrajectoryObservation,
) {
	for _, event := range observation.Trajectory {
		trigger, ok := focusTrigger(event.Kind)
		if !ok {
			continue
		}
		service.submitFocus(
			observation.ConversationID,
			FocusOperation{
				WorkspaceID:    observation.WorkspaceID,
				TurnID:         observation.TurnID,
				SourceSequence: event.Sequence,
			},
			trigger,
		)
	}
}

func focusTrigger(kind conversation.TrajectoryEventKind) (conversation.NarrationTrigger, bool) {
	switch kind {
	case conversation.TrajectoryEventUserInputAccepted:
		return conversation.NarrationTriggerInputAccepted, true
	case conversation.TrajectoryEventTurnSteered:
		return conversation.NarrationTriggerUserSteered, true
	default:
		return "", false
	}
}

func (service *Service) enqueueTerminalProjection(
	conversationID string,
	operation ProjectionOperation,
) {
	barriers := service.focusBarriersThrough(conversationID, operation.ThroughSequence)
	if len(barriers) > 0 {
		service.startTask(func(ctx context.Context) {
			if !waitForFocusBarriers(ctx, barriers) {
				return
			}
			service.enqueueReadyTerminalProjection(conversationID, operation)
		})
		return
	}
	service.enqueueReadyTerminalProjection(conversationID, operation)
}

func (service *Service) focusBarriersThrough(
	conversationID string,
	throughSequence int,
) []<-chan struct{} {
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	pending := service.focus[conversationID]
	barriers := make([]<-chan struct{}, 0, len(pending))
	for _, barrier := range pending {
		if barrier.sourceSequence <= throughSequence {
			barriers = append(barriers, barrier.done)
		}
	}
	return barriers
}

func waitForFocusBarriers(ctx context.Context, barriers []<-chan struct{}) bool {
	for _, barrier := range barriers {
		select {
		case <-barrier:
		case <-ctx.Done():
			return false
		}
	}
	return true
}

func (service *Service) enqueueReadyTerminalProjection(
	conversationID string,
	operation ProjectionOperation,
) {
	service.lifecycleMu.Lock()
	if service.closing {
		service.lifecycleMu.Unlock()
		return
	}
	queue := service.terminal[conversationID]
	if queue == nil {
		service.terminal[conversationID] = &terminalProjectionQueue{active: operation}
		service.lifecycleMu.Unlock()
		service.resumeTerminalProjection(conversationID)
		return
	}
	if sameProjectionOperation(&queue.active, &operation) {
		queue.retryRequested = queue.retryRequested || queue.activeInFlight
		service.lifecycleMu.Unlock()
		service.resumeTerminalProjection(conversationID)
		return
	}
	for _, pending := range queue.pending {
		if sameProjectionOperation(&pending, &operation) {
			queue.retryRequested = queue.retryRequested || queue.activeInFlight
			service.lifecycleMu.Unlock()
			service.resumeTerminalProjection(conversationID)
			return
		}
	}
	queue.pending = append(queue.pending, operation)
	queue.retryRequested = queue.retryRequested || queue.activeInFlight
	service.lifecycleMu.Unlock()
	service.resumeTerminalProjection(conversationID)
}

func (service *Service) resumeTerminalProjection(conversationID string) {
	service.lifecycleMu.Lock()
	queue := service.terminal[conversationID]
	if service.closing || queue == nil || queue.activeInFlight {
		service.lifecycleMu.Unlock()
		return
	}
	queue.activeInFlight = true
	operation := queue.active
	service.lifecycleMu.Unlock()
	service.submitProjection(
		conversationID,
		operation,
		conversation.NarrationTriggerTurnTerminal,
	)
}

func observationThroughSequence(events []conversation.TrajectoryEvent) int {
	through := 0
	for _, event := range events {
		through = max(through, event.Sequence)
	}
	return through
}

func observationTrigger(
	observation conversation.NarrationTrajectoryObservation,
) (conversation.NarrationTrigger, bool) {
	if observation.Terminal {
		return conversation.NarrationTriggerTurnTerminal, true
	}
	selected := conversation.NarrationTriggerProgressWindowElapsed
	selectedPriority := 0
	for _, event := range observation.Semantic {
		trigger, priority := semanticTrigger(event)
		if priority > selectedPriority {
			selected = trigger
			selectedPriority = priority
		}
	}
	return selected, selectedPriority > 0
}

func semanticTrigger(event conversation.NarratorSemanticEvent) (conversation.NarrationTrigger, int) {
	switch event.Kind {
	case conversation.NarratorSemanticEventApprovalNeeded:
		return conversation.NarrationTriggerApprovalRequired, 4
	case conversation.NarratorSemanticEventMeaningfulProgress:
		if event.MeaningfulProgress != nil && event.MeaningfulProgress.Plan != nil {
			return conversation.NarrationTriggerPlanChanged, 2
		}
		return conversation.NarrationTriggerProgressWindowElapsed, 0
	default:
		return conversation.NarrationTriggerProgressWindowElapsed, 0
	}
}

func mergeProjectionSemanticEvents(
	current []conversation.NarratorSemanticEvent,
	incoming []conversation.NarratorSemanticEvent,
) []conversation.NarratorSemanticEvent {
	result := make([]conversation.NarratorSemanticEvent, 0, len(current)+len(incoming))
	seen := map[int]bool{}
	for _, event := range current {
		seen[event.SemanticSequence] = true
		result = append(result, event)
	}
	for _, event := range incoming {
		if seen[event.SemanticSequence] {
			continue
		}
		seen[event.SemanticSequence] = true
		result = append(result, event)
	}
	return result
}

func (service *Service) scheduleProgressWindow(
	conversationID string,
	operation ProjectionOperation,
) {
	service.lifecycleMu.Lock()
	if service.closing {
		service.lifecycleMu.Unlock()
		return
	}
	if current := service.progress[conversationID]; current != nil &&
		current.operation.TurnID == operation.TurnID {
		if operation.ThroughSequence > current.operation.ThroughSequence {
			current.operation.ThroughSequence = operation.ThroughSequence
		}
		current.operation.SemanticEvents = mergeProjectionSemanticEvents(
			current.operation.SemanticEvents,
			operation.SemanticEvents,
		)
		service.lifecycleMu.Unlock()
		return
	}
	if current := service.progress[conversationID]; current != nil {
		current.cancel()
	}
	timerCtx, cancel := context.WithCancel(service.lifecycleCtx)
	window := &progressWindow{cancel: cancel, operation: operation}
	service.progress[conversationID] = window
	service.tasks.Add(1)
	service.lifecycleMu.Unlock()

	go func() {
		defer service.tasks.Done()
		if err := service.progressWait(timerCtx, service.progressWindow); err != nil {
			return
		}
		service.lifecycleMu.Lock()
		current := service.progress[conversationID]
		if service.closing || current != window {
			service.lifecycleMu.Unlock()
			return
		}
		delete(service.progress, conversationID)
		ready := current.operation
		service.lifecycleMu.Unlock()
		service.submitProjection(
			conversationID,
			ready,
			conversation.NarrationTriggerProgressWindowElapsed,
		)
	}()
}

func (service *Service) cancelProgressWindow(conversationID string) {
	service.lifecycleMu.Lock()
	if current := service.progress[conversationID]; current != nil {
		current.cancel()
		delete(service.progress, conversationID)
	}
	service.lifecycleMu.Unlock()
}

func (service *Service) submitProjection(
	conversationID string,
	operation ProjectionOperation,
	trigger conversation.NarrationTrigger,
) {
	if trigger != conversation.NarrationTriggerTurnTerminal &&
		service.deferProjectionBehindTerminal(conversationID, operation, trigger) {
		return
	}
	service.startTask(func(ctx context.Context) {
		requestID, err := service.newID("narrator_projection")
		if err != nil {
			service.releaseTerminalProjection(conversationID, operation, trigger)
			return
		}
		_, err = service.registry.Submit(ctx, Request{
			ID:             requestID,
			ConversationID: conversationID,
			Kind:           RequestKindProjection,
			Trigger:        trigger,
			Projection:     &operation,
		})
		if err != nil {
			service.releaseTerminalProjection(conversationID, operation, trigger)
		}
	})
}

func (service *Service) submitFocus(
	conversationID string,
	operation FocusOperation,
	trigger conversation.NarrationTrigger,
) {
	service.lifecycleMu.Lock()
	if service.closing {
		service.lifecycleMu.Unlock()
		return
	}
	var previous <-chan struct{}
	if pending := service.focus[conversationID]; len(pending) > 0 {
		previous = pending[len(pending)-1].done
	}
	done := make(chan struct{})
	service.focus[conversationID] = append(service.focus[conversationID], focusBarrier{
		sourceSequence: operation.SourceSequence,
		done:           done,
	})
	ctx := service.lifecycleCtx
	service.tasks.Add(1)
	service.lifecycleMu.Unlock()

	go func() {
		submitted := false
		defer func() {
			if !submitted {
				service.releaseFocusBarrierDone(conversationID, done)
			}
			service.tasks.Done()
		}()
		if previous != nil {
			select {
			case <-previous:
			case <-ctx.Done():
				return
			}
		}
		requestID, err := service.newID("narrator_focus")
		if err != nil {
			return
		}
		_, err = service.registry.Submit(ctx, Request{
			ID:             requestID,
			ConversationID: conversationID,
			Kind:           RequestKindFocus,
			Trigger:        trigger,
			Focus:          &operation,
		})
		if err != nil {
			return
		}
		submitted = true
	}()
}

func (service *Service) releaseFocusBarrierDone(conversationID string, done chan struct{}) {
	service.lifecycleMu.Lock()
	pending := service.focus[conversationID]
	found := false
	for index, barrier := range pending {
		if barrier.done != done {
			continue
		}
		pending = append(pending[:index], pending[index+1:]...)
		found = true
		break
	}
	if len(pending) == 0 {
		delete(service.focus, conversationID)
	} else {
		service.focus[conversationID] = pending
	}
	service.lifecycleMu.Unlock()
	if found {
		close(done)
	}
}

func (service *Service) releaseFocusBarrier(
	conversationID string,
	sourceSequence int,
) {
	service.lifecycleMu.Lock()
	pending := service.focus[conversationID]
	remaining := pending[:0]
	released := make([]chan struct{}, 0, 1)
	for _, barrier := range pending {
		if barrier.sourceSequence == sourceSequence {
			released = append(released, barrier.done)
			continue
		}
		remaining = append(remaining, barrier)
	}
	if len(remaining) == 0 {
		delete(service.focus, conversationID)
	} else {
		service.focus[conversationID] = remaining
	}
	service.lifecycleMu.Unlock()
	for _, done := range released {
		close(done)
	}
}

func (service *Service) deferProjectionBehindTerminal(
	conversationID string,
	operation ProjectionOperation,
	trigger conversation.NarrationTrigger,
) bool {
	service.lifecycleMu.Lock()
	queue := service.terminal[conversationID]
	if queue == nil {
		service.lifecycleMu.Unlock()
		return false
	}
	queue.retryRequested = queue.retryRequested || queue.activeInFlight
	for index := range queue.deferred {
		deferred := &queue.deferred[index]
		if deferred.operation.TurnID != operation.TurnID {
			continue
		}
		deferred.operation.ThroughSequence = max(
			deferred.operation.ThroughSequence,
			operation.ThroughSequence,
		)
		if projectionTriggerPriority(trigger) > projectionTriggerPriority(deferred.trigger) {
			deferred.trigger = trigger
		}
		service.lifecycleMu.Unlock()
		service.resumeTerminalProjection(conversationID)
		return true
	}
	queue.deferred = append(queue.deferred, deferredProjection{
		operation: operation,
		trigger:   trigger,
	})
	service.lifecycleMu.Unlock()
	service.resumeTerminalProjection(conversationID)
	return true
}

func (service *Service) releaseTerminalProjection(
	conversationID string,
	operation ProjectionOperation,
	trigger conversation.NarrationTrigger,
) {
	if trigger != conversation.NarrationTriggerTurnTerminal {
		return
	}
	service.lifecycleMu.Lock()
	queue := service.terminal[conversationID]
	resume := false
	if queue != nil && sameProjectionOperation(&queue.active, &operation) {
		queue.activeInFlight = false
		resume = queue.retryRequested && !service.closing
		queue.retryRequested = false
	}
	service.lifecycleMu.Unlock()
	if resume {
		service.resumeTerminalProjection(conversationID)
	}
}

func projectionTriggerPriority(trigger conversation.NarrationTrigger) int {
	switch trigger {
	case conversation.NarrationTriggerApprovalRequired:
		return 5
	case conversation.NarrationTriggerUserSteered:
		return 4
	case conversation.NarrationTriggerPlanChanged:
		return 3
	case conversation.NarrationTriggerPhaseActivityCompleted:
		return 2
	case conversation.NarrationTriggerProgressWindowElapsed:
		return 1
	default:
		return 0
	}
}

func (service *Service) submitCheckpoint(
	conversationID string,
	operation CheckpointOperation,
) {
	service.startTask(func(ctx context.Context) {
		requestID, err := service.newID("narrator_checkpoint")
		if err != nil {
			return
		}
		_, err = service.registry.Submit(ctx, Request{
			ID:             requestID,
			ConversationID: conversationID,
			Kind:           RequestKindCheckpoint,
			Trigger:        conversation.NarrationTriggerCheckpointWindowExceeded,
			Checkpoint:     &operation,
		})
	})
}

func (service *Service) startTask(task func(context.Context)) bool {
	service.lifecycleMu.Lock()
	if service.closing {
		service.lifecycleMu.Unlock()
		return false
	}
	ctx := service.lifecycleCtx
	service.tasks.Add(1)
	service.lifecycleMu.Unlock()
	go func() {
		defer service.tasks.Done()
		task(ctx)
	}()
	return true
}

func (service *Service) handleCompletion(completion Completion) {
	if completion.Err != nil {
		if errors.Is(completion.Err, ErrCheckpointSuperseded) &&
			completion.Request.Kind == RequestKindCheckpoint &&
			completion.Request.Checkpoint != nil {
			service.submitCheckpoint(
				completion.Request.ConversationID,
				*completion.Request.Checkpoint,
			)
			return
		}
		if !completion.RetryScheduled {
			service.releaseRequestFocusBarrier(completion.Request)
			service.releaseRequestTerminalProjection(completion.Request)
		}
		return
	}
	switch completion.Request.Kind {
	case RequestKindFocus:
		service.releaseRequestFocusBarrier(completion.Request)
		service.resumeTerminalProjection(completion.Request.ConversationID)
	case RequestKindProjection:
		service.continueProjection(completion.Request)
	case RequestKindCheckpoint:
		service.continueCheckpoint(completion.Request)
	case RequestKindStatus:
		service.resumeTerminalProjection(completion.Request.ConversationID)
	}
}

func (service *Service) releaseRequestFocusBarrier(request Request) {
	if request.Kind != RequestKindFocus || request.Focus == nil {
		return
	}
	service.releaseFocusBarrier(request.ConversationID, request.Focus.SourceSequence)
}

func (service *Service) releaseRequestTerminalProjection(request Request) {
	switch request.Kind {
	case RequestKindFocus:
		return
	case RequestKindProjection:
		if request.Projection != nil {
			service.releaseTerminalProjection(
				request.ConversationID,
				*request.Projection,
				request.Trigger,
			)
		}
	case RequestKindCheckpoint:
		return
	case RequestKindStatus:
		return
	}
}

func (service *Service) continueProjection(request Request) {
	service.startTask(func(ctx context.Context) {
		operation := *request.Projection
		state, err := service.store.ReadNarratorState(ctx, request.ConversationID)
		if err != nil {
			service.submitProjection(request.ConversationID, operation, request.Trigger)
			return
		}
		if state.ObservedThroughSequence < operation.ThroughSequence {
			service.submitProjection(request.ConversationID, operation, request.Trigger)
			return
		}
		if request.Trigger == conversation.NarrationTriggerTurnTerminal {
			service.completeTerminalProjection(request.ConversationID, operation)
		}
		if state.ObservedThroughSequence-state.CheckpointThroughSequence >=
			service.checkpointWindowEvents {
			service.submitCheckpoint(request.ConversationID, CheckpointOperation{
				WorkspaceID: operation.WorkspaceID,
			})
			return
		}
	})
}

func (service *Service) completeTerminalProjection(
	conversationID string,
	operation ProjectionOperation,
) {
	service.lifecycleMu.Lock()
	queue := service.terminal[conversationID]
	if queue == nil || !sameProjectionOperation(&queue.active, &operation) {
		service.lifecycleMu.Unlock()
		return
	}
	if len(queue.pending) == 0 {
		deferred := append([]deferredProjection{}, queue.deferred...)
		delete(service.terminal, conversationID)
		service.lifecycleMu.Unlock()
		for _, projection := range deferred {
			service.submitProjection(
				conversationID,
				projection.operation,
				projection.trigger,
			)
		}
		return
	}
	next := queue.pending[0]
	queue.pending = queue.pending[1:]
	queue.active = next
	queue.activeInFlight = false
	queue.retryRequested = false
	service.lifecycleMu.Unlock()
	service.resumeTerminalProjection(conversationID)
}

func (service *Service) continueCheckpoint(request Request) {
	service.startTask(func(ctx context.Context) {
		operation := *request.Checkpoint
		state, err := service.store.ReadNarratorState(ctx, request.ConversationID)
		if err != nil {
			service.submitCheckpoint(request.ConversationID, operation)
			return
		}
		if state.ObservedThroughSequence-state.CheckpointThroughSequence >=
			service.checkpointWindowEvents {
			service.submitCheckpoint(request.ConversationID, operation)
			return
		}
	})
}

func (service *Service) Shutdown(ctx context.Context) error {
	if service == nil || service.registry == nil {
		return errors.New("narrator service is required")
	}
	if ctx == nil {
		return errors.New("narrator service shutdown context is required")
	}
	service.lifecycleMu.Lock()
	if !service.closing {
		service.closing = true
		service.lifecycleCancel()
		for conversationID, current := range service.progress {
			current.cancel()
			delete(service.progress, conversationID)
		}
	}
	service.lifecycleMu.Unlock()
	registryErr := service.registry.Shutdown(ctx)
	done := make(chan struct{})
	go func() {
		service.tasks.Wait()
		close(done)
	}()
	select {
	case <-done:
		return registryErr
	case <-ctx.Done():
		return errors.Join(registryErr, ctx.Err())
	}
}

var _ conversation.NarrationTrajectoryObserver = (*Service)(nil)
