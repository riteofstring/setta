package chat

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type RunningTurnRecords struct {
	Conversation     Conversation
	UserMessage      ChatMessage
	AssistantMessage ChatMessage
	Run              Run
}

type QueuedTurnRecords struct {
	Conversation Conversation
	UserMessage  ChatMessage
	Run          Run
}

type QueuedPromotionRecords struct {
	Conversation     Conversation
	UserMessage      ChatMessage
	AssistantMessage ChatMessage
	Run              Run
}

type PendingSteeringReplayRecords struct {
	Conversation            Conversation
	ActiveRun               Run
	PendingSteeringMessages []ChatMessage
	UserMessage             ChatMessage
	AssistantMessage        ChatMessage
	Run                     Run
}

type TerminalTurnRecords struct {
	AssistantMessage ChatMessage
	Run              Run
}

func (store *Store) CreateRunningTurn(records RunningTurnRecords) (RunningTurnRecords, error) {
	if err := validateRunningTurnRecords(records); err != nil {
		return RunningTurnRecords{}, err
	}
	workspaceID := records.Run.WorkspaceID
	if err := store.SaveMessage(workspaceID, records.UserMessage); err != nil {
		return RunningTurnRecords{}, err
	}
	if err := store.SaveRun(records.Run); err != nil {
		return RunningTurnRecords{}, err
	}
	if err := store.SaveMessage(workspaceID, records.AssistantMessage); err != nil {
		return RunningTurnRecords{}, err
	}
	if err := store.SaveConversation(records.Conversation); err != nil {
		return RunningTurnRecords{}, err
	}
	return records, nil
}

func (store *Store) CreateQueuedTurn(records QueuedTurnRecords) (QueuedTurnRecords, error) {
	if err := validateQueuedTurnRecords(records); err != nil {
		return QueuedTurnRecords{}, err
	}
	workspaceID := records.Run.WorkspaceID
	if err := store.SaveRun(records.Run); err != nil {
		return QueuedTurnRecords{}, err
	}
	if err := store.SaveMessage(workspaceID, records.UserMessage); err != nil {
		return QueuedTurnRecords{}, err
	}
	if err := store.SaveConversation(records.Conversation); err != nil {
		return QueuedTurnRecords{}, err
	}
	return records, nil
}

func (store *Store) PromoteQueuedTurn(records QueuedPromotionRecords) (QueuedPromotionRecords, error) {
	if err := validateQueuedPromotionRecords(records); err != nil {
		return QueuedPromotionRecords{}, err
	}
	workspaceID := records.Run.WorkspaceID
	if err := store.SaveRun(records.Run); err != nil {
		return QueuedPromotionRecords{}, err
	}
	if err := store.SaveMessage(workspaceID, records.UserMessage); err != nil {
		return QueuedPromotionRecords{}, err
	}
	if err := store.SaveMessage(workspaceID, records.AssistantMessage); err != nil {
		return QueuedPromotionRecords{}, err
	}
	if err := store.SaveConversation(records.Conversation); err != nil {
		return QueuedPromotionRecords{}, err
	}
	return records, nil
}

func (store *Store) EditQueuedTurn(conversation Conversation, message ChatMessage, run Run, prompt string) (Conversation, ChatMessage, Run, error) {
	if err := validateQueuedEditRecords(conversation, message, run, prompt); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	now := conversation.UpdatedAt
	message.UpdatedAt = now
	message.Parts[0].Text = prompt
	run.PromptSummary = summarize(prompt, maxPromptSummary)
	workspaceID := run.WorkspaceID
	if err := store.SaveMessage(workspaceID, message); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if err := store.SaveRun(run); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if err := store.SaveConversation(conversation); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	return conversation, message, run, nil
}

