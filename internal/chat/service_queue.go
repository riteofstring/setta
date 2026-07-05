package chat

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/semanticcontext"
	"setta/internal/workspace"
)

func (service *Service) QueueUserInput(workspaceID string, conversationID string, input ChatInput) (QueueMessageResult, error) {
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
	message, run, err := service.persistQueuedMessageLocked(workspaceID, conversationID, input)
	service.mu.Unlock()
	if err != nil {
		return QueueMessageResult{}, err
	}
	if err := service.promoteQueuedIfIdle(workspaceSummary, conversationID); err != nil {
		return QueueMessageResult{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.queueMessageResultLocked(workspaceID, conversationID, message.ID, run.ID)
}

func (service *Service) EditQueuedInput(workspaceID string, conversationID string, messageID string, input ChatInput) (QueueEditResult, error) {
	input, err := prepareMessageEndpointInput(input)
	if err != nil {
		return QueueEditResult{}, err
	}
	workspaceSummary, err := service.validateMessageMutationRequest(workspaceID, conversationID, messageID)
	if err != nil {
		return QueueEditResult{}, err
	}
	if err := service.ensureInputSupportedForConversation(context.Background(), workspaceSummary, workspaceID, conversationID, input); err != nil {
		return QueueEditResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	return service.editQueuedInputLocked(workspaceID, conversationID, messageID, input)
}

func (service *Service) editQueuedInputLocked(workspaceID string, conversationID string, messageID string, input ChatInput) (QueueEditResult, error) {
	conversation, message, run, err := service.loadQueuedMessageRunForMutationLocked(workspaceID, conversationID, messageID)
	if err != nil {
		return QueueEditResult{}, err
	}
	now := timestamp(service.now())
	conversation.UpdatedAt = now
	parts, err := service.messagePartsFromInput(workspaceID, conversationID, input)
	if err != nil {
		return QueueEditResult{}, err
	}
	message.Parts = parts
	conversation, message, run, err = service.store.EditQueuedTurn(conversation, message, run)
	if err != nil {
		return QueueEditResult{}, err
	}
	if err := service.traceLocked(workspaceID, run.ID, "queued_message_edited", "Queued message edited"); err != nil {
		return QueueEditResult{}, err
	}
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, message)); err != nil {
		return QueueEditResult{}, err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return QueueEditResult{}, err
	}
	if err := service.publishQueueUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return QueueEditResult{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return QueueEditResult{}, err
	}
	return service.queueEditResultLocked(workspaceID, conversationID, message.ID, run.ID)
}

func (service *Service) RemoveQueuedMessage(workspaceID string, conversationID string, messageID string) (QueueRemoveResult, error) {
	workspaceSummary, err := service.validateMessageMutationRequest(workspaceID, conversationID, messageID)
	if err != nil {
		return QueueRemoveResult{}, err
	}

	service.mu.Lock()
	_, message, run, err := service.loadQueuedMessageRunForMutationLocked(workspaceID, conversationID, messageID)
	if err != nil {
		service.mu.Unlock()
		return QueueRemoveResult{}, err
	}
	_, removedRunID, err := service.store.DeleteQueuedTurn(workspaceID, conversationID, message.ID, timestamp(service.now()))
	if err != nil {
		service.mu.Unlock()
		return QueueRemoveResult{}, err
	}
	if _, err := service.events.Publish(NewMessageRemovedEvent(workspaceID, conversationID, run.ID, message.ID)); err != nil {
		service.mu.Unlock()
		return QueueRemoveResult{}, err
	}
	if err := service.publishQueueUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		service.mu.Unlock()
		return QueueRemoveResult{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		service.mu.Unlock()
		return QueueRemoveResult{}, err
	}
	service.mu.Unlock()

	if err := service.promoteQueuedIfIdle(workspaceSummary, conversationID); err != nil {
		return QueueRemoveResult{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.queueRemoveResultLocked(workspaceID, conversationID, message.ID, removedRunID)
}

func (service *Service) persistQueuedMessageLocked(workspaceID string, conversationID string, input ChatInput) (ChatMessage, Run, error) {
	now := timestamp(service.now())
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	message, err := service.newUserMessage(workspaceID, conversationID, "", input, MessageDeliveryQueued, MessageStatusPending, now)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	run, err := service.newQueuedRun(workspaceID, conversationID, message)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	message.RunID = run.ID
	conversation = updateConversationAfterPrompt(conversation, messagePromptSummary(message), now)
	records, err := service.store.CreateQueuedTurn(QueuedTurnRecords{
		Conversation: conversation,
		Run:          run,
		UserMessage:  message,
	})
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	conversation = records.Conversation
	message = records.UserMessage
	run = records.Run
	if err := service.traceLocked(workspaceID, run.ID, "message_queued", "Message queued"); err != nil {
		return ChatMessage{}, Run{}, err
	}
	if err := service.publishQueueEventsLocked(workspaceID, conversationID, message, run); err != nil {
		return ChatMessage{}, Run{}, err
	}
	return message, run, nil
}

func (service *Service) loadQueuedMessageRunForMutationLocked(workspaceID string, conversationID string, messageID string) (Conversation, ChatMessage, Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if conversation.WorkspaceID != workspaceID {
		return Conversation{}, ChatMessage{}, Run{}, fmt.Errorf("conversation %s belongs to workspace %s, not %s", conversationID, conversation.WorkspaceID, workspaceID)
	}
	message, ok, err := service.store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if !ok {
		return Conversation{}, ChatMessage{}, Run{}, queuedMessageConflict(messageID, "message was not found")
	}
	if err := validateQueuedMutationMessage(message); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	run, err := service.store.LoadRun(workspaceID, message.RunID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if err := validateQueuedMutationRun(message, run); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	return conversation, message, run, nil
}

func validateQueuedMutationMessage(message ChatMessage) error {
	if message.Role != RoleUser {
		return fmt.Errorf("queued message %s role = %s, want user", message.ID, message.Role)
	}
	if message.Delivery != MessageDeliveryQueued {
		return queuedMessageConflict(message.ID, fmt.Sprintf("delivery is %s", message.Delivery))
	}
	if message.Status != MessageStatusPending {
		return queuedMessageConflict(message.ID, fmt.Sprintf("status is %s", message.Status))
	}
	if message.RunID == "" {
		return fmt.Errorf("queued message %s runId is required", message.ID)
	}
	return nil
}

func validateQueuedMutationRun(message ChatMessage, run Run) error {
	if run.Status != RunStatusQueued {
		return queuedMessageConflict(message.ID, fmt.Sprintf("run status is %s", run.Status))
	}
	if run.TriggerMessageID != message.ID {
		return fmt.Errorf("queued run %s trigger message = %s, want %s", run.ID, run.TriggerMessageID, message.ID)
	}
	if run.AssistantMessageID != "" {
		return fmt.Errorf("queued run %s assistantMessageId must be empty", run.ID)
	}
	if message.RunID != run.ID {
		return fmt.Errorf("queued message %s runId = %s, want %s", message.ID, message.RunID, run.ID)
	}
	return nil
}

func (service *Service) queueMessageResultLocked(workspaceID string, conversationID string, messageID string, runID string) (QueueMessageResult, error) {
	message, ok, err := service.store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return QueueMessageResult{}, err
	}
	if !ok {
		return QueueMessageResult{}, fmt.Errorf("queued message was not found: %s", messageID)
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return QueueMessageResult{}, err
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return QueueMessageResult{}, err
	}
	queue, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return QueueMessageResult{}, err
	}
	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return QueueMessageResult{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return QueueMessageResult{}, err
	}
	return QueueMessageResult{Conversation: conversation, Page: page, Queue: queue, Run: run, UserMessage: message}, nil
}

func (service *Service) queueEditResultLocked(workspaceID string, conversationID string, messageID string, runID string) (QueueEditResult, error) {
	message, ok, err := service.store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return QueueEditResult{}, err
	}
	if !ok {
		return QueueEditResult{}, fmt.Errorf("queued message was not found: %s", messageID)
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return QueueEditResult{}, err
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return QueueEditResult{}, err
	}
	queue, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return QueueEditResult{}, err
	}
	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return QueueEditResult{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return QueueEditResult{}, err
	}
	return QueueEditResult{Conversation: conversation, Page: page, Queue: queue, Run: run, UserMessage: message}, nil
}

