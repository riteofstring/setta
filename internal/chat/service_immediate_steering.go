package chat

import (
	"context"
	"errors"
	"fmt"
	"setta/internal/workspace"
)

//lint:ignore U1000 HTTP handlers reach this structured-input method through internal/httpapi.ChatService.
func (service *Service) SendSteeringInputImmediately(workspaceID string, conversationID string, input *ChatInput) (ImmediateSteeringResult, error) {
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return ImmediateSteeringResult{}, err
	}
	if err := service.submitImmediateSteeringInput(workspaceSummary, workspaceID, conversationID, input); err != nil {
		return ImmediateSteeringResult{}, err
	}

	active, sourceRun, err := service.captureImmediateSteeringSource(workspaceID, conversationID)
	if err != nil {
		return ImmediateSteeringResult{}, err
	}
	if err := service.validateImmediateSteeringReplayInput(workspaceSummary, conversationID, sourceRun.ID); err != nil {
		return ImmediateSteeringResult{}, err
	}
	if err := service.cancelImmediateSteeringSource(workspaceID, conversationID, sourceRun.ID, active); err != nil {
		return ImmediateSteeringResult{}, err
	}
	cancelledRun, err := service.markTurnInterruptedForImmediate(workspaceID, conversationID, sourceRun.ID)
	if err != nil {
		return ImmediateSteeringResult{}, err
	}
	if cancelledRun.Status != RunStatusCancelled {
		return ImmediateSteeringResult{}, immediateSteeringConflict(fmt.Sprintf("source run %s is %s, not cancelled", cancelledRun.ID, cancelledRun.Status))
	}
	return service.startImmediateSteeringReplay(workspaceSummary, conversationID, sourceRun, cancelledRun)
}

func (service *Service) submitImmediateSteeringInput(workspaceSummary workspace.WorkspaceSummary, workspaceID string, conversationID string, input *ChatInput) error {
	if input == nil {
		return nil
	}
	prepared, err := prepareMessageEndpointInput(*input)
	if err != nil {
		return err
	}
	if err := service.ensureInputSupportedForConversation(context.Background(), workspaceSummary, workspaceID, conversationID, prepared); err != nil {
		return err
	}
	_, _, err = service.submitSteeringMessage(workspaceID, conversationID, prepared)
	return err
}

func (service *Service) cancelImmediateSteeringSource(workspaceID string, conversationID string, runID string, active activeTurn) error {
	err := service.harness.CancelTurn(context.Background(), CancelRequest{
		ConversationID: conversationID,
		RunID:          runID,
		WorkspaceID:    workspaceID,
	})
	if err != nil && !errors.Is(err, ErrTurnNotStarted) {
		return err
	}
	active.cancel()
	return nil
}
