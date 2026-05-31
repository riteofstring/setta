package chat

import (
	"context"
	"errors"
	"fmt"
)

func (service *Service) runHarnessTurn(ctx context.Context, request TurnRequest) {
	sink := turnSink{service: service, workspaceID: request.Workspace.ID, conversationID: request.Conversation.ID, runID: request.Run.ID}
	completion, err := service.harness.StartTurn(ctx, request, sink)
	if err != nil {
		service.handleHarnessTurnError(ctx, request, err)
		return
	}
	service.handleHarnessTurnCompletion(request, completion)
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