func (service *Service) queueRemoveResultLocked(workspaceID string, conversationID string, messageID string, runID string) (QueueRemoveResult, error) {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return QueueRemoveResult{}, err
	}
	queue, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return QueueRemoveResult{}, err
	}
	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return QueueRemoveResult{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return QueueRemoveResult{}, err
	}
	return QueueRemoveResult{Conversation: conversation, Page: page, Queue: queue, RemovedMessageID: messageID, RemovedRunID: runID}, nil
}

func (service *Service) SteerActiveRunInput(workspaceID string, conversationID string, input ChatInput) (SteerMessageResult, error) {
	return service.steerActiveRunInput(workspaceID, conversationID, "", input)
}

func (service *Service) SteerActiveRunInputByID(workspaceID string, conversationID string, runID string, input ChatInput) (SteerMessageResult, error) {
	if err := validateStorageID("run id", runID); err != nil {
		return SteerMessageResult{}, err
	}
	return service.steerActiveRunInput(workspaceID, conversationID, runID, input)
}

func (service *Service) steerActiveRunInput(workspaceID string, conversationID string, expectedRunID string, input ChatInput) (SteerMessageResult, error) {
	input, err := prepareMessageEndpointInput(input)
	if err != nil {
		return SteerMessageResult{}, err
	}
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return SteerMessageResult{}, err
	}
	conversationForCapability, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return SteerMessageResult{}, err
	}
	if err := service.ensureImageInputSupported(context.Background(), workspaceSummary, conversationForCapability, input); err != nil {
		return SteerMessageResult{}, err
	}

	message, run, err := service.submitSteeringMessageForRun(workspaceID, conversationID, expectedRunID, input)
	if err != nil {
		return SteerMessageResult{}, err
	}
	return service.steerMessageResult(workspaceID, conversationID, message, run)
}

