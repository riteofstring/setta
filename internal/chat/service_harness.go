package chat

import (
	"context"
	"errors"
	"fmt"
)

func (service *Service) runHarnessTurn(ctx context.Context, request TurnRequest) {
	sink := turnSink{service: service, workspaceID: request.Workspace.ID, conversationID: request.Conversation.ID, runID: request.Run.ID}
	task := conversationHarnessTaskRequest(request, sink)
	result, err := service.taskRunner.RunTask(ctx, task)
	if err != nil {
		service.handleHarnessTurnError(ctx, request, err)
		return
	}
	service.handleHarnessTurnCompletion(request, result.Completion)
}

func (service *Service) runHarnessGoalOperation(ctx context.Context, request TurnRequest, operation HarnessGoalOperation) {
	closed := false
	defer func() {
		if !closed {
			operation.Close()
		}
		service.releaseGoalOperationCancellationDrain(request.Workspace.ID, request.Conversation.ID, request.Run.ID)
	}()
	sink := turnSink{service: service, workspaceID: request.Workspace.ID, conversationID: request.Conversation.ID, runID: request.Run.ID}
	completion, err := operation.Wait(ctx, request, sink)
	operation.Close()
	closed = true
	if err != nil {
		service.handleHarnessTurnError(ctx, request, err)
		return
	}
	service.handleHarnessTurnCompletion(request, completion)
}

func (service *Service) releaseGoalOperationCancellationDrain(workspaceID string, conversationID string, runID string) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID || !active.cancelDrain {
		return
	}
	delete(service.active, key)
}

func conversationHarnessTaskRequest(request TurnRequest, sink TurnSink) HarnessTaskRequest {
	return HarnessTaskRequest{
		Surface:     harnessSurfaceForTurn(request),
		HarnessKind: request.Run.Harness,
		TurnMode:    HarnessTurnInteractiveConversation,
		OutputContract: HarnessOutputContract{
			Kind: HarnessOutputFreeTextEvents,
		},
		CapabilityPolicy: HarnessCapabilityPolicy{
			WorkspaceMutation: true,
			Approvals:         true,
			Streaming:         true,
		},
		ConversationTurn: &HarnessConversationTurn{
			Request: request,
			Sink:    sink,
		},
		ThreadRef: request.ThreadRef,
	}
}

func harnessSurfaceForTurn(request TurnRequest) HarnessSurface {
	if request.Conversation.Internal && request.Conversation.Workflow != nil {
		return HarnessSurfaceWorkflowAgent
	}
	return HarnessSurfaceMasterChat
}

func (service *Service) handleHarnessTurnError(ctx context.Context, request TurnRequest, err error) {
	if errors.Is(ctx.Err(), context.Canceled) {
		return
	}
	var refErr *HarnessRefUnavailableError
	if errors.As(err, &refErr) {
		if markErr := service.markHarnessRefUnavailable(request.Workspace.ID, request.Conversation.ID, request.Run.ID, refErr); markErr != nil {
			service.recordBackgroundFailure(request, "harness_ref_update_failed", markErr)
		}
	}
	if failErr := service.failTurn(request.Workspace.ID, request.Conversation.ID, request.Run.ID, err.Error()); failErr != nil {
		service.recordBackgroundFailure(request, "fail_turn_transition_failed", failErr)
	}
}

func (service *Service) handleHarnessTurnCompletion(request TurnRequest, completion TurnCompletion) {
	switch completion.Outcome {
	case TurnOutcomeCompleted:
		if err := service.completeTurn(request.Workspace.ID, request.Conversation.ID, request.Run.ID); err != nil {
			service.recordBackgroundFailure(request, "complete_turn_transition_failed", err)
		}
	case TurnOutcomeCancelled:
		if _, err := service.markTurnCancelledWithReason(request.Workspace.ID, request.Conversation.ID, request.Run.ID, "turn cancelled by provider", "provider_cancelled", "Turn cancelled by provider"); err != nil {
			service.recordBackgroundFailure(request, "cancel_turn_transition_failed", err)
		}
	case TurnOutcomeFailed:
		service.handleFailedHarnessCompletion(request, completion)
	default:
		err := fmt.Errorf("unsupported harness turn outcome: %s", completion.Outcome)
		if failErr := service.failTurn(request.Workspace.ID, request.Conversation.ID, request.Run.ID, err.Error()); failErr != nil {
			service.recordBackgroundFailure(request, "fail_turn_transition_failed", failErr)
		}
		service.recordBackgroundFailure(request, "harness_turn_outcome_unsupported", err)
	}
}

func (service *Service) handleFailedHarnessCompletion(request TurnRequest, completion TurnCompletion) {
	message := completion.ErrorMessage
	if message == "" {
		message = "provider turn failed"
	}
	if failErr := service.failTurn(request.Workspace.ID, request.Conversation.ID, request.Run.ID, message); failErr != nil {
		service.recordBackgroundFailure(request, "fail_turn_transition_failed", failErr)
	}
}
