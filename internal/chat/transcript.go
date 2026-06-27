package chat

import (
	"fmt"
	"sort"
)

func (service *Service) attachTranscriptToPageLocked(workspaceID string, conversationID string, page *MessagePage, runs []Run) error {
	allMessages, err := service.store.LoadMessages(workspaceID, conversationID)
	if err != nil {
		if IsCorruptStateError(err) {
			service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, "")
		}
		return err
	}
	transcript, err := service.buildTranscriptProjectionLocked(workspaceID, conversationID, page.Messages, allMessages, runs)
	if err != nil {
		service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, "")
		return err
	}
	page.Transcript = transcript
	service.updateTranscriptPageCursor(page, allMessages)
	return nil
}

func (service *Service) buildTranscriptProjectionLocked(workspaceID string, conversationID string, selectedMessages []ChatMessage, allMessages []ChatMessage, runs []Run) ([]TranscriptTurn, error) {
	runsByID := runsByIDForConversation(conversationID, runs)
	messagesByID, messagesByRunID := indexTranscriptProjectionMessages(selectedMessages, allMessages)

	selectedRunIDs, err := service.selectedTranscriptRunIDs(workspaceID, conversationID, selectedMessages, runsByID)
	if err != nil {
		return nil, err
	}

	turns := make([]TranscriptTurn, 0, len(selectedRunIDs))
	for runID := range selectedRunIDs {
		turn, err := service.transcriptTurnForRunLocked(workspaceID, conversationID, runsByID[runID], messagesByID, messagesByRunID[runID])
		if err != nil {
			return nil, err
		}
		turns = append(turns, turn)
	}
	sortTranscriptTurns(turns)
	return turns, nil
}

func runsByIDForConversation(conversationID string, runs []Run) map[string]Run {
	runsByID := map[string]Run{}
	for _, run := range runs {
		if run.ConversationID == conversationID {
			runsByID[run.ID] = run
		}
	}
	return runsByID
}

func indexTranscriptProjectionMessages(selectedMessages []ChatMessage, allMessages []ChatMessage) (map[string]ChatMessage, map[string][]ChatMessage) {
	messagesByID := map[string]ChatMessage{}
	messagesByRunID := map[string][]ChatMessage{}
	for _, message := range allMessages {
		messagesByID[message.ID] = message
		if message.RunID != "" {
			messagesByRunID[message.RunID] = append(messagesByRunID[message.RunID], message)
		}
	}
	for _, message := range selectedMessages {
		if existing, exists := messagesByID[message.ID]; exists && !canOverlayProjectionMessage(existing, message) {
			continue
		}
		messagesByID[message.ID] = message
		if message.RunID != "" {
			messagesByRunID[message.RunID] = upsertMessageForProjection(messagesByRunID[message.RunID], message)
		}
	}
	sortTranscriptMessagesByRun(messagesByRunID)
	return messagesByID, messagesByRunID
}

func (service *Service) selectedTranscriptRunIDs(workspaceID string, conversationID string, selectedMessages []ChatMessage, runsByID map[string]Run) (map[string]bool, error) {
	selectedRunIDs := map[string]bool{}
	for _, message := range selectedMessages {
		if message.RunID == "" {
			continue
		}
		if _, ok := runsByID[message.RunID]; !ok {
			return nil, corruptStateErrorf(
				service.store.projectionMessagePath(workspaceID, conversationID, message.ID),
				"message %s references missing run %s",
				message.ID,
				message.RunID,
			)
		}
		selectedRunIDs[message.RunID] = true
	}
	return selectedRunIDs, nil
}

func sortTranscriptMessagesByRun(messagesByRunID map[string][]ChatMessage) {
	for runID := range messagesByRunID {
		sort.SliceStable(messagesByRunID[runID], func(left int, right int) bool {
			if messagesByRunID[runID][left].Ordinal == messagesByRunID[runID][right].Ordinal {
				return messagesByRunID[runID][left].ID < messagesByRunID[runID][right].ID
			}
			return messagesByRunID[runID][left].Ordinal < messagesByRunID[runID][right].Ordinal
		})
	}
}

func sortTranscriptTurns(turns []TranscriptTurn) {
	sort.SliceStable(turns, func(left int, right int) bool {
		leftOrdinal := transcriptTurnSortOrdinal(turns[left])
		rightOrdinal := transcriptTurnSortOrdinal(turns[right])
		if leftOrdinal == rightOrdinal {
			return turns[left].Run.ID < turns[right].Run.ID
		}
		return leftOrdinal < rightOrdinal
	})
}

func transcriptTurnSortOrdinal(turn TranscriptTurn) int {
	if turn.TriggerMessage.Delivery == MessageDeliveryQueued && turn.AssistantMessage != nil {
		return turn.AssistantMessage.Ordinal
	}
	return turn.TriggerMessage.Ordinal
}

func upsertMessageForProjection(messages []ChatMessage, message ChatMessage) []ChatMessage {
	for index, existing := range messages {
		if existing.ID == message.ID {
			messages[index] = message
			return messages
		}
	}
	return append(messages, message)
}