func (service *Service) submitSteeringMessage(workspaceID string, conversationID string, input ChatInput) (ChatMessage, Run, error) {
	return service.submitSteeringMessageForRun(workspaceID, conversationID, "", input)
}

func (service *Service) submitSteeringMessageForRun(workspaceID string, conversationID string, expectedRunID string, input ChatInput) (ChatMessage, Run, error) {
	message, run, threadID, turnID, err := service.persistSteeringMessageForRun(workspaceID, conversationID, expectedRunID, input)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	semanticDelivery, err := service.compileSemanticContextForChatTurn(context.Background(), semanticcontext.TriggerSteering, conversation, run, message.ID, messageText(message))
	if err != nil {
		if _, _, finishErr := service.finishSteeringMessage(workspaceID, conversationID, message.ID, run.ID, err); finishErr != nil {
			return ChatMessage{}, Run{}, finishErr
		}
		return ChatMessage{}, Run{}, err
	}
	deliveryInput, err := service.deliveryInputFromMessage(workspaceID, conversationID, message)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	steerErr := service.harness.SteerTurn(context.Background(), SteerRequest{
		ConversationID:  conversationID,
		RunID:           run.ID,
		SemanticContext: semanticDelivery,
		Input:           deliveryInput,
		ThreadID:        threadID,
		TurnID:          turnID,
		WorkspaceID:     workspaceID,
	})
	message, run, err = service.finishSteeringMessage(workspaceID, conversationID, message.ID, run.ID, steerErr)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	if steerErr != nil {
		return ChatMessage{}, Run{}, steerErr
	}
	return message, run, nil
}

