package appstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"setta/internal/workspace"
)

const (
	SchemaVersion = 1
	stateFileName = "app-state.json"
)

type State struct {
	SchemaVersion       int                          `json:"schemaVersion"`
	SelectedWorkspaceID string                       `json:"selectedWorkspaceId"`
	ActiveWorkspaceIDs  []string                     `json:"activeWorkspaceIds"`
	RecentWorkspaces    []workspace.WorkspaceSummary `json:"recentWorkspaces"`
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
		SchemaVersion:       SchemaVersion,
		SelectedWorkspaceID: "",
		ActiveWorkspaceIDs:  []string{},
		RecentWorkspaces:    []workspace.WorkspaceSummary{},
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
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&state); err != nil {
		return State{}, fmt.Errorf("malformed app state %s: %w", store.statePath, err)
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
		return fmt.Errorf("malformed app state %s: unsupported schemaVersion %d", statePath, state.SchemaVersion)
	}
	recentIDs := map[string]bool{}
	for _, summary := range state.RecentWorkspaces {
		if err := validateSummary(summary, statePath); err != nil {
			return err
		}
		if recentIDs[summary.ID] {
			return fmt.Errorf("malformed app state %s: duplicate recent workspace id %s", statePath, summary.ID)
		}
		recentIDs[summary.ID] = true
	}

	activeIDs := map[string]bool{}
	for _, id := range state.ActiveWorkspaceIDs {
		if id == "" {
			return fmt.Errorf("malformed app state %s: active workspace id is required", statePath)
		}
		if activeIDs[id] {
			return fmt.Errorf("malformed app state %s: duplicate active workspace id %s", statePath, id)
		}
		if !recentIDs[id] {
			return fmt.Errorf("malformed app state %s: active workspace id %s has no recent workspace metadata", statePath, id)
		}
		activeIDs[id] = true
	}
	if state.SelectedWorkspaceID != "" && !activeIDs[state.SelectedWorkspaceID] {
		return fmt.Errorf("malformed app state %s: selected workspace id %s is not active", statePath, state.SelectedWorkspaceID)
	}
	return nil
}

func validateSummary(summary workspace.WorkspaceSummary, statePath string) error {
	if summary.ID == "" {
		return fmt.Errorf("malformed app state %s: recent workspace id is required", statePath)
	}
	if summary.RootPath == "" {
		return fmt.Errorf("malformed app state %s: recent workspace rootPath is required", statePath)
	}
	if !filepath.IsAbs(summary.RootPath) {
		return fmt.Errorf("malformed app state %s: recent workspace rootPath must be absolute", statePath)
	}
	if summary.DisplayName == "" {
		return fmt.Errorf("malformed app state %s: recent workspace displayName is required", statePath)
	}
	if _, err := time.Parse(time.RFC3339Nano, summary.LastOpenedAt); err != nil {
		return fmt.Errorf("malformed app state %s: recent workspace lastOpenedAt must be RFC3339: %w", statePath, err)
	}
	return nil
}
