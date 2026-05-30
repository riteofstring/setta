package chat

import (
	"fmt"
	"sort"
)

func (service *Service) runsWithDiagnosticsLocked(workspaceID string) ([]Run, error) {
	runs, corrupt, err := service.store.ScanRuns(workspaceID)
	if err != nil {
		return nil, err
	}
	service.recordCorruptStateDiagnosticsLocked(corrupt, workspaceID, "", "")
	return runs, nil
}

func activeRunFromRuns(runs []Run, conversationID string) (Run, bool) {
	for _, run := range runs {
		if run.ConversationID == conversationID && run.Status == RunStatusRunning {
			return run, true
		}
	}
	return Run{}, false
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
				continue
			}
			return QueueState{}, err
		}
		if !ok {
			service.recordCorruptStateDiagnosticLocked(corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID), workspaceID, conversationID, run.ID)
			continue
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