func (service *Service) captureImmediateSteeringSource(workspaceID string, conversationID string) (activeTurn, Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	active, err := service.attachedActiveTurnLocked(workspaceID, conversationID)
	if err != nil {
		return activeTurn{}, Run{}, err
	}
	run, err := service.store.LoadRun(workspaceID, active.runID)
	if err != nil {
		return activeTurn{}, Run{}, err
	}
	if run.Status != RunStatusRunning {
		return activeTurn{}, Run{}, immediateSteeringConflict(fmt.Sprintf("source run %s is %s, not running", run.ID, run.Status))
	}
	pending, err := service.pendingSteeringMessagesForRunLocked(workspaceID, conversationID, run.ID)
	if err != nil {
		return activeTurn{}, Run{}, err
	}
	if len(pending) == 0 {
		return activeTurn{}, Run{}, immediateSteeringConflict("no pending steering messages to send immediately")
	}
	return active, run, nil
}

func (service *Service) validateImmediateSteeringReplayInput(workspaceSummary workspace.WorkspaceSummary, conversationID string, runID string) error {
	workspaceID := workspaceSummary.ID
	conversation, replayInput, err := service.immediateSteeringReplayInputSnapshot(workspaceID, conversationID, runID)
	if err != nil {
		return err
	}
	return service.ensureImageInputSupported(context.Background(), workspaceSummary, conversation, replayInput)
}

func (service *Service) immediateSteeringReplayInputSnapshot(workspaceID string, conversationID string, runID string) (Conversation, ChatInput, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	_, replayInput, err := service.pendingSteeringReplayInputLocked(workspaceID, conversationID, runID)
	if err != nil {
		return Conversation{}, ChatInput{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatInput{}, err
	}
	return conversation, replayInput, nil
}

func (service *Service) markTurnInterruptedForImmediate(workspaceID string, conversationID string, runID string) (Run, error) {
	return service.markTurnCancelledWithOptions(workspaceID, conversationID, runID, "turn interrupted for immediate steering", "immediate_steering_interrupted", "Turn interrupted for immediate steering", false)
}

func (service *Service) startImmediateSteeringReplay(workspaceSummary workspace.WorkspaceSummary, conversationID string, sourceRun Run, cancelledRun Run) (ImmediateSteeringResult, error) {
	workspaceID := workspaceSummary.ID
	service.mu.Lock()
	key := activeKey(workspaceID, conversationID)
	runs, err := service.immediateReplayRunsLocked(workspaceID, conversationID, key)
	if err != nil {
		service.mu.Unlock()
		return ImmediateSteeringResult{}, err
	}
	pending, replayInput, err := service.pendingSteeringReplayInputLocked(workspaceID, conversationID, cancelledRun.ID)
	if err != nil {
		service.mu.Unlock()
		return ImmediateSteeringResult{}, err
	}
	now := timestamp(service.now())
	conversation, userMessage, assistantMessage, run, err := service.persistImmediateSteeringReplayLocked(workspaceID, conversationID, sourceRun, pending, replayInput, now)
	if err != nil {
		service.mu.Unlock()
		return ImmediateSteeringResult{}, err
	}
	ingest, err := service.newTranscriptIngestLocked(workspaceID, run)
	if err != nil {
		service.mu.Unlock()
		return ImmediateSteeringResult{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.activateTurnLocked(workspaceID, conversationID, activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		transcript:       ingest,
	}, run)
	if err := service.publishImmediateSteeringReplayLocked(workspaceID, conversationID, userMessage, assistantMessage, run, pending); err != nil {
		return service.abortImmediateSteeringReplayStartLocked(workspaceID, conversationID, key, run.ID, cancel, err)
	}
	deliveryInput, err := service.deliveryInputFromMessage(workspaceID, conversationID, userMessage)
	if err != nil {
		return service.abortImmediateSteeringReplayStartLocked(workspaceID, conversationID, key, run.ID, cancel, err)
	}
	queue, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return service.abortImmediateSteeringReplayStartLocked(workspaceID, conversationID, key, run.ID, cancel, err)
	}
	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return service.abortImmediateSteeringReplayStartLocked(workspaceID, conversationID, key, run.ID, cancel, err)
	}
	reservation, err := service.reserveHarnessTaskLocked()
	if err != nil {
		return service.abortImmediateSteeringReplayStartLocked(workspaceID, conversationID, key, run.ID, cancel, err)
	}
	ids := messageIDs(pending)
	service.mu.Unlock()

	if err := service.compileAndLaunchImmediateSteeringReplayTurn(workspaceSummary, conversation, run, userMessage, deliveryInput, ctx, cancel, reservation); err != nil {
		return ImmediateSteeringResult{}, err
	}
	return ImmediateSteeringResult{
		ActiveRun:                  run,
		CancelledRun:               cancelledRun,
		Conversation:               conversation,
		Page:                       page,
		Queue:                      queue,
		ReplayedSteeringMessageIDs: ids,
	}, nil
}

