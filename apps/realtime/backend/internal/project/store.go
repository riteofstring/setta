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

	"github.com/setta/local-backend/latestvalue"
	"github.com/setta/local-backend/projectfs"
	"github.com/setta/realtime/backend/internal/contracts"
)

const maximumProjectBytes = 16 << 20

var (
	ErrClosed           = errors.New("project: store is closed")
	ErrAlreadyExists    = errors.New("project: project already exists")
	ErrRevisionConflict = errors.New("project: revision conflict")
	ErrIdentityConflict = errors.New("project: identity conflict")
)

type Store struct {
	mu        sync.Mutex
	root      *projectfs.Root
	file      string
	project   contracts.Project
	publisher *latestvalue.Publisher[contracts.Project]
	closed    bool
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
	}
	root, err := projectfs.Open(filepath.Dir(resolved))
	if err != nil {
		return nil, fmt.Errorf("project: open directory: %w", err)
	}
	file := filepath.Base(resolved)
	if create {
		candidate, err := NewProject("Realtime App")
		if err != nil {
			_ = root.Close()
			return nil, err
		}
		if err := writeExclusive(root, file, candidate); err != nil {
			_ = root.Close()
			return nil, err
		}
	}
	loaded, err := load(root, file)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	publisher, err := latestvalue.New(loaded, clone)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	return &Store{root: root, file: file, project: loaded, publisher: publisher}, nil
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
	if err := replace(store.root, store.file, candidate); err != nil {
		return contracts.Project{}, err
	}
	store.project = candidate
	if err := store.publisher.Publish(candidate); err != nil {
		return contracts.Project{}, err
	}
	return clone(candidate)
}

func (store *Store) Subscribe(ctx context.Context) (<-chan contracts.Project, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrClosed
	}
	return store.publisher.Subscribe(ctx)
}

func (store *Store) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	return errors.Join(store.publisher.Close(), store.root.Close())
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

func load(root *projectfs.Root, file string) (contracts.Project, error) {
	data, err := root.ReadRegular(file, maximumProjectBytes)
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

func writeExclusive(root *projectfs.Root, file string, project contracts.Project) error {
	encoded, err := encode(project)
	if err != nil {
		return err
	}
	err = root.WriteExclusive(file, encoded, maximumProjectBytes, 0o644)
	if errors.Is(err, os.ErrExist) {
		return ErrAlreadyExists
	}
	if err != nil {
		return fmt.Errorf("project: create: %w", err)
	}
	return nil
}

func replace(root *projectfs.Root, file string, project contracts.Project) error {
	encoded, err := encode(project)
	if err != nil {
		return err
	}
	if err := root.Replace(file, encoded, maximumProjectBytes, 0o644); err != nil {
		return fmt.Errorf("project: install replacement: %w", err)
	}
	return nil
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
