package chat

import (
	"fmt"
	"sort"
)

func (service *Service) runsForConversationWithDiagnosticsLocked(workspaceID string, conversationID string) ([]Run, error) {
	runs, corrupt, err := service.store.ScanRunsForConversationAllowingCorrupt(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	if len(corrupt) > 0 {
		service.recordCorruptStateDiagnosticLocked(corrupt[0], workspaceID, conversationID, "")
		return nil, corrupt[0]
	}
	return runs, nil
}

func (service *Service) runsForWorkspaceWithDiagnostics(workspaceID string) ([]Run, error) {
	runs, corruptRuns, err := service.store.ScanRunsAllowingCorrupt(workspaceID)
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, "", "")
		return nil, err
	}
	if len(corruptRuns) > 0 {
		service.recordCorruptStateDiagnostic(corruptRuns[0], workspaceID, "", "")
		return nil, corruptRuns[0]
	}
	for _, run := range runs {
		if err := service.validateRunAssistantMessage(workspaceID, run); err != nil {
			service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, run.ID)
			return nil, err
		}
	}
	return runs, nil
}

func activeRunIDFromRuns(runs []Run, conversationID string) string {
	for _, run := range runs {
		if run.ConversationID == conversationID && run.Status == RunStatusRunning {
			return run.ID
		}
	}
	return ""
}

func activeRunFromRuns(runs []Run, conversationID string) (Run, bool) {
	for _, run := range runs {
		if run.ConversationID == conversationID && run.Status == RunStatusRunning {
			return run, true
		}
	}
	return Run{}, false
}

func (service *Service) activeRunFromRunsLocked(workspaceID string, conversationID string, runs []Run) (Run, bool, error) {
	run, ok := activeRunFromRuns(runs, conversationID)
	if !ok {
		return Run{}, false, nil
	}
	if err := service.validateRunAssistantMessage(workspaceID, run); err != nil {
		service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, run.ID)
		return Run{}, false, err
	}
	return run, true, nil
}

func (service *Service) queuedStateFromRunsLocked(workspaceID string, conversationID string, runs []Run) (QueueState, error) {
	messages := []ChatMessage{}
	queuedRuns := []Run{}
	for _, run := range runs {
		if run.ConversationID != conversationID || run.Status != RunStatusQueued {
			continue
		}
		message, ok, err := service.store.FindMessageByID(workspaceID, conversationID, run.TriggerMessageID)
		if err != nil {
			if IsCorruptStateError(err) {
				service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, run.ID)
			}
			return QueueState{}, err
		}
		if !ok {
			err := corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
			service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, run.ID)
			return QueueState{}, err
		}
		messages = append(messages, message)
		queuedRuns = append(queuedRuns, run)
	}
	sort.SliceStable(queuedRuns, func(left int, right int) bool {
		leftOrdinal := queuedMessageOrdinal(messages, queuedRuns[left].TriggerMessageID)
		rightOrdinal := queuedMessageOrdinal(messages, queuedRuns[right].TriggerMessageID)
		if leftOrdinal == rightOrdinal {
			return queuedRuns[left].ID < queuedRuns[right].ID
		}
		return leftOrdinal < rightOrdinal
	})
	sort.SliceStable(messages, func(left int, right int) bool {
		if messages[left].Ordinal == messages[right].Ordinal {
			return messages[left].ID < messages[right].ID
		}
		return messages[left].Ordinal < messages[right].Ordinal
	})
	return QueueState{Messages: messages, Runs: queuedRuns}, nil
}

func (service *Service) nextQueuedRunFromRunsLocked(workspaceID string, conversationID string, runs []Run) (Run, ChatMessage, bool, error) {
	state, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return Run{}, ChatMessage{}, false, err
	}
	if len(state.Runs) == 0 {
		return Run{}, ChatMessage{}, false, nil
	}
	run := state.Runs[0]
	for _, message := range state.Messages {
		if message.ID == run.TriggerMessageID {
			return run, message, true, nil
		}
	}
	return Run{}, ChatMessage{}, false, fmt.Errorf("queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
}