func (store *Store) DeleteQueuedTurn(workspaceID string, conversationID string, messageID string, now string) (Conversation, string, error) {
	conversation, message, run, err := store.loadQueuedTurnForDelete(workspaceID, conversationID, messageID)
	if err != nil {
		return Conversation{}, "", err
	}
	conversation.UpdatedAt = now
	if err := store.removeMessageFile(workspaceID, message); err != nil {
		return Conversation{}, "", err
	}
	if err := store.removeRunFile(workspaceID, run.ID); err != nil {
		return Conversation{}, "", err
	}
	if err := store.removeRunDirectory(workspaceID, run.ID); err != nil {
		return Conversation{}, "", err
	}
	if err := store.SaveConversation(conversation); err != nil {
		return Conversation{}, "", err
	}
	return conversation, run.ID, nil
}

func (store *Store) ReplayPendingSteeringAsTurn(records PendingSteeringReplayRecords) (PendingSteeringReplayRecords, error) {
	if err := validatePendingSteeringReplayRecords(records); err != nil {
		return PendingSteeringReplayRecords{}, err
	}
	workspaceID := records.Run.WorkspaceID
	if err := store.SaveMessage(workspaceID, records.UserMessage); err != nil {
		return PendingSteeringReplayRecords{}, err
	}
	if err := store.SaveRun(records.Run); err != nil {
		return PendingSteeringReplayRecords{}, err
	}
	if err := store.SaveMessage(workspaceID, records.AssistantMessage); err != nil {
		return PendingSteeringReplayRecords{}, err
	}
	if err := store.SaveConversation(records.Conversation); err != nil {
		return PendingSteeringReplayRecords{}, err
	}
	for _, message := range records.PendingSteeringMessages {
		if err := store.removeMessageFile(workspaceID, message); err != nil {
			return PendingSteeringReplayRecords{}, err
		}
	}
	return records, nil
}

func (store *Store) CompleteTurn(records TerminalTurnRecords) (TerminalTurnRecords, error) {
	if err := validateTerminalTurnRecords(records, RunStatusCompleted, MessageStatusComplete); err != nil {
		return TerminalTurnRecords{}, err
	}
	return store.saveTerminalTurn(records)
}

func (store *Store) FailTurn(records TerminalTurnRecords) (TerminalTurnRecords, error) {
	if err := validateTerminalTurnRecords(records, RunStatusFailed, MessageStatusError); err != nil {
		return TerminalTurnRecords{}, err
	}
	return store.saveTerminalTurn(records)
}

func (store *Store) CancelTurn(records TerminalTurnRecords) (TerminalTurnRecords, error) {
	if err := validateTerminalTurnRecords(records, RunStatusCancelled, MessageStatusCancelled); err != nil {
		return TerminalTurnRecords{}, err
	}
	return store.saveTerminalTurn(records)
}

func (store *Store) SubmitApproval(run Run) (Run, error) {
	if err := validateRun(run); err != nil {
		return Run{}, err
	}
	if run.PendingApproval != nil {
		return Run{}, fmt.Errorf("run %s still has pending approval after submit", run.ID)
	}
	if err := store.SaveRun(run); err != nil {
		return Run{}, err
	}
	return run, nil
}

func (store *Store) ResolveApproval(run Run) (Run, error) {
	if err := validateRun(run); err != nil {
		return Run{}, err
	}
	if run.PendingApproval != nil {
		return Run{}, fmt.Errorf("run %s still has pending approval after resolve", run.ID)
	}
	if err := store.SaveRun(run); err != nil {
		return Run{}, err
	}
	return run, nil
}

func (store *Store) saveTerminalTurn(records TerminalTurnRecords) (TerminalTurnRecords, error) {
	workspaceID := records.Run.WorkspaceID
	if err := store.SaveMessage(workspaceID, records.AssistantMessage); err != nil {
		return TerminalTurnRecords{}, err
	}
	if err := store.SaveRun(records.Run); err != nil {
		return TerminalTurnRecords{}, err
	}
	return records, nil
}

