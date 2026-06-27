package chat

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
)

type diagnosticOwner struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	RunID          string `json:"runId"`
}

func (store *Store) ValidateWorkspaceChatState(workspaceID string) ([]CorruptStateFinding, error) {
	findings := []CorruptStateFinding{}
	conversationFindings, err := store.validateConversationChatState(workspaceID)
	if err != nil {
		return nil, err
	}
	findings = append(findings, conversationFindings...)

	runFindings, err := store.validateRunChatState(workspaceID)
	if err != nil {
		return nil, err
	}
	findings = append(findings, runFindings...)

	diagnosticFindings, err := store.scanDiagnosticsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	findings = append(findings, diagnosticFindings...)
	return findings, nil
}

func (store *Store) validateConversationChatState(workspaceID string) ([]CorruptStateFinding, error) {
	conversations, corruptConversations, err := store.scanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	findings := append([]CorruptStateFinding{}, corruptConversations...)
	for _, conversation := range conversations {
		messageFindings, err := store.scanMessagesAllowingCorrupt(workspaceID, conversation.ID)
		if err != nil {
			return nil, err
		}
		findings = append(findings, messageFindings...)
	}
	return findings, nil
}

func (store *Store) validateRunChatState(workspaceID string) ([]CorruptStateFinding, error) {
	runs, corruptRuns, err := store.ScanRunsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	findings := append([]CorruptStateFinding{}, corruptRuns...)
	for _, run := range runs {
		runFindings, err := store.validateSingleRunChatState(workspaceID, run)
		if err != nil {
			return nil, err
		}
		findings = append(findings, runFindings...)
	}
	return findings, nil
}

func (store *Store) validateSingleRunChatState(workspaceID string, run Run) ([]CorruptStateFinding, error) {
	findings := []CorruptStateFinding{}
	if err := validateRunRequiredStateForMaintenance(store, workspaceID, run); err != nil {
		if !IsCorruptStateError(err) {
			return nil, err
		}
		findings = append(findings, corruptStateFinding(err, workspaceID, run.ConversationID, run.ID, corruptRunKind))
	}
	items, itemFindings, err := store.scanRunItemsAllowingCorrupt(workspaceID, run.ID, run.ConversationID)
	if err != nil {
		return nil, err
	}
	findings = append(findings, itemFindings...)
	for _, item := range items {
		outputFindings, err := store.scanRunItemOutputsAllowingCorrupt(workspaceID, run.ID, item.ID, run.ConversationID)
		if err != nil {
			return nil, err
		}
		findings = append(findings, outputFindings...)
	}
	traceFindings, err := store.scanTracesAllowingCorrupt(workspaceID, run.ID, run.ConversationID)
	if err != nil {
		return nil, err
	}
	findings = append(findings, traceFindings...)
	return findings, nil
}

func validateRunRequiredStateForMaintenance(store *Store, workspaceID string, run Run) error {
	if run.Status == RunStatusQueued {
		return nil
	}
	message, ok, err := store.FindMessageByID(workspaceID, run.ConversationID, run.AssistantMessageID)
	if err != nil {
		return err
	}
	if !ok {
		return corruptStateErrorf(store.runPath(workspaceID, run.ID), "run %s assistant message %s was not found", run.ID, run.AssistantMessageID)
	}
	if err := validateRunAssistantMessageRecord(run, message); err != nil {
		return corruptStateError(store.runPath(workspaceID, run.ID), err)
	}
	return nil
}

func (store *Store) scanMessagesAllowingCorrupt(workspaceID string, conversationID string) ([]CorruptStateFinding, error) {
	files, findings, err := store.messageFilesAllowingCorrupt(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		var message ChatMessage
		if err := readJSONFile(file.path, &message); err != nil {
			if IsCorruptStateError(err) {
				findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, "", corruptMessageKind))
				continue
			}
			return nil, err
		}
		if err := validateMessage(message); err != nil {
			findings = append(findings, corruptStateFinding(corruptStateError(file.path, err), workspaceID, conversationID, message.RunID, corruptMessageKind))
			continue
		}
		if message.ConversationID != conversationID {
			err := corruptStateErrorf(file.path, "message %s belongs to conversation %s, not %s", message.ID, message.ConversationID, conversationID)
			findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, message.RunID, corruptMessageKind))
		}
	}
	return findings, nil
}

func (store *Store) scanRunItemsAllowingCorrupt(workspaceID string, runID string, conversationID string) ([]RunItem, []CorruptStateFinding, error) {
	dir := store.runItemsDir(workspaceID, runID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []RunItem{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list run items", Path: dir, Err: err}
	}
	items := make([]RunItem, 0, len(entries))
	findings := []CorruptStateFinding{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		var item RunItem
		path := store.runItemPath(workspaceID, runID, entry.Name())
		if err := readJSONFile(path, &item); err != nil {
			if IsCorruptStateError(err) {
				findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, runID, corruptRunItemKind))
				continue
			}
			return nil, nil, err
		}
		if err := validateRunItem(item); err != nil {
			findings = append(findings, corruptStateFinding(corruptStateError(path, err), workspaceID, conversationID, runID, corruptRunItemKind))
			continue
		}
		if item.WorkspaceID != workspaceID || item.RunID != runID {
			err := corruptStateErrorf(path, "run item %s belongs to workspace %s run %s, not workspace %s run %s", item.ID, item.WorkspaceID, item.RunID, workspaceID, runID)
			findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, runID, corruptRunItemKind))
			continue
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(left int, right int) bool {
		if items[left].CreatedAt == items[right].CreatedAt {
			return items[left].ID < items[right].ID
		}
		return items[left].CreatedAt < items[right].CreatedAt
	})
	return items, findings, nil
}

