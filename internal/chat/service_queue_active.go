package chat

import "context"

func (service *Service) QueueUserInputForActiveRun(workspaceID string, conversationID string, input ChatInput) (QueueMessageResult, error) {
	input, err := prepareMessageEndpointInput(input)
	if err != nil {
		return QueueMessageResult{}, err
	}
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return QueueMessageResult{}, err
	}
	conversationForCapability, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return QueueMessageResult{}, err
	}
	if err := service.ensureImageInputSupported(context.Background(), workspaceSummary, conversationForCapability, input); err != nil {
		return QueueMessageResult{}, err
	}

	service.mu.Lock()
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		service.mu.Unlock()
		return QueueMessageResult{}, err
	}
	if _, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		service.mu.Unlock()
		return QueueMessageResult{}, err
	} else if !ok {
		service.mu.Unlock()
		return QueueMessageResult{}, ErrQueueRequiresActiveRun
	}
	message, run, err := service.persistQueuedMessageLocked(workspaceID, conversationID, input)
	service.mu.Unlock()
	if err != nil {
		return QueueMessageResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	return service.queueMessageResultLocked(workspaceID, conversationID, message.ID, run.ID)
}