func validateRunningTurnRecords(records RunningTurnRecords) error {
	if records.Run.Status != RunStatusRunning {
		return fmt.Errorf("create running turn run %s status = %s, want running", records.Run.ID, records.Run.Status)
	}
	if records.UserMessage.Role != RoleUser {
		return fmt.Errorf("create running turn trigger message %s role = %s, want user", records.UserMessage.ID, records.UserMessage.Role)
	}
	if records.AssistantMessage.Role != RoleAssistant {
		return fmt.Errorf("create running turn assistant message %s role = %s, want assistant", records.AssistantMessage.ID, records.AssistantMessage.Role)
	}
	return validateTurnRecordLinks(records.Conversation, records.UserMessage, records.AssistantMessage, records.Run)
}

func validateQueuedTurnRecords(records QueuedTurnRecords) error {
	if err := validateConversation(records.Conversation); err != nil {
		return err
	}
	if err := validateMessage(records.UserMessage); err != nil {
		return err
	}
	if err := validateRun(records.Run); err != nil {
		return err
	}
	if records.Run.Status != RunStatusQueued {
		return fmt.Errorf("create queued turn run %s status = %s, want queued", records.Run.ID, records.Run.Status)
	}
	if records.UserMessage.Role != RoleUser {
		return fmt.Errorf("create queued turn message %s role = %s, want user", records.UserMessage.ID, records.UserMessage.Role)
	}
	if records.Run.TriggerMessageID != records.UserMessage.ID {
		return fmt.Errorf("queued run %s trigger message = %s, want %s", records.Run.ID, records.Run.TriggerMessageID, records.UserMessage.ID)
	}
	if records.UserMessage.RunID != records.Run.ID {
		return fmt.Errorf("queued message %s runId = %s, want %s", records.UserMessage.ID, records.UserMessage.RunID, records.Run.ID)
	}
	return validateConversationRunLink(records.Conversation, records.Run)
}

func validateQueuedPromotionRecords(records QueuedPromotionRecords) error {
	if records.Run.Status != RunStatusRunning {
		return fmt.Errorf("promoted queued run %s status = %s, want running", records.Run.ID, records.Run.Status)
	}
	if records.UserMessage.Status != MessageStatusComplete {
		return fmt.Errorf("promoted queued message %s status = %s, want complete", records.UserMessage.ID, records.UserMessage.Status)
	}
	if records.UserMessage.Delivery != MessageDeliveryQueued {
		return fmt.Errorf("promoted queued message %s delivery = %s, want queued", records.UserMessage.ID, records.UserMessage.Delivery)
	}
	return validateTurnRecordLinks(records.Conversation, records.UserMessage, records.AssistantMessage, records.Run)
}

func validateQueuedEditRecords(conversation Conversation, message ChatMessage, run Run, prompt string) error {
	if prompt == "" {
		return fmt.Errorf("queued edit prompt is required")
	}
	if len(message.Parts) != 1 || message.Parts[0].Type != MessagePartText {
		return fmt.Errorf("queued message %s must contain exactly one text part", message.ID)
	}
	if err := validateQueuedTurnRecords(QueuedTurnRecords{
		Conversation: conversation,
		Run:          run,
		UserMessage:  message,
	}); err != nil {
		return err
	}
	if message.Delivery != MessageDeliveryQueued {
		return fmt.Errorf("queued message %s delivery = %s, want queued", message.ID, message.Delivery)
	}
	if message.Status != MessageStatusPending {
		return fmt.Errorf("queued message %s status = %s, want pending", message.ID, message.Status)
	}
	if run.AssistantMessageID != "" {
		return fmt.Errorf("queued run %s assistantMessageId must be empty", run.ID)
	}
	return nil
}