func (store *Store) scanRunItemOutputsAllowingCorrupt(workspaceID string, runID string, runItemID string, conversationID string) ([]CorruptStateFinding, error) {
	files, findings, err := store.runItemOutputFilesAllowingCorrupt(workspaceID, runID, runItemID, conversationID)
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		var output RunItemOutput
		if err := readJSONFile(file.path, &output); err != nil {
			if IsCorruptStateError(err) {
				findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, runID, corruptRunItemOutputKind))
				continue
			}
			return nil, err
		}
		if err := validateRunItemOutput(output); err != nil {
			findings = append(findings, corruptStateFinding(corruptStateError(file.path, err), workspaceID, conversationID, runID, corruptRunItemOutputKind))
			continue
		}
		if output.RunItemID != runItemID {
			err := corruptStateErrorf(file.path, "run item output %s belongs to run item %s, not %s", output.ID, output.RunItemID, runItemID)
			findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, runID, corruptRunItemOutputKind))
		}
	}
	return findings, nil
}

func (store *Store) runItemOutputFilesAllowingCorrupt(workspaceID string, runID string, runItemID string, conversationID string) ([]runItemOutputFile, []CorruptStateFinding, error) {
	dir := store.runItemOutputsDir(workspaceID, runID, runItemID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []runItemOutputFile{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list run item outputs", Path: dir, Err: err}
	}
	files := make([]runItemOutputFile, 0, len(entries))
	findings := []CorruptStateFinding{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		ordinal, ok := ordinalFromMessageFileName(entry.Name())
		if !ok {
			findings = append(findings, corruptStateFinding(corruptStateErrorf(path, "malformed run item output filename"), workspaceID, conversationID, runID, corruptRunItemOutputKind))
			continue
		}
		files = append(files, runItemOutputFile{
			ordinal: ordinal,
			path:    path,
		})
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].ordinal < files[right].ordinal
	})
	return files, findings, nil
}

func (store *Store) scanTracesAllowingCorrupt(workspaceID string, runID string, conversationID string) ([]CorruptStateFinding, error) {
	dir := filepath.Join(store.runsDir(workspaceID), runID, tracesDirName)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []CorruptStateFinding{}, nil
		}
		return nil, &PersistenceError{Operation: "list traces", Path: dir, Err: err}
	}
	findings := []CorruptStateFinding{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		var trace TraceEvent
		if err := readJSONFile(path, &trace); err != nil {
			if IsCorruptStateError(err) {
				findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, runID, corruptTraceKind))
				continue
			}
			return nil, err
		}
		if err := validateTraceEvent(trace); err != nil {
			findings = append(findings, corruptStateFinding(corruptStateError(path, err), workspaceID, conversationID, runID, corruptTraceKind))
			continue
		}
		if trace.RunID != runID {
			err := corruptStateErrorf(path, "trace %s belongs to run %s, not %s", trace.ID, trace.RunID, runID)
			findings = append(findings, corruptStateFinding(err, workspaceID, conversationID, runID, corruptTraceKind))
		}
	}
	return findings, nil
}

func (store *Store) scanDiagnosticsAllowingCorrupt(workspaceID string) ([]CorruptStateFinding, error) {
	dir := store.diagnosticsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []CorruptStateFinding{}, nil
		}
		return nil, &PersistenceError{Operation: "list diagnostics", Path: dir, Err: err}
	}
	findings := []CorruptStateFinding{}
	for _, entry := range entries {
		finding, ok, err := store.scanDiagnosticAllowingCorrupt(workspaceID, filepath.Join(dir, entry.Name()), entry)
		if err != nil {
			return nil, err
		}
		if ok {
			findings = append(findings, finding)
		}
	}
	return findings, nil
}

func (store *Store) scanDiagnosticAllowingCorrupt(workspaceID string, path string, entry os.DirEntry) (CorruptStateFinding, bool, error) {
	if entry.IsDir() || !isDataJSONFile(entry.Name()) {
		return CorruptStateFinding{}, false, nil
	}
	owner := diagnosticOwner{}
	if err := readJSONMetadataFile(path, &owner); err != nil {
		if IsCorruptStateError(err) {
			return corruptStateFinding(err, workspaceID, "", "", corruptDiagnosticKind), true, nil
		}
		return CorruptStateFinding{}, false, err
	}
	if owner.WorkspaceID != workspaceID {
		return CorruptStateFinding{}, false, nil
	}
	var diagnostic Diagnostic
	if err := readJSONFile(path, &diagnostic); err != nil {
		if IsCorruptStateError(err) {
			return corruptStateFinding(err, workspaceID, owner.ConversationID, owner.RunID, corruptDiagnosticKind), true, nil
		}
		return CorruptStateFinding{}, false, err
	}
	if err := validateDiagnostic(diagnostic); err != nil {
		return corruptStateFinding(corruptStateError(path, err), workspaceID, owner.ConversationID, owner.RunID, corruptDiagnosticKind), true, nil
	}
	return CorruptStateFinding{}, false, nil
}
