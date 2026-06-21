package appstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"setta/internal/jsonio"
	"setta/internal/workspace"
)

const (
	SchemaVersion = 1
	stateFileName = "app-state.json"
)

type State struct {
	SchemaVersion                        int                          `json:"schemaVersion"`
	SelectedWorkspaceID                  string                       `json:"selectedWorkspaceId"`
	SelectedConversationIDsByWorkspaceID map[string]string            `json:"selectedConversationIdsByWorkspaceId"`
	ActiveWorkspaceIDs                   []string                     `json:"activeWorkspaceIds"`
	RecentWorkspaces                     []workspace.WorkspaceSummary `json:"recentWorkspaces"`
}

type Store struct {
	appDataDir string
	statePath  string
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed app state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func NewStore(appDataDir string) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	appDataDir = filepath.Clean(appDataDir)
	return &Store{
		appDataDir: appDataDir,
		statePath:  filepath.Join(appDataDir, stateFileName),
	}, nil
}

func EmptyState() State {
	return State{
		SchemaVersion:                        SchemaVersion,
		SelectedWorkspaceID:                  "",
		SelectedConversationIDsByWorkspaceID: map[string]string{},
		ActiveWorkspaceIDs:                   []string{},
		RecentWorkspaces:                     []workspace.WorkspaceSummary{},
	}
}

func (store *Store) Path() string {
	return store.statePath
}

func (store *Store) Load() (State, error) {
	file, err := os.Open(store.statePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return EmptyState(), nil
		}
		return State{}, &PersistenceError{Operation: "read app state", Path: store.statePath, Err: err}
	}
	defer file.Close()

	var state State
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return State{}, corruptStateError(store.statePath, err)
	}
	if err := validateState(state, store.statePath); err != nil {
		return State{}, err
	}
	return state, nil
}

func (store *Store) Save(state State) error {
	if err := validateState(state, store.statePath); err != nil {
		return err
	}
	if err := os.MkdirAll(store.appDataDir, 0o755); err != nil {
		return &PersistenceError{Operation: "create app state directory", Path: store.appDataDir, Err: err}
	}

	file, err := os.CreateTemp(store.appDataDir, ".app-state-*.tmp")
	if err != nil {
		return &PersistenceError{Operation: "create app state temp file", Path: store.appDataDir, Err: err}
	}
	tempPath := file.Name()
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tempPath)
		}
	}()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(state); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write app state temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close app state temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, store.statePath); err != nil {
		return &PersistenceError{Operation: "replace app state", Path: store.statePath, Err: err}
	}
	removeTemp = false
	return nil
}

func validateState(state State, statePath string) error {
	if state.SchemaVersion != SchemaVersion {
		return corruptStateErrorf(statePath, "unsupported schemaVersion %d", state.SchemaVersion)
	}
	recentIDs, err := validateRecentWorkspaces(state.RecentWorkspaces, statePath)
	if err != nil {
		return err
	}
	activeIDs, err := validateActiveWorkspaceIDs(state.ActiveWorkspaceIDs, recentIDs, statePath)
	if err != nil {
		return err
	}
	if err := validateSelectedWorkspaceID(state.SelectedWorkspaceID, activeIDs, statePath); err != nil {
		return err
	}
	return validateSelectedConversationIDs(state.SelectedConversationIDsByWorkspaceID, recentIDs, statePath)
}

func validateRecentWorkspaces(summaries []workspace.WorkspaceSummary, statePath string) (map[string]bool, error) {
	recentIDs := map[string]bool{}
	for _, summary := range summaries {
		if err := validateSummary(summary, statePath); err != nil {
			return nil, err
		}
		if recentIDs[summary.ID] {
			return nil, corruptStateErrorf(statePath, "duplicate recent workspace id %s", summary.ID)
		}
		recentIDs[summary.ID] = true
	}
	return recentIDs, nil
}

func validateActiveWorkspaceIDs(activeWorkspaceIDs []string, recentIDs map[string]bool, statePath string) (map[string]bool, error) {
	activeIDs := map[string]bool{}
	for _, id := range activeWorkspaceIDs {
		if id == "" {
			return nil, corruptStateErrorf(statePath, "active workspace id is required")
		}
		if activeIDs[id] {
			return nil, corruptStateErrorf(statePath, "duplicate active workspace id %s", id)
		}
		if !recentIDs[id] {
			return nil, corruptStateErrorf(statePath, "active workspace id %s has no recent workspace metadata", id)
		}
		activeIDs[id] = true
	}
	return activeIDs, nil
}

func validateSelectedWorkspaceID(selectedWorkspaceID string, activeIDs map[string]bool, statePath string) error {
	if selectedWorkspaceID != "" && !activeIDs[selectedWorkspaceID] {
		return corruptStateErrorf(statePath, "selected workspace id %s is not active", selectedWorkspaceID)
	}
	return nil
}

func validateSelectedConversationIDs(selectedConversationIDsByWorkspaceID map[string]string, recentIDs map[string]bool, statePath string) error {
	for workspaceID, conversationID := range selectedConversationIDsByWorkspaceID {
		if workspaceID == "" {
			return corruptStateErrorf(statePath, "selected conversation workspace id is required")
		}
		if conversationID == "" {
			return corruptStateErrorf(statePath, "selected conversation id is required for workspace %s", workspaceID)
		}
		if !recentIDs[workspaceID] {
			return corruptStateErrorf(statePath, "selected conversation workspace id %s has no recent workspace metadata", workspaceID)
		}
	}
	return nil
}

func validateSummary(summary workspace.WorkspaceSummary, statePath string) error {
	if summary.ID == "" {
		return corruptStateErrorf(statePath, "recent workspace id is required")
	}
	if summary.RootPath == "" {
		return corruptStateErrorf(statePath, "recent workspace rootPath is required")
	}
	if !filepath.IsAbs(summary.RootPath) {
		return corruptStateErrorf(statePath, "recent workspace rootPath must be absolute")
	}
	if summary.DisplayName == "" {
		return corruptStateErrorf(statePath, "recent workspace displayName is required")
	}
	if _, err := time.Parse(time.RFC3339Nano, summary.LastOpenedAt); err != nil {
		return corruptStateError(statePath, fmt.Errorf("recent workspace lastOpenedAt must be RFC3339: %w", err))
	}
	return nil
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