func validatePendingSteeringReplayRecords(records PendingSteeringReplayRecords) error {
	if len(records.PendingSteeringMessages) == 0 {
		return fmt.Errorf("pending steering messages are required")
	}
	if records.ActiveRun.Status != RunStatusRunning {
		return fmt.Errorf("active run %s status = %s, want running", records.ActiveRun.ID, records.ActiveRun.Status)
	}
	if records.UserMessage.Delivery != MessageDeliveryNormal {
		return fmt.Errorf("immediate replay trigger message %s delivery = %s, want normal", records.UserMessage.ID, records.UserMessage.Delivery)
	}
	if promptFromMessage(records.UserMessage) == "" {
		return fmt.Errorf("immediate replay prompt is required")
	}
	if err := validateRunningTurnRecords(RunningTurnRecords{
		AssistantMessage: records.AssistantMessage,
		Conversation:     records.Conversation,
		Run:              records.Run,
		UserMessage:      records.UserMessage,
	}); err != nil {
		return err
	}
	if records.ActiveRun.WorkspaceID != records.Run.WorkspaceID || records.ActiveRun.ConversationID != records.Run.ConversationID {
		return fmt.Errorf("immediate replay run %s does not belong to active run conversation", records.Run.ID)
	}
	for _, message := range records.PendingSteeringMessages {
		if err := validatePendingSteeringReplayMessage(records.ActiveRun, message); err != nil {
			return err
		}
	}
	return nil
}

func validatePendingSteeringReplayMessage(activeRun Run, message ChatMessage) error {
	if err := validateMessage(message); err != nil {
		return err
	}
	if message.ConversationID != activeRun.ConversationID {
		return fmt.Errorf("steering message %s belongs to conversation %s, want %s", message.ID, message.ConversationID, activeRun.ConversationID)
	}
	if message.RunID != activeRun.ID {
		return fmt.Errorf("steering message %s belongs to run %s, want %s", message.ID, message.RunID, activeRun.ID)
	}
	if message.Role != RoleUser {
		return fmt.Errorf("steering message %s role = %s, want user", message.ID, message.Role)
	}
	if message.Delivery != MessageDeliverySteering {
		return fmt.Errorf("steering message %s delivery = %s, want steering", message.ID, message.Delivery)
	}
	if message.Status != MessageStatusPending {
		return fmt.Errorf("steering message %s status = %s, want pending", message.ID, message.Status)
	}
	return nil
}

func validateTerminalTurnRecords(records TerminalTurnRecords, runStatus RunStatus, messageStatus MessageStatus) error {
	if err := validateMessage(records.AssistantMessage); err != nil {
		return err
	}
	if err := validateRun(records.Run); err != nil {
		return err
	}
	if records.Run.Status != runStatus {
		return fmt.Errorf("terminal run %s status = %s, want %s", records.Run.ID, records.Run.Status, runStatus)
	}
	if records.AssistantMessage.Status != messageStatus {
		return fmt.Errorf("terminal assistant message %s status = %s, want %s", records.AssistantMessage.ID, records.AssistantMessage.Status, messageStatus)
	}
	if records.AssistantMessage.Role != RoleAssistant {
		return fmt.Errorf("terminal assistant message %s role = %s, want assistant", records.AssistantMessage.ID, records.AssistantMessage.Role)
	}
	if records.Run.AssistantMessageID != records.AssistantMessage.ID {
		return fmt.Errorf("terminal run %s assistant message = %s, want %s", records.Run.ID, records.Run.AssistantMessageID, records.AssistantMessage.ID)
	}
	if records.AssistantMessage.RunID != records.Run.ID {
		return fmt.Errorf("terminal assistant message %s runId = %s, want %s", records.AssistantMessage.ID, records.AssistantMessage.RunID, records.Run.ID)
	}
	return nil
}

func validateTurnRecordLinks(conversation Conversation, userMessage ChatMessage, assistantMessage ChatMessage, run Run) error {
	if err := validateConversation(conversation); err != nil {
		return err
	}
	if err := validateMessage(userMessage); err != nil {
		return err
	}
	if err := validateMessage(assistantMessage); err != nil {
		return err
	}
	if err := validateRun(run); err != nil {
		return err
	}
	if err := validateConversationRunLink(conversation, run); err != nil {
		return err
	}
	return validateTurnMessageLinks(conversation, userMessage, assistantMessage, run)
}

