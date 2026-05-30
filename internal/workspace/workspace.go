package workspace

import (
	"crypto/rand"
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
	stateDirName  = ".setta"
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
	newID func() (string, error)
	now   func() time.Time
}

type Option func(*Manager)

func NewManager(options ...Option) *Manager {
	manager := &Manager{
		newID: randomWorkspaceID,
		now:   time.Now,
	}
	for _, option := range options {
		option(manager)
	}
	return manager
}

func WithIDGenerator(newID func() (string, error)) Option {
	return func(manager *Manager) {
		manager.newID = newID
	}
}

func WithClock(now func() time.Time) Option {
	return func(manager *Manager) {
		manager.now = now
	}
}

func StateFilePath(rootPath string) string {
	return filepath.Join(rootPath, stateDirName, stateFileName)
}

func (manager *Manager) OpenLocal(rootPath string) (WorkspaceSummary, WorkspaceState, error) {
	rootPath, err := validateRootPath(rootPath)
	if err != nil {
		return WorkspaceSummary{}, WorkspaceState{}, err
	}

	now := timestamp(manager.now())
	statePath := StateFilePath(rootPath)
	state, exists, err := loadState(statePath)
	if err != nil {
		return WorkspaceSummary{}, WorkspaceState{}, err
	}
	if !exists {
		state, err = manager.newState(rootPath, now)
		if err != nil {
			return WorkspaceSummary{}, WorkspaceState{}, err
		}
	} else {
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

func (manager *Manager) newState(rootPath string, now string) (WorkspaceState, error) {
	id, err := manager.newID()
	if err != nil {
		return WorkspaceState{}, fmt.Errorf("create workspace id: %w", err)
	}
	if id == "" {
		return WorkspaceState{}, errors.New("create workspace id: generated id is empty")
	}
	return WorkspaceState{
		SchemaVersion: SchemaVersion,
		ID:            id,
		RootPath:      rootPath,
		DisplayName:   displayName(rootPath),
		CreatedAt:     now,
		UpdatedAt:     now,
	}, nil
}

func validateRootPath(rootPath string) (string, error) {
	if rootPath == "" {
		return "", errors.New("workspace path is required")
	}
	if !filepath.IsAbs(rootPath) {
		return "", fmt.Errorf("workspace path must be absolute: %s", rootPath)
	}
	rootPath = filepath.Clean(rootPath)
	info, err := os.Stat(rootPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("workspace path does not exist: %s", rootPath)
		}
		return "", fmt.Errorf("read workspace path %s: %w", rootPath, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("workspace path is not a directory: %s", rootPath)
	}
	if _, err := os.ReadDir(rootPath); err != nil {
		return "", fmt.Errorf("workspace path is not readable: %s: %w", rootPath, err)
	}
	return rootPath, nil
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

func randomWorkspaceID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return "workspace_" + hex.EncodeToString(bytes[:]), nil
}
