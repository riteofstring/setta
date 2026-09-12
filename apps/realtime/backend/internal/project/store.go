package project

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/setta/realtime/backend/internal/contracts"
)

var (
	ErrClosed           = errors.New("project: store is closed")
	ErrAlreadyExists    = errors.New("project: project already exists")
	ErrRevisionConflict = errors.New("project: revision conflict")
	ErrIdentityConflict = errors.New("project: identity conflict")
)

type Store struct {
	mu          sync.Mutex
	path        string
	project     contracts.Project
	subscribers map[chan contracts.Project]struct{}
	closed      bool
}

func Open(path string, create bool) (*Store, error) {
	resolved, err := validatePath(path)
	if err != nil {
		return nil, err
	}
	if create {
		if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
			return nil, fmt.Errorf("project: create directory: %w", err)
		}
		candidate, err := NewProject("Realtime App")
		if err != nil {
			return nil, err
		}
		if err := writeExclusive(resolved, candidate); err != nil {
			return nil, err
		}
	}
	loaded, err := load(resolved)
	if err != nil {
		return nil, err
	}
	return &Store{path: resolved, project: loaded, subscribers: make(map[chan contracts.Project]struct{})}, nil
}

func NewProject(name string) (contracts.Project, error) {
	id, err := randomID("project")
	if err != nil {
		return contracts.Project{}, err
	}
	project := contracts.Project{
		Version:  contracts.ProjectVersion,
		ID:       id,
		Revision: 0,
		Name:     name,
		Runtime: contracts.RuntimeDeclaration{
			Kind:       "python",
			Entrypoint: "app.py",
		},
		Sections: map[string]contracts.Section{},
		Layout: contracts.Layout{
			TopLevelSections: map[string]contracts.TopLevelSectionLayout{},
			Viewport:         nil,
		},
		Bindings:      []contracts.Binding{},
		Configuration: map[string]json.RawMessage{},
	}
	if err := project.Validate(); err != nil {
		return contracts.Project{}, err
	}
	return project, nil
}

func (store *Store) Snapshot() (contracts.Project, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return contracts.Project{}, ErrClosed
	}
	return clone(store.project)
}

func (store *Store) Apply(request contracts.ApplyRequest) (contracts.Project, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return contracts.Project{}, ErrClosed
	}
	if request.ProjectID != store.project.ID {
		return contracts.Project{}, ErrIdentityConflict
	}
	if request.ExpectedRevision != store.project.Revision {
		return contracts.Project{}, ErrRevisionConflict
	}
	candidate, err := contracts.Apply(store.project, request)
	if err != nil {
		return contracts.Project{}, err
	}
	if err := replace(store.path, candidate); err != nil {
		return contracts.Project{}, err
	}
	store.project = candidate
	store.publishLocked(candidate)
	return clone(candidate)
}

func (store *Store) Subscribe(ctx context.Context) (<-chan contracts.Project, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrClosed
	}
	channel := make(chan contracts.Project, 1)
	snapshot, err := clone(store.project)
	if err != nil {
		return nil, err
	}
	channel <- snapshot
	store.subscribers[channel] = struct{}{}
	go func() {
		<-ctx.Done()
		store.mu.Lock()
		if _, exists := store.subscribers[channel]; exists {
			delete(store.subscribers, channel)
			close(channel)
		}
		store.mu.Unlock()
	}()
	return channel, nil
}

func (store *Store) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	for channel := range store.subscribers {
		close(channel)
	}
	store.subscribers = nil
	return nil
}

func (store *Store) publishLocked(project contracts.Project) {
	for channel := range store.subscribers {
		snapshot, err := clone(project)
		if err != nil {
			continue
		}
		select {
		case channel <- snapshot:
		default:
			select {
			case <-channel:
			default:
			}
			channel <- snapshot
		}
	}
}

func validatePath(path string) (string, error) {
	if strings.TrimSpace(path) == "" || path != strings.TrimSpace(path) || strings.ContainsRune(path, '\x00') {
		return "", errors.New("project: path is invalid")
	}
	resolved, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("project: resolve path: %w", err)
	}
	return resolved, nil
}

func load(path string) (contracts.Project, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return contracts.Project{}, fmt.Errorf("project: read: %w", err)
	}
	var project contracts.Project
	if err := contracts.DecodeStrict(data, &project); err != nil {
		return contracts.Project{}, fmt.Errorf("project: decode: %w", err)
	}
	if err := project.Validate(); err != nil {
		return contracts.Project{}, fmt.Errorf("project: validate: %w", err)
	}
	return project, nil
}

func writeExclusive(path string, project contracts.Project) error {
	encoded, err := encode(project)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if errors.Is(err, os.ErrExist) {
		return ErrAlreadyExists
	}
	if err != nil {
		return fmt.Errorf("project: create: %w", err)
	}
	if _, err := file.Write(encoded); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("project: write new: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("project: sync new: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("project: close new: %w", err)
	}
	return syncDirectory(filepath.Dir(path))
}

func replace(path string, project contracts.Project) error {
	encoded, err := encode(project)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".realtime-project-*.json")
	if err != nil {
		return fmt.Errorf("project: stage replacement: %w", err)
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(0o644); err != nil {
		_ = file.Close()
		return fmt.Errorf("project: set replacement mode: %w", err)
	}
	if _, err := file.Write(encoded); err != nil {
		_ = file.Close()
		return fmt.Errorf("project: write replacement: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("project: sync replacement: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("project: close replacement: %w", err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("project: install replacement: %w", err)
	}
	return syncDirectory(filepath.Dir(path))
}

func encode(project contracts.Project) ([]byte, error) {
	if err := project.Validate(); err != nil {
		return nil, err
	}
	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("project: encode: %w", err)
	}
	return append(data, '\n'), nil
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("project: open directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("project: sync directory: %w", err)
	}
	return nil
}

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("project: generate identity: %w", err)
	}
	return prefix + "-" + hex.EncodeToString(bytes), nil
}

func clone(project contracts.Project) (contracts.Project, error) {
	data, err := json.Marshal(project)
	if err != nil {
		return contracts.Project{}, err
	}
	var result contracts.Project
	if err := contracts.DecodeStrict(data, &result); err != nil {
		return contracts.Project{}, err
	}
	return result, nil
}