func (service *Service) compileAndLaunchImmediateSteeringReplayTurn(workspaceSummary workspace.WorkspaceSummary, conversation Conversation, run Run, userMessage ChatMessage, deliveryInput ChatInput, ctx context.Context, cancel context.CancelFunc, reservation harnessTaskReservation) error {
	semanticDelivery, err := service.compileSemanticContextForChatTurn(context.Background(), semanticcontext.TriggerImmediateSteeringReplay, conversation, run, userMessage.ID, messageText(userMessage))
	if err != nil {
		cancel()
		if failErr := service.failTurn(workspaceSummary.ID, conversation.ID, run.ID, err.Error()); failErr != nil {
			reservation.release()
			return failErr
		}
		reservation.release()
		return err
	}
	request := TurnRequest{
		Workspace:       workspaceSummary,
		Conversation:    conversation,
		Run:             run,
		Input:           deliveryInput,
		SemanticContext: semanticDelivery,
		ThreadRef:       latestHarnessRef(conversation, HarnessCodex),
	}
	service.launchHarnessTurn(reservation, ctx, request)
	return nil
}

func (service *Service) abortImmediateSteeringReplayStartLocked(workspaceID string, conversationID string, key string, runID string, cancel context.CancelFunc, startErr error) (ImmediateSteeringResult, error) {
	cancel()
	service.deleteActiveTurnLocked(key)
	service.mu.Unlock()
	if failErr := service.failTurn(workspaceID, conversationID, runID, startErr.Error()); failErr != nil {
		return ImmediateSteeringResult{}, failErr
	}
	return ImmediateSteeringResult{}, startErr
}

func (service *Service) immediateReplayRunsLocked(workspaceID string, conversationID string, key string) ([]Run, error) {
	if active, ok := service.active[key]; ok {
		return nil, immediateSteeringConflict(fmt.Sprintf("another active run appeared before replay: %s", active.runID))
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	if run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return nil, err
	} else if ok {
		return nil, immediateSteeringConflict(fmt.Sprintf("another running run appeared before replay: %s", run.ID))
	}
	return runs, nil
}

func (service *Service) pendingSteeringReplayInputLocked(workspaceID string, conversationID string, runID string) ([]ChatMessage, ChatInput, error) {
	pending, err := service.pendingSteeringMessagesForRunLocked(workspaceID, conversationID, runID)
	if err != nil {
		return nil, ChatInput{}, err
	}
	if len(pending) == 0 {
		return nil, ChatInput{}, immediateSteeringConflict("pending steering was already committed before replay")
	}
	replayInput, err := mergedSteeringInput(pending)
	if err != nil {
		return nil, ChatInput{}, err
	}
	if err := validateChatInput(replayInput); err != nil {
		return nil, ChatInput{}, immediateSteeringConflict(err.Error())
	}
	return pending, replayInput, nil
}

