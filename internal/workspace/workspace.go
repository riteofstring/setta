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

type Option func(*Manager)

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
			return WorkspaceSummary{}, WorkspaceState{}, fmt.Errorf("malformed workspace metadata %s: id %s does not match canonical root path id %s", statePath, state.ID, id)
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
		return WorkspaceState{}, false, fmt.Errorf("read workspace metadata %s: %w", statePath, err)
	}
	defer file.Close()

	var state WorkspaceState
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return WorkspaceState{}, false, fmt.Errorf("malformed workspace metadata %s: %w", statePath, err)
	}
	if err := validateState(state, statePath); err != nil {
		return WorkspaceState{}, false, err
	}
	return state, true, nil
}

func validateState(state WorkspaceState, statePath string) error {
	if state.SchemaVersion != SchemaVersion {
		return fmt.Errorf("malformed workspace metadata %s: unsupported schemaVersion %d", statePath, state.SchemaVersion)
	}
	if state.ID == "" {
		return fmt.Errorf("malformed workspace metadata %s: id is required", statePath)
	}
	if state.RootPath == "" {
		return fmt.Errorf("malformed workspace metadata %s: rootPath is required", statePath)
	}
	if !filepath.IsAbs(state.RootPath) {
		return fmt.Errorf("malformed workspace metadata %s: rootPath must be absolute", statePath)
	}
	if state.DisplayName == "" {
		return fmt.Errorf("malformed workspace metadata %s: displayName is required", statePath)
	}
	if _, err := time.Parse(time.RFC3339Nano, state.CreatedAt); err != nil {
		return fmt.Errorf("malformed workspace metadata %s: createdAt must be RFC3339: %w", statePath, err)
	}
	if _, err := time.Parse(time.RFC3339Nano, state.UpdatedAt); err != nil {
		return fmt.Errorf("malformed workspace metadata %s: updatedAt must be RFC3339: %w", statePath, err)
	}
	return nil
}

func writeState(statePath string, state WorkspaceState) error {
	if err := os.MkdirAll(filepath.Dir(statePath), 0o755); err != nil {
		return fmt.Errorf("create workspace metadata directory %s: %w", filepath.Dir(statePath), err)
	}

	file, err := os.CreateTemp(filepath.Dir(statePath), ".workspace-*.tmp")
	if err != nil {
		return fmt.Errorf("create workspace metadata temp file %s: %w", filepath.Dir(statePath), err)
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
		return fmt.Errorf("write workspace metadata temp file %s: %w", tempPath, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close workspace metadata temp file %s: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, statePath); err != nil {
		return fmt.Errorf("replace workspace metadata %s: %w", statePath, err)
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
