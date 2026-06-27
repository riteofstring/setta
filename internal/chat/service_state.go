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
	for _, finding := range corrupt {
		service.recordCorruptStateFindingLocked(finding)
		if finding.ConversationID == conversationID {
			return nil, corruptFindingError(finding)
		}
	}
	return runs, nil
}

func (service *Service) validRunsForWorkspaceList(workspaceID string) ([]Run, []CorruptStateFinding, error) {
	runs, corruptRuns, err := service.store.ScanRunsAllowingCorrupt(workspaceID)
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, "", "")
		return nil, nil, err
	}
	findings := append([]CorruptStateFinding{}, corruptRuns...)
	for _, run := range runs {
		if err := service.validateRunAssistantMessage(workspaceID, run); err != nil {
			if !IsCorruptStateError(err) {
				return nil, nil, err
			}
			findings = append(findings, corruptStateFinding(err, workspaceID, run.ConversationID, run.ID, corruptRunKind))
		}
	}
	valid := make([]Run, 0, len(runs))
	corruptRunIDs := map[string]bool{}
	for _, finding := range findings {
		if finding.RecordKind == corruptRunKind && finding.RunID != "" {
			corruptRunIDs[finding.RunID] = true
		}
	}
	for _, run := range runs {
		if !corruptRunIDs[run.ID] {
			valid = append(valid, run)
		}
	}
	return valid, findings, nil
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

func (service *Service) ListRuns(workspaceID string, conversationID string) ([]Run, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	for _, run := range runs {
		if err := service.validateRunAssistantMessage(workspaceID, run); err != nil {
			service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, run.ID)
			return nil, err
		}
	}
	return runs, nil
}

func (service *Service) ListDiagnostics(workspaceID string, conversationID string, runID string) ([]Diagnostic, error) {
	if err := service.validateOptionalDiagnosticFilters(workspaceID, conversationID, runID); err != nil {
		return nil, err
	}
	if _, err := service.resolveWorkspaceForRequest(workspaceID); err != nil {
		return nil, err
	}
	diagnostics, corrupt, err := service.store.ListDiagnosticsAllowingCorrupt()
	if err != nil {
		return nil, err
	}
	service.recordDiagnosticFindingsForWorkspace(workspaceID, corrupt)
	return filterDiagnostics(diagnostics, workspaceID, conversationID, runID), nil
}

func (service *Service) recordDiagnosticFindingsForWorkspace(workspaceID string, findings []CorruptStateFinding) {
	for _, finding := range findings {
		if finding.WorkspaceID != "" && finding.WorkspaceID != workspaceID {
			continue
		}
		if finding.WorkspaceID == "" {
			finding.WorkspaceID = workspaceID
		}
		service.recordCorruptStateFinding(finding)
	}
}

func filterDiagnostics(diagnostics []Diagnostic, workspaceID string, conversationID string, runID string) []Diagnostic {
	filtered := make([]Diagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		if diagnostic.WorkspaceID != workspaceID {
			continue
		}
		if conversationID != "" && diagnostic.ConversationID != conversationID {
			continue
		}
		if runID != "" && diagnostic.RunID != runID {
			continue
		}
		filtered = append(filtered, diagnostic)
	}
	return filtered
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
			err := corruptStateErrorf(service.store.projectionRunPath(workspaceID, run.ID), "queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
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
