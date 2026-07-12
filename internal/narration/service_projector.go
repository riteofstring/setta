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

type terminalProjectionQueue struct {
	active   ProjectionOperation
	pending  []ProjectionOperation
	deferred []deferredProjection
}

type deferredProjection struct {
	operation ProjectionOperation
	trigger   conversation.NarrationTrigger
}

// RecoverCommittedTrajectory re-admits durable work that survived a narrator
// process restart. It is a bounded startup scan, not polling; every provider
// call still runs asynchronously through the normal per-conversation actor.
func (service *Service) RecoverCommittedTrajectory(ctx context.Context) error {
	if service == nil || service.store == nil || service.registry == nil {
		return errors.New("narrator service is required")
	}
	if ctx == nil {
		return errors.New("narrator recovery context is required")
	}
	targets, err := service.store.ListNarratorRecoveryTargets(ctx)
	if err != nil {
		return err
	}
	for _, target := range targets {
		operation := ProjectionOperation{
			WorkspaceID:     target.WorkspaceID,
			TurnID:          target.TurnID,
			ThroughSequence: target.ThroughSequence,
		}
		if target.Terminal {
			service.enqueueTerminalProjection(target.ConversationID, operation)
			continue
		}
		service.submitProjection(
			target.ConversationID,
			operation,
			conversation.NarrationTriggerProgressWindowElapsed,
		)
	}
	return nil
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

func (service *Service) enqueueTerminalProjection(
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
		service.submitProjection(
			conversationID,
			operation,
			conversation.NarrationTriggerTurnTerminal,
		)
		return
	}
	if queue.active == operation {
		service.lifecycleMu.Unlock()
		return
	}
	for _, pending := range queue.pending {
		if pending == operation {
			service.lifecycleMu.Unlock()
			return
		}
	}
	queue.pending = append(queue.pending, operation)
	service.lifecycleMu.Unlock()
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
	for _, event := range observation.Trajectory {
		trigger, priority := trajectoryTrigger(event.Kind)
		if priority > selectedPriority {
			selected = trigger
			selectedPriority = priority
		}
	}
	return selected, selectedPriority > 0
}

func trajectoryTrigger(kind conversation.TrajectoryEventKind) (conversation.NarrationTrigger, int) {
	switch kind {
	case conversation.TrajectoryEventApprovalRequested:
		return conversation.NarrationTriggerApprovalRequired, 4
	case conversation.TrajectoryEventTurnSteered:
		return conversation.NarrationTriggerUserSteered, 3
	case conversation.TrajectoryEventPlanChanged:
		return conversation.NarrationTriggerPlanChanged, 2
	case conversation.TrajectoryEventActivityCompleted,
		conversation.TrajectoryEventSubagentCompleted:
		return conversation.NarrationTriggerPhaseActivityCompleted, 1
	default:
		return conversation.NarrationTriggerProgressWindowElapsed, 0
	}
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
			return
		}
		_, _ = service.registry.Submit(ctx, Request{
			ID:             requestID,
			ConversationID: conversationID,
			Kind:           RequestKindProjection,
			Trigger:        trigger,
			Projection:     &operation,
		})
	})
}

func (service *Service) deferProjectionBehindTerminal(
	conversationID string,
	operation ProjectionOperation,
	trigger conversation.NarrationTrigger,
) bool {
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	queue := service.terminal[conversationID]
	if queue == nil {
		return false
	}
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
		return true
	}
	queue.deferred = append(queue.deferred, deferredProjection{
		operation: operation,
		trigger:   trigger,
	})
	return true
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
		_, _ = service.registry.Submit(ctx, Request{
			ID:             requestID,
			ConversationID: conversationID,
			Kind:           RequestKindCheckpoint,
			Trigger:        conversation.NarrationTriggerCheckpointWindowExceeded,
			Checkpoint:     &operation,
		})
	})
}

func (service *Service) startTask(task func(context.Context)) {
	service.lifecycleMu.Lock()
	if service.closing {
		service.lifecycleMu.Unlock()
		return
	}
	ctx := service.lifecycleCtx
	service.tasks.Add(1)
	service.lifecycleMu.Unlock()
	go func() {
		defer service.tasks.Done()
		task(ctx)
	}()
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
		}
		return
	}
	switch completion.Request.Kind {
	case RequestKindProjection:
		service.continueProjection(completion.Request)
	case RequestKindCheckpoint:
		service.continueCheckpoint(completion.Request)
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
			if state.CheckpointThroughSequence < state.ObservedThroughSequence {
				turnID := operation.TurnID
				service.submitCheckpoint(request.ConversationID, CheckpointOperation{
					WorkspaceID:      operation.WorkspaceID,
					TurnID:           &turnID,
					ResumeProjection: &operation,
					ResumeTrigger:    request.Trigger,
				})
				return
			}
			service.submitProjection(request.ConversationID, operation, request.Trigger)
			return
		}
		if request.Trigger == conversation.NarrationTriggerTurnTerminal {
			service.completeTerminalProjection(request.ConversationID, operation)
		}
		if state.ObservedThroughSequence-state.CheckpointThroughSequence >=
			service.checkpointWindowEvents {
			turnID := operation.TurnID
			service.submitCheckpoint(request.ConversationID, CheckpointOperation{
				WorkspaceID: operation.WorkspaceID,
				TurnID:      &turnID,
			})
		}
	})
}

func (service *Service) completeTerminalProjection(
	conversationID string,
	operation ProjectionOperation,
) {
	service.lifecycleMu.Lock()
	queue := service.terminal[conversationID]
	if queue == nil || queue.active != operation {
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
	service.lifecycleMu.Unlock()
	service.submitProjection(
		conversationID,
		next,
		conversation.NarrationTriggerTurnTerminal,
	)
}

func (service *Service) continueCheckpoint(request Request) {
	service.startTask(func(ctx context.Context) {
		operation := *request.Checkpoint
		state, err := service.store.ReadNarratorState(ctx, request.ConversationID)
		if err != nil {
			service.submitCheckpoint(request.ConversationID, operation)
			return
		}
		if operation.ResumeProjection != nil {
			if state.CheckpointThroughSequence < state.ObservedThroughSequence {
				service.submitCheckpoint(request.ConversationID, operation)
				return
			}
			service.submitProjection(
				request.ConversationID,
				*operation.ResumeProjection,
				operation.ResumeTrigger,
			)
			return
		}
		if state.ObservedThroughSequence-state.CheckpointThroughSequence >=
			service.checkpointWindowEvents {
			service.submitCheckpoint(request.ConversationID, operation)
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