func validateTurnMessageLinks(conversation Conversation, userMessage ChatMessage, assistantMessage ChatMessage, run Run) error {
	if userMessage.ConversationID != conversation.ID || assistantMessage.ConversationID != conversation.ID {
		return fmt.Errorf("turn messages must belong to conversation %s", conversation.ID)
	}
	if run.TriggerMessageID != userMessage.ID {
		return fmt.Errorf("run %s trigger message = %s, want %s", run.ID, run.TriggerMessageID, userMessage.ID)
	}
	if run.AssistantMessageID != assistantMessage.ID {
		return fmt.Errorf("run %s assistant message = %s, want %s", run.ID, run.AssistantMessageID, assistantMessage.ID)
	}
	if userMessage.RunID != run.ID || assistantMessage.RunID != run.ID {
		return fmt.Errorf("turn messages must belong to run %s", run.ID)
	}
	return nil
}

func validateConversationRunLink(conversation Conversation, run Run) error {
	if conversation.WorkspaceID != run.WorkspaceID {
		return fmt.Errorf("run %s workspace = %s, want conversation workspace %s", run.ID, run.WorkspaceID, conversation.WorkspaceID)
	}
	if conversation.ID != run.ConversationID {
		return fmt.Errorf("run %s conversation = %s, want %s", run.ID, run.ConversationID, conversation.ID)
	}
	return nil
}

func (store *Store) loadQueuedTurnForDelete(workspaceID string, conversationID string, messageID string) (Conversation, ChatMessage, Run, error) {
	conversation, err := store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	message, ok, err := store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if !ok {
		return Conversation{}, ChatMessage{}, Run{}, queuedMessageConflict(messageID, "message was not found")
	}
	if message.Delivery != MessageDeliveryQueued {
		return Conversation{}, ChatMessage{}, Run{}, queuedMessageConflict(message.ID, fmt.Sprintf("delivery is %s", message.Delivery))
	}
	if message.RunID == "" {
		return Conversation{}, ChatMessage{}, Run{}, fmt.Errorf("queued message %s runId is required", message.ID)
	}
	run, err := store.LoadRun(workspaceID, message.RunID)
	if err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if err := validateQueuedTurnRecords(QueuedTurnRecords{
		Conversation: conversation,
		Run:          run,
		UserMessage:  message,
	}); err != nil {
		return Conversation{}, ChatMessage{}, Run{}, err
	}
	if message.Status != MessageStatusPending {
		return Conversation{}, ChatMessage{}, Run{}, queuedMessageConflict(message.ID, fmt.Sprintf("status is %s", message.Status))
	}
	if run.AssistantMessageID != "" {
		return Conversation{}, ChatMessage{}, Run{}, fmt.Errorf("queued run %s assistantMessageId must be empty", run.ID)
	}
	return conversation, message, run, nil
}

func (store *Store) removeMessageFile(workspaceID string, message ChatMessage) error {
	path := store.messagePath(workspaceID, message.ConversationID, message.Ordinal, message.ID)
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return &PersistenceError{Operation: "remove message", Path: path, Err: err}
	}
	return nil
}

func (store *Store) removeRunFile(workspaceID string, runID string) error {
	path := store.runPath(workspaceID, runID)
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return &PersistenceError{Operation: "remove run", Path: path, Err: err}
	}
	return nil
}

func (store *Store) removeRunDirectory(workspaceID string, runID string) error {
	path := filepath.Join(store.runsDir(workspaceID), runID)
	if err := os.RemoveAll(path); err != nil {
		return &PersistenceError{Operation: "remove run directory", Path: path, Err: err}
	}
	return nil
}