func (service *Service) persistImmediateSteeringReplayLocked(workspaceID string, conversationID string, cancelledRun Run, pending []ChatMessage, replayInput ChatInput, now string) (Conversation, ChatMessage, ChatMessage, Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	userMessage, err := service.newUserMessage(workspaceID, conversationID, "", replayInput, MessageDeliveryNormal, MessageStatusComplete, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	run, assistantMessage, err := service.newRunAndAssistantMessage(workspaceID, conversationID, userMessage, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	userMessage.RunID = run.ID
	conversation = updateConversationAfterPrompt(conversation, messagePromptSummary(userMessage), now)
	records, err := service.store.ReplayPendingSteeringAsTurn(PendingSteeringReplayRecords{
		ActiveRun:               cancelledRun,
		AssistantMessage:        assistantMessage,
		Conversation:            conversation,
		PendingSteeringMessages: pending,
		Run:                     run,
		UserMessage:             userMessage,
	})
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.removeSteeringTranscriptBlocksLocked(workspaceID, records.PendingSteeringMessages); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.traceLocked(workspaceID, records.Run.ID, "immediate_steering_replayed", "Pending steering replayed immediately"); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	return records.Conversation, records.UserMessage, records.AssistantMessage, records.Run, nil
}

func (service *Service) publishImmediateSteeringReplayLocked(workspaceID string, conversationID string, userMessage ChatMessage, assistantMessage ChatMessage, run Run, removed []ChatMessage) error {
	if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, run.ID, userMessage)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, run.ID, assistantMessage)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.publishActiveRunLivenessLocked(workspaceID, conversationID, run.ID); err != nil {
		return err
	}
	for _, message := range removed {
		if _, err := service.events.Publish(NewMessageRemovedEvent(workspaceID, conversationID, message.RunID, message.ID)); err != nil {
			return err
		}
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID)
}

func mergedSteeringInput(messages []ChatMessage) (ChatInput, error) {
	converted := make([]ChatInput, 0, len(messages))
	hasImage := false
	for _, message := range messages {
		input, err := inputFromMessage(message)
		if err != nil {
			return ChatInput{}, err
		}
		if chatInputImageCount(input) > 0 {
			hasImage = true
		}
		converted = append(converted, input)
	}
	if !hasImage {
		parts := make([]string, 0, len(messages))
		for _, input := range converted {
			text := strings.TrimSpace(chatInputText(input))
			if text != "" {
				parts = append(parts, text)
			}
		}
		return TextChatInput(strings.Join(parts, "\n")), nil
	}
	inputParts := []ChatInputPart{}
	for _, input := range converted {
		for _, part := range input.Parts {
			inputParts = append(inputParts, part)
		}
	}
	return normalizeChatInput(ChatInput{Parts: inputParts}), nil
}

func messageIDs(messages []ChatMessage) []string {
	ids := make([]string, 0, len(messages))
	for _, message := range messages {
		ids = append(ids, message.ID)
	}
	return ids
}

func (service *Service) steerMessageResult(workspaceID string, conversationID string, message ChatMessage, run Run) (SteerMessageResult, error) {
	page, err := service.LoadMessagePage(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return SteerMessageResult{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return SteerMessageResult{}, err
	}
	return SteerMessageResult{Conversation: conversation, Page: page, Run: run, UserMessage: message}, nil
}

func (service *Service) publishQueueEventsLocked(workspaceID string, conversationID string, message ChatMessage, run Run) error {
	if _, err := service.events.Publish(NewMessageQueuedEvent(workspaceID, conversationID, run.ID, message, run)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.publishActiveRunLivenessLocked(workspaceID, conversationID, run.ID); err != nil {
		return err
	}
	if err := service.publishQueueUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID)
}

func (service *Service) publishQueueUpdatedLocked(workspaceID string, conversationID string, runID string) error {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	queue, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return err
	}
	_, err = service.events.Publish(NewQueueUpdatedEvent(workspaceID, conversationID, runID, queue))
	return err
}

func (service *Service) hasActiveTurnLocked(workspaceID string, conversationID string) bool {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	return ok && active.workspaceID == workspaceID
}

func (service *Service) promoteNextQueuedRunLocked(workspaceSummary workspace.WorkspaceSummary, conversationID string, runs []Run) error {
	run, userMessage, ok, err := service.nextQueuedRunFromRunsLocked(workspaceSummary.ID, conversationID, runs)
	if err != nil || !ok {
		return err
	}
	conversation, assistantMessage, run, err := service.persistQueuedPromotionLocked(workspaceSummary.ID, conversationID, run, userMessage)
	if err != nil {
		return err
	}
	if err := service.startPostCommitHarnessTurnLocked(postCommitHarnessTurnStart{
		Workspace:        workspaceSummary,
		Conversation:     conversation,
		Run:              run,
		AssistantMessage: assistantMessage,
		Publish: func() error {
			if err := service.traceLocked(workspaceSummary.ID, run.ID, "queued_turn_promoted", "Queued message promoted"); err != nil {
				return err
			}
			return service.publishQueuedPromotionLocked(workspaceSummary.ID, conversationID, userMessage, assistantMessage, run)
		},
		DeliveryInput: func() (ChatInput, error) {
			return service.deliveryInputFromMessage(workspaceSummary.ID, conversationID, userMessage)
		},
	}); err != nil {
		return err
	}
	return nil
}

