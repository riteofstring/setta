package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/workspace"
)

func (service *Service) QueueUserMessage(workspaceID string, conversationID string, prompt string) (QueueMessageResult, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return QueueMessageResult{}, errors.New("prompt is required")
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return QueueMessageResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	message, run, err := service.persistQueuedMessageLocked(workspaceID, conversationID, prompt)
	if err != nil {
		return QueueMessageResult{}, err
	}
	if err := service.promoteQueuedIfIdleLocked(workspaceSummary, conversationID); err != nil {
		return QueueMessageResult{}, err
	}
	return service.queueMessageResultLocked(workspaceID, conversationID, message.ID, run.ID)
}

func (service *Service) persistQueuedMessageLocked(workspaceID string, conversationID string, prompt string) (ChatMessage, Run, error) {
	now := timestamp(service.now())
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	message, err := service.newUserMessage(workspaceID, conversationID, "", prompt, MessageDeliveryQueued, MessageStatusPending, now)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	run, err := service.newQueuedRun(workspaceID, conversationID, message, prompt)
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	message.RunID = run.ID
	conversation = updateConversationAfterPrompt(conversation, prompt, now)
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

func (service *Service) promoteQueuedIfIdleLocked(workspaceSummary workspace.WorkspaceSummary, conversationID string) error {
	if service.hasActiveTurnLocked(workspaceSummary.ID, conversationID) {
		return nil
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceSummary.ID, conversationID)
	if err != nil {
		return err
	}
	if _, ok, err := service.activeRunFromRunsLocked(workspaceSummary.ID, conversationID, runs); err != nil {
		return err
	} else if ok {
		return nil
	}
	return service.promoteNextQueuedRunLocked(workspaceSummary, conversationID, runs)
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

func (service *Service) SteerActiveRun(workspaceID string, conversationID string, prompt string) (SteerMessageResult, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return SteerMessageResult{}, errors.New("prompt is required")
	}
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return SteerMessageResult{}, err
	}

	message, run, threadID, turnID, err := service.persistSteeringMessage(workspaceID, conversationID, prompt)
	if err != nil {
		return SteerMessageResult{}, err
	}
	steerErr := service.harness.SteerTurn(context.Background(), SteerRequest{
		ConversationID: conversationID,
		RunID:          run.ID,
		Text:           prompt,
		ThreadID:       threadID,
		TurnID:         turnID,
		WorkspaceID:    workspaceID,
	})
	message, run, err = service.finishSteeringMessage(workspaceID, conversationID, message.ID, run.ID, steerErr)
	if err != nil {
		return SteerMessageResult{}, err
	}
	if steerErr != nil {
		return SteerMessageResult{}, steerErr
	}
	return service.steerMessageResult(workspaceID, conversationID, message, run)
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
	conversation, assistantMessage, err := service.persistQueuedPromotionLocked(workspaceSummary.ID, conversationID, run, userMessage)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.active[activeKey(workspaceSummary.ID, conversationID)] = activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		runID:            run.ID,
		workspaceID:      workspaceSummary.ID,
	}
	if err := service.publishQueuedPromotionLocked(workspaceSummary.ID, conversationID, userMessage, assistantMessage, run); err != nil {
		return err
	}
	request := TurnRequest{
		Workspace:    workspaceSummary,
		Conversation: conversation,
		Run:          run,
		Prompt:       promptFromMessage(userMessage),
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
	}
	go service.runHarnessTurn(ctx, request)
	return nil
}

func (service *Service) persistQueuedPromotionLocked(workspaceID string, conversationID string, run Run, userMessage ChatMessage) (Conversation, ChatMessage, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, err
	}
	now := timestamp(service.now())
	run.Status = RunStatusRunning
	run.StartedAt = now
	run.Error = ""
	userMessage.Status = MessageStatusComplete
	userMessage.UpdatedAt = now
	assistantMessage, err := service.newAssistantMessage(workspaceID, conversationID, run.ID, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, err
	}
	run.AssistantMessageID = assistantMessage.ID
	if err := service.saveQueuedPromotionLocked(workspaceID, conversation, userMessage, assistantMessage, run, now); err != nil {
		return Conversation{}, ChatMessage{}, err
	}
	return conversation, assistantMessage, nil
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
	return service.traceLocked(workspaceID, run.ID, "queued_turn_promoted", "Queued message promoted")
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

func (service *Service) persistSteeringMessage(workspaceID string, conversationID string, prompt string) (ChatMessage, Run, string, string, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	active, err := service.attachedActiveTurnLocked(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, Run{}, "", "", err
	}
	run, err := service.store.LoadRun(workspaceID, active.runID)
	if err != nil {
		return ChatMessage{}, Run{}, "", "", err
	}
	if run.Status != RunStatusRunning {
		return ChatMessage{}, Run{}, "", "", fmt.Errorf("active run %s is not running", run.ID)
	}
	message, err := service.saveSteeringMessageLocked(workspaceID, conversationID, prompt, run)
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

func (service *Service) saveSteeringMessageLocked(workspaceID string, conversationID string, prompt string, run Run) (ChatMessage, error) {
	now := timestamp(service.now())
	message, err := service.newUserMessage(workspaceID, conversationID, run.ID, prompt, MessageDeliverySteering, MessageStatusPending, now)
	if err != nil {
		return ChatMessage{}, err
	}
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return ChatMessage{}, err
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
	message.Status = MessageStatusComplete
	if steerErr != nil {
		message.Status = MessageStatusError
	}
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
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