func canOverlayProjectionMessage(existing ChatMessage, overlay ChatMessage) bool {
	return existing.ConversationID == overlay.ConversationID &&
		existing.Delivery == overlay.Delivery &&
		existing.ID == overlay.ID &&
		existing.Ordinal == overlay.Ordinal &&
		existing.Role == overlay.Role &&
		existing.RunID == overlay.RunID
}

func (service *Service) transcriptTurnForRunLocked(
	workspaceID string,
	conversationID string,
	run Run,
	messagesByID map[string]ChatMessage,
	runMessages []ChatMessage,
) (TranscriptTurn, error) {
	trigger, ok := messagesByID[run.TriggerMessageID]
	if !ok {
		return TranscriptTurn{}, corruptStateErrorf(
			service.store.projectionRunPath(workspaceID, run.ID),
			"run %s trigger message %s was not found",
			run.ID,
			run.TriggerMessageID,
		)
	}
	if err := validateTranscriptTriggerMessage(run, trigger); err != nil {
		return TranscriptTurn{}, corruptStateError(service.store.projectionRunPath(workspaceID, run.ID), err)
	}

	var assistant *ChatMessage
	if run.Status != RunStatusQueued {
		message, ok := messagesByID[run.AssistantMessageID]
		if !ok {
			return TranscriptTurn{}, corruptStateErrorf(
				service.store.projectionRunPath(workspaceID, run.ID),
				"run %s assistant message %s was not found",
				run.ID,
				run.AssistantMessageID,
			)
		}
		if err := validateRunAssistantMessageRecord(run, message); err != nil {
			return TranscriptTurn{}, corruptStateError(service.store.projectionRunPath(workspaceID, run.ID), err)
		}
		assistantMessage := message
		assistant = &assistantMessage
	}

	steeringMessages, err := transcriptSteeringMessages(run, runMessages)
	if err != nil {
		return TranscriptTurn{}, corruptStateError(service.store.projectionRunPath(workspaceID, run.ID), err)
	}
	return TranscriptTurn{
		AssistantMessage: assistant,
		Run:              run,
		SteeringMessages: steeringMessages,
		TriggerMessage:   trigger,
	}, nil
}

func validateTranscriptTriggerMessage(run Run, message ChatMessage) error {
	if message.Role != RoleUser {
		return fmt.Errorf("run %s triggerMessageId %s refers to %s message", run.ID, run.TriggerMessageID, message.Role)
	}
	if message.RunID != run.ID {
		return fmt.Errorf("run %s trigger message %s belongs to run %s", run.ID, message.ID, message.RunID)
	}
	return nil
}

func transcriptSteeringMessages(run Run, runMessages []ChatMessage) ([]ChatMessage, error) {
	messages := []ChatMessage{}
	for _, message := range runMessages {
		if message.Delivery != MessageDeliverySteering {
			continue
		}
		if message.Role != RoleUser {
			return nil, fmt.Errorf("run %s steering message %s role = %s, want user", run.ID, message.ID, message.Role)
		}
		if message.RunID != run.ID {
			return nil, fmt.Errorf("run %s steering message %s belongs to run %s", run.ID, message.ID, message.RunID)
		}
		messages = append(messages, message)
	}
	return messages, nil
}

func (service *Service) updateTranscriptPageCursor(page *MessagePage, allMessages []ChatMessage) {
	beforeOrdinal := transcriptBeforeOrdinal(page.Transcript)
	for _, message := range page.Messages {
		beforeOrdinal = minPositiveOrdinal(beforeOrdinal, message.Ordinal)
	}
	if beforeOrdinal == 0 {
		beforeOrdinal = page.OlderBeforeOrdinal
	}
	page.OlderBeforeOrdinal = beforeOrdinal
	page.HasMoreOlder = hasMessageBeforeOrdinal(allMessages, beforeOrdinal)
}

func transcriptBeforeOrdinal(transcript []TranscriptTurn) int {
	beforeOrdinal := 0
	for _, turn := range transcript {
		beforeOrdinal = minPositiveOrdinal(beforeOrdinal, turn.TriggerMessage.Ordinal)
		if turn.AssistantMessage != nil {
			beforeOrdinal = minPositiveOrdinal(beforeOrdinal, turn.AssistantMessage.Ordinal)
		}
		for _, message := range turn.SteeringMessages {
			beforeOrdinal = minPositiveOrdinal(beforeOrdinal, message.Ordinal)
		}
	}
	return beforeOrdinal
}

func minPositiveOrdinal(current int, next int) int {
	if next <= 0 {
		return current
	}
	if current == 0 || next < current {
		return next
	}
	return current
}

func hasMessageBeforeOrdinal(messages []ChatMessage, beforeOrdinal int) bool {
	if beforeOrdinal <= 0 {
		return false
	}
	for _, message := range messages {
		if message.Ordinal < beforeOrdinal {
			return true
		}
	}
	return false
}

func runIDsFromTranscript(transcript []TranscriptTurn) []string {
	seen := map[string]bool{}
	runIDs := []string{}
	for _, turn := range transcript {
		if turn.Run.ID == "" || seen[turn.Run.ID] {
			continue
		}
		seen[turn.Run.ID] = true
		runIDs = append(runIDs, turn.Run.ID)
	}
	return runIDs
}
