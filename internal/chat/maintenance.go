package chat

import (
	"errors"
	"os"
	"path/filepath"
)

type diagnosticOwner struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	RunID          string `json:"runId"`
}

func (store *Store) ValidateWorkspaceChatState(workspaceID string) ([]CorruptStateFinding, error) {
	diagnosticFindings, err := store.scanDiagnosticsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	return diagnosticFindings, nil
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