func (service *Service) persistQueuedPromotionLocked(workspaceID string, conversationID string, run Run, userMessage ChatMessage) (Conversation, ChatMessage, Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	now := timestamp(service.now())
	run.Status = RunStatusRunning
	run.StartedAt = now
	run.Error = ""
	userMessage.Status = MessageStatusComplete
	userMessage.UpdatedAt = now
	assistantMessage, err := service.newAssistantMessage(workspaceID, conversationID, run.ID, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	run.AssistantMessageID = assistantMessage.ID
	if err := service.saveQueuedPromotionLocked(workspaceID, conversation, userMessage, assistantMessage, run, now); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	return conversation, assistantMessage, run, nil
}

func (service *Service) saveQueuedPromotionLocked(workspaceID string, conversation Conversation, userMessage ChatMessage, assistantMessage ChatMessage, run Run, now string) error {
	conversation.UpdatedAt = now
	_, err := service.store.PromoteQueuedTurn(QueuedPromotionRecords{
		AssistantMessage: assistantMessage,
		Conversation:     conversation,
		Run:              run,
		UserMessage:      userMessage,
	})
	if err != nil {
		return err
	}
	return nil
}

func (service *Service) publishQueuedPromotionLocked(workspaceID string, conversationID string, userMessage ChatMessage, assistantMessage ChatMessage, run Run) error {
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, userMessage)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, run.ID, assistantMessage)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.publishQueueUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID)
}

func (service *Service) persistSteeringMessageForRun(workspaceID string, conversationID string, expectedRunID string, input ChatInput) (ChatMessage, Run, string, string, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	active, err := service.attachedActiveTurnLocked(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, Run{}, "", "", err
	}
	if expectedRunID != "" && active.runID != expectedRunID {
		return ChatMessage{}, Run{}, "", "", fmt.Errorf("active run %s does not match requested run %s", active.runID, expectedRunID)
	}
	run, err := service.store.LoadRun(workspaceID, active.runID)
	if err != nil {
		return ChatMessage{}, Run{}, "", "", err
	}
	if run.Status != RunStatusRunning {
		return ChatMessage{}, Run{}, "", "", fmt.Errorf("active run %s is not running", run.ID)
	}
	message, err := service.saveSteeringMessageLocked(workspaceID, conversationID, input, run)
	if err != nil {
		return ChatMessage{}, Run{}, "", "", err
	}
	return message, run, active.threadID, active.turnID, nil
}

func (service *Service) attachedActiveTurnLocked(workspaceID string, conversationID string) (activeTurn, error) {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok || active.workspaceID != workspaceID {
		runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
		if err != nil {
			return activeTurn{}, err
		}
		run, exists, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
		if err != nil {
			return activeTurn{}, err
		}
		if exists {
			return activeTurn{}, fmt.Errorf("active run %s is not attached to this backend process", run.ID)
		}
		return activeTurn{}, fmt.Errorf("conversation has no active run: %s", conversationID)
	}
	if active.threadID == "" || active.turnID == "" {
		return activeTurn{}, ErrTurnNotStarted
	}
	return active, nil
}

func (service *Service) saveSteeringMessageLocked(workspaceID string, conversationID string, input ChatInput, run Run) (ChatMessage, error) {
	now := timestamp(service.now())
	message, err := service.newUserMessage(workspaceID, conversationID, run.ID, input, MessageDeliverySteering, MessageStatusPending, now)
	if err != nil {
		return ChatMessage{}, err
	}
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return ChatMessage{}, err
	}
	// Assign the steering message a run-local transcript ordinal at the moment it
	// is sent so it interleaves with the assistant/activity blocks already emitted.
	if active, ok := service.active[activeKey(workspaceID, conversationID)]; ok && active.runID == run.ID && active.transcript != nil {
		if err := service.appendUserMessageBlockLocked(workspaceID, active.transcript, message); err != nil {
			return ChatMessage{}, err
		}
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return ChatMessage{}, err
	}
	if _, err := service.events.Publish(NewMessageSteeringSentEvent(workspaceID, conversationID, run.ID, message, run)); err != nil {
		return ChatMessage{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return ChatMessage{}, err
	}
	return message, nil
}

