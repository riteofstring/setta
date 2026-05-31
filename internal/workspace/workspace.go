package workspace

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"setta/internal/jsonio"
)

const (
	SchemaVersion = 1
	stateDirName  = "workspaces"
	stateFileName = "workspace.json"
)

type WorkspaceSummary struct {
	ID           string `json:"id"`
	RootPath     string `json:"rootPath"`
	DisplayName  string `json:"displayName"`
	LastOpenedAt string `json:"lastOpenedAt"`
}

type WorkspaceState struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	RootPath      string `json:"rootPath"`
	DisplayName   string `json:"displayName"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type Manager struct {
	appDataDir string
	now        func() time.Time
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

type Option func(*Manager)

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
	return fmt.Sprintf("malformed workspace metadata %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func NewManager(appDataDir string, options ...Option) (*Manager, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	manager := &Manager{
		appDataDir: filepath.Clean(appDataDir),
		now:        time.Now,
	}
	for _, option := range options {
		option(manager)
	}
	return manager, nil
}

func WithClock(now func() time.Time) Option {
	return func(manager *Manager) {
		manager.now = now
	}
}

func ValidateLocalRootPath(rootPath string) (string, error) {
	return validateRootPath(rootPath)
}

func StateFilePath(appDataDir string, workspaceID string) string {
	return filepath.Join(appDataDir, stateDirName, workspaceID, stateFileName)
}

func (manager *Manager) OpenLocal(rootPath string) (WorkspaceSummary, WorkspaceState, error) {
	rootPath, err := validateRootPath(rootPath)
	if err != nil {
		return WorkspaceSummary{}, WorkspaceState{}, err
	}

	id := workspaceID(rootPath)
	now := timestamp(manager.now())
	statePath := StateFilePath(manager.appDataDir, id)
	state, exists, err := loadState(statePath)
	if err != nil {
		return WorkspaceSummary{}, WorkspaceState{}, err
	}
	if !exists {
		state = newState(id, rootPath, now)
	} else {
		if state.ID != id {
			return WorkspaceSummary{}, WorkspaceState{}, corruptStateErrorf(statePath, "id %s does not match canonical root path id %s", state.ID, id)
		}
		state.RootPath = rootPath
		state.DisplayName = displayName(rootPath)
		state.UpdatedAt = now
	}

	if err := writeState(statePath, state); err != nil {
		return WorkspaceSummary{}, WorkspaceState{}, err
	}
	return WorkspaceSummary{
		ID:           state.ID,
		RootPath:     state.RootPath,
		DisplayName:  state.DisplayName,
		LastOpenedAt: now,
	}, state, nil
}

func newState(id string, rootPath string, now string) WorkspaceState {
	return WorkspaceState{
		SchemaVersion: SchemaVersion,
		ID:            id,
		RootPath:      rootPath,
		DisplayName:   displayName(rootPath),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
}

func validateRootPath(rootPath string) (string, error) {
	if rootPath == "" {
		return "", errors.New("workspace path is required")
	}
	if !filepath.IsAbs(rootPath) {
		return "", fmt.Errorf("workspace path must be absolute: %s", rootPath)
	}
	rootPath = filepath.Clean(rootPath)
	canonicalPath, err := filepath.EvalSymlinks(rootPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("workspace path does not exist: %s", rootPath)
		}
		return "", fmt.Errorf("resolve workspace path %s: %w", rootPath, err)
	}
	canonicalPath = filepath.Clean(canonicalPath)
	info, err := os.Stat(canonicalPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("workspace path does not exist: %s", canonicalPath)
		}
		return "", fmt.Errorf("read workspace path %s: %w", canonicalPath, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("workspace path is not a directory: %s", canonicalPath)
	}
	if _, err := os.ReadDir(canonicalPath); err != nil {
		return "", fmt.Errorf("workspace path is not readable: %s: %w", canonicalPath, err)
	}
	return canonicalPath, nil
}

func loadState(statePath string) (WorkspaceState, bool, error) {
	file, err := os.Open(statePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return WorkspaceState{}, false, nil
		}
		return WorkspaceState{}, false, &PersistenceError{Operation: "read workspace metadata", Path: statePath, Err: err}
	}
	defer file.Close()

	var state WorkspaceState
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return WorkspaceState{}, false, corruptStateError(statePath, err)
	}
	if err := validateState(state, statePath); err != nil {
		return WorkspaceState{}, false, err
	}
	return state, true, nil
}

func validateState(state WorkspaceState, statePath string) error {
	if state.SchemaVersion != SchemaVersion {
		return corruptStateErrorf(statePath, "unsupported schemaVersion %d", state.SchemaVersion)
	}
	if state.ID == "" {
		return corruptStateErrorf(statePath, "id is required")
	}
	if state.RootPath == "" {
		return corruptStateErrorf(statePath, "rootPath is required")
	}
	if !filepath.IsAbs(state.RootPath) {
		return corruptStateErrorf(statePath, "rootPath must be absolute")
	}
	if state.DisplayName == "" {
		return corruptStateErrorf(statePath, "displayName is required")
	}
	if _, err := time.Parse(time.RFC3339Nano, state.CreatedAt); err != nil {
		return corruptStateError(statePath, fmt.Errorf("createdAt must be RFC3339: %w", err))
	}
	if _, err := time.Parse(time.RFC3339Nano, state.UpdatedAt); err != nil {
		return corruptStateError(statePath, fmt.Errorf("updatedAt must be RFC3339: %w", err))
	}
	return nil
}

func writeState(statePath string, state WorkspaceState) error {
	if err := os.MkdirAll(filepath.Dir(statePath), 0o755); err != nil {
		return &PersistenceError{Operation: "create workspace metadata directory", Path: filepath.Dir(statePath), Err: err}
	}

	file, err := os.CreateTemp(filepath.Dir(statePath), ".workspace-*.tmp")
	if err != nil {
		return &PersistenceError{Operation: "create workspace metadata temp file", Path: filepath.Dir(statePath), Err: err}
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
		return &PersistenceError{Operation: "write workspace metadata temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close workspace metadata temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, statePath); err != nil {
		return &PersistenceError{Operation: "replace workspace metadata", Path: statePath, Err: err}
	}
	removeTemp = false
	return nil
}

func displayName(rootPath string) string {
	name := filepath.Base(rootPath)
	if name == "." || name == string(filepath.Separator) {
		return rootPath
	}
	return name
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func workspaceID(canonicalRootPath string) string {
	hash := sha256.Sum256([]byte(canonicalRootPath))
	return "workspace_" + hex.EncodeToString(hash[:16])
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
