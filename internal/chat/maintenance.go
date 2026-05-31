package chat

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const quarantineDirName = "quarantine"

type diagnosticOwner struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	RunID          string `json:"runId"`
}

func (service *Service) QuarantineCorruptChatState(workspaceID string, confirmation string) (ChatMaintenanceResult, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return ChatMaintenanceResult{}, err
	}
	if err := requireMaintenanceConfirmation(workspaceID, confirmation); err != nil {
		return ChatMaintenanceResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	findings, err := service.store.ValidateWorkspaceChatState(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	diagnostics := service.recordCorruptStateFindingsLocked(findings)
	operationID := ""
	if len(findings) > 0 {
		operationID, err = service.newID("quarantine")
		if err != nil {
			return ChatMaintenanceResult{}, fmt.Errorf("create quarantine id: %w", err)
		}
	}
	manifest, manifestPath, err := service.store.QuarantineFindings(workspaceID, findings, operationID, timestamp(service.now()))
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	after, err := service.store.ValidateWorkspaceChatState(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	return ChatMaintenanceResult{
		WorkspaceID:     workspaceID,
		Corruption:      corruptionSummary(after),
		Diagnostics:     diagnostics,
		Quarantined:     manifest.Records,
		ManifestPath:    manifestPath,
		RemovedPaths:    []string{},
		ValidationRunAt: timestamp(service.now()),
	}, nil
}

func (service *Service) ResetWorkspaceChatState(workspaceID string, confirmation string) (ChatMaintenanceResult, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return ChatMaintenanceResult{}, err
	}
	if err := requireMaintenanceConfirmation(workspaceID, confirmation); err != nil {
		return ChatMaintenanceResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	before, err := service.store.ValidateWorkspaceChatState(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	diagnostics := service.recordCorruptStateFindingsLocked(before)
	service.cancelActiveTurnsForWorkspaceLocked(workspaceID)
	removed, err := service.store.ClearWorkspaceChatState(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	after, err := service.store.ValidateWorkspaceChatState(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	return ChatMaintenanceResult{
		WorkspaceID:     workspaceID,
		Corruption:      corruptionSummary(after),
		Diagnostics:     diagnostics,
		Quarantined:     []QuarantinedRecord{},
		ManifestPath:    "",
		RemovedPaths:    removed,
		ValidationRunAt: timestamp(service.now()),
	}, nil
}

func (service *Service) ClearChatQuarantine(workspaceID string, confirmation string) (ChatMaintenanceResult, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return ChatMaintenanceResult{}, err
	}
	if err := requireMaintenanceConfirmation(workspaceID, confirmation); err != nil {
		return ChatMaintenanceResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	removed, err := service.store.ClearChatQuarantine(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	after, err := service.store.ValidateWorkspaceChatState(workspaceID)
	if err != nil {
		return ChatMaintenanceResult{}, err
	}
	return ChatMaintenanceResult{
		WorkspaceID:     workspaceID,
		Corruption:      corruptionSummary(after),
		Diagnostics:     []Diagnostic{},
		Quarantined:     []QuarantinedRecord{},
		ManifestPath:    "",
		RemovedPaths:    removed,
		ValidationRunAt: timestamp(service.now()),
	}, nil
}

func requireMaintenanceConfirmation(workspaceID string, confirmation string) error {
	if workspaceID == "" {
		return errors.New("workspace id is required")
	}
	if confirmation != workspaceID {
		return fmt.Errorf("confirmation must match workspace id %s", workspaceID)
	}
	return nil
}

func (service *Service) cancelActiveTurnsForWorkspaceLocked(workspaceID string) {
	for key, turn := range service.active {
		if turn.workspaceID != workspaceID {
			continue
		}
		turn.cancel()
		delete(service.active, key)
	}
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
	conversations, corruptConversations, err := store.ScanConversationsAllowingCorrupt(workspaceID)
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

func (store *Store) QuarantineFindings(workspaceID string, findings []CorruptStateFinding, operationID string, createdAt string) (ChatQuarantineManifest, string, error) {
	if len(findings) == 0 {
		return ChatQuarantineManifest{SchemaVersion: SchemaVersion, WorkspaceID: workspaceID, CreatedAt: createdAt, Records: []QuarantinedRecord{}}, "", nil
	}
	if operationID == "" {
		return ChatQuarantineManifest{}, "", errors.New("quarantine id is required")
	}
	baseDir := filepath.Join(store.appDataDir, quarantineDirName, workspaceID, operationID)
	records := []QuarantinedRecord{}
	seenPaths := map[string]bool{}
	for _, finding := range findings {
		if finding.Path == "" || seenPaths[finding.Path] {
			continue
		}
		seenPaths[finding.Path] = true
		relative, err := store.relativeAppDataPath(finding.Path)
		if err != nil {
			return ChatQuarantineManifest{}, "", err
		}
		destination := filepath.Join(baseDir, relative)
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			return ChatQuarantineManifest{}, "", &PersistenceError{Operation: "create quarantine directory", Path: filepath.Dir(destination), Err: err}
		}
		if err := os.Rename(finding.Path, destination); err != nil {
			return ChatQuarantineManifest{}, "", &PersistenceError{Operation: "quarantine corrupt chat record", Path: finding.Path, Err: err}
		}
		records = append(records, QuarantinedRecord{
			OriginalPath:   finding.Path,
			QuarantinePath: destination,
			RecordKind:     finding.RecordKind,
			WorkspaceID:    finding.WorkspaceID,
			ConversationID: finding.ConversationID,
			RunID:          finding.RunID,
			Error:          finding.Error,
		})
	}
	manifest := ChatQuarantineManifest{
		SchemaVersion: SchemaVersion,
		ID:            operationID,
		WorkspaceID:   workspaceID,
		CreatedAt:     createdAt,
		Records:       records,
	}
	manifestPath := filepath.Join(baseDir, "manifest.json")
	if err := writeNewJSONFile(manifestPath, manifest); err != nil {
		return ChatQuarantineManifest{}, "", err
	}
	return manifest, manifestPath, nil
}

func (store *Store) ClearWorkspaceChatState(workspaceID string) ([]string, error) {
	paths := []string{
		store.conversationsDir(workspaceID),
		store.runsDir(workspaceID),
	}
	removed := []string{}
	for _, path := range paths {
		exists, err := pathExists(path)
		if err != nil {
			return nil, err
		}
		if !exists {
			continue
		}
		if err := os.RemoveAll(path); err != nil {
			return nil, &PersistenceError{Operation: "remove chat state", Path: path, Err: err}
		}
		removed = append(removed, path)
	}
	diagnostics, err := store.workspaceDiagnosticPaths(workspaceID)
	if err != nil {
		return nil, err
	}
	for _, path := range diagnostics {
		if err := os.Remove(path); err != nil {
			return nil, &PersistenceError{Operation: "remove chat diagnostic", Path: path, Err: err}
		}
		removed = append(removed, path)
	}
	sort.Strings(removed)
	return removed, nil
}

func (store *Store) ClearChatQuarantine(workspaceID string) ([]string, error) {
	path := filepath.Join(store.appDataDir, quarantineDirName, workspaceID)
	exists, err := pathExists(path)
	if err != nil {
		return nil, err
	}
	if !exists {
		return []string{}, nil
	}
	if err := os.RemoveAll(path); err != nil {
		return nil, &PersistenceError{Operation: "clear chat quarantine", Path: path, Err: err}
	}
	return []string{path}, nil
}

func (store *Store) workspaceDiagnosticPaths(workspaceID string) ([]string, error) {
	dir := store.diagnosticsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, &PersistenceError{Operation: "list diagnostics", Path: dir, Err: err}
	}
	paths := []string{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		owner := diagnosticOwner{}
		if err := readJSONMetadataFile(path, &owner); err != nil {
			if IsCorruptStateError(err) {
				continue
			}
			return nil, err
		}
		if owner.WorkspaceID == workspaceID {
			paths = append(paths, path)
		}
	}
	sort.Strings(paths)
	return paths, nil
}

func (store *Store) relativeAppDataPath(path string) (string, error) {
	relative, err := filepath.Rel(store.appDataDir, path)
	if err != nil {
		return "", &PersistenceError{Operation: "prepare quarantine path", Path: path, Err: err}
	}
	if relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", fmt.Errorf("corrupt chat record path is outside app data: %s", path)
	}
	return relative, nil
}

func pathExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, &PersistenceError{Operation: "stat path", Path: path, Err: err}
}