func (service *Service) finishSteeringMessage(workspaceID string, conversationID string, messageID string, runID string, steerErr error) (ChatMessage, Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	message, ok, err := service.store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	if !ok {
		return ChatMessage{}, Run{}, fmt.Errorf("steering message was not found: %s", messageID)
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	message.UpdatedAt = timestamp(service.now())
	if steerErr != nil {
		message.Status = MessageStatusError
	}
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return ChatMessage{}, Run{}, err
	}
	if err := service.syncUserMessageBlockLocked(workspaceID, conversationID, run.ID, message); err != nil {
		return ChatMessage{}, Run{}, err
	}
	traceMessage := "Steering message sent"
	if steerErr != nil {
		traceMessage = steerErr.Error()
	}
	if err := service.traceLocked(workspaceID, run.ID, "steering_message_sent", traceMessage); err != nil {
		return ChatMessage{}, Run{}, err
	}
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, message)); err != nil {
		return ChatMessage{}, Run{}, err
	}
	return message, run, nil
}

func (service *Service) pendingSteeringMessagesForRunLocked(workspaceID string, conversationID string, runID string) ([]ChatMessage, error) {
	messages, err := service.store.LoadMessages(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	pending := []ChatMessage{}
	for _, message := range messages {
		if message.RunID == runID && message.Role == RoleUser && message.Delivery == MessageDeliverySteering && message.Status == MessageStatusPending {
			pending = append(pending, message)
		}
	}
	return pending, nil
}

func (service *Service) markPendingSteeringCommitted(workspaceID string, conversationID string, runID string, text string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	pending, err := service.pendingSteeringMessagesForRunLocked(workspaceID, conversationID, runID)
	if err != nil {
		return err
	}
	for _, message := range pending {
		if promptFromMessage(message) != text {
			continue
		}
		message.Status = MessageStatusComplete
		message.UpdatedAt = timestamp(service.now())
		if err := service.store.SaveMessage(workspaceID, message); err != nil {
			return err
		}
		if err := service.ensureCommittedSteeringMessageBlockLocked(workspaceID, conversationID, runID, message); err != nil {
			return err
		}
		if err := service.traceLocked(workspaceID, runID, "steering_message_committed", "Steering message committed by provider"); err != nil {
			return err
		}
		if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, runID, message)); err != nil {
			return err
		}
		return service.publishFreshProviderEventLivenessLocked(workspaceID, conversationID, runID)
	}
	return nil
}

func (service *Service) ensureCommittedSteeringMessageBlockLocked(workspaceID string, conversationID string, runID string, message ChatMessage) error {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok || active.runID != runID || active.transcript == nil {
		return nil
	}
	if _, exists := active.transcript.userMessageBlockByID[message.ID]; exists {
		return service.syncUserMessageBlockLocked(workspaceID, conversationID, runID, message)
	}
	return service.appendUserMessageBlockLocked(workspaceID, active.transcript, message)
}

func (service *Service) markPendingSteeringMessagesLocked(workspaceID string, conversationID string, runID string, status MessageStatus) ([]ChatMessage, error) {
	pending, err := service.pendingSteeringMessagesForRunLocked(workspaceID, conversationID, runID)
	if err != nil {
		return nil, err
	}
	now := timestamp(service.now())
	for index := range pending {
		pending[index].Status = status
		pending[index].UpdatedAt = now
		if err := service.store.SaveMessage(workspaceID, pending[index]); err != nil {
			return nil, err
		}
		if err := service.syncUserMessageBlockLocked(workspaceID, conversationID, runID, pending[index]); err != nil {
			return nil, err
		}
	}
	return pending, nil
}
