package reviewstate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"

	"github.com/setta/review/backend/internal/contracts"
)

const (
	stateVersion      = 1
	statePath         = ".local/review/state.json"
	maximumStateBytes = 16 << 20
)

var (
	ErrClosed           = errors.New("reviewstate: store is closed")
	ErrRevisionConflict = errors.New("reviewstate: revision conflict")
	ErrIdentityConflict = errors.New("reviewstate: project identity conflict")
)

type Document struct {
	Version     int                            `json:"version"`
	ProjectID   string                         `json:"projectId"`
	Revision    uint64                         `json:"revision"`
	Assessments []contracts.ExternalAssessment `json:"assessments"`
	Responses   []contracts.ReviewResponse     `json:"responses"`
}

type Store struct {
	mu          sync.Mutex
	root        *os.Root
	document    Document
	subscribers map[chan Document]struct{}
	closed      bool
}

func Open(projectRoot string, projectID string) (*Store, error) {
	if strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(projectID) == "" {
		return nil, errors.New("reviewstate: project root and identity are required")
	}
	root, err := os.OpenRoot(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("reviewstate: open project root: %w", err)
	}
	store := &Store{root: root, subscribers: make(map[chan Document]struct{})}
	if err := store.ensureDirectory(); err != nil {
		_ = root.Close()
		return nil, err
	}
	document, err := store.load()
	if errors.Is(err, os.ErrNotExist) {
		document = Document{
			Version: stateVersion, ProjectID: projectID, Revision: 0,
			Assessments: []contracts.ExternalAssessment{}, Responses: []contracts.ReviewResponse{},
		}
		if err := document.Validate(); err != nil {
			_ = root.Close()
			return nil, err
		}
		if err := store.write(document); err != nil {
			_ = root.Close()
			return nil, err
		}
	} else if err != nil {
		_ = root.Close()
		return nil, err
	}
	if document.ProjectID != projectID {
		_ = root.Close()
		return nil, ErrIdentityConflict
	}
	store.document = document
	return store, nil
}

func (document Document) Validate() error {
	if document.Version != stateVersion {
		return fmt.Errorf("reviewstate: unsupported state version %d", document.Version)
	}
	if strings.TrimSpace(document.ProjectID) == "" || document.ProjectID != strings.TrimSpace(document.ProjectID) {
		return errors.New("reviewstate: project identity is invalid")
	}
	if document.Assessments == nil || document.Responses == nil {
		return errors.New("reviewstate: assessment and response collections are required")
	}
	assessmentIDs := make(map[string]struct{}, len(document.Assessments))
	for _, assessment := range document.Assessments {
		if err := assessment.Validate(); err != nil {
			return fmt.Errorf("reviewstate: assessment %q: %w", assessment.ID, err)
		}
		if _, exists := assessmentIDs[assessment.ID]; exists {
			return fmt.Errorf("reviewstate: assessment %q is repeated", assessment.ID)
		}
		assessmentIDs[assessment.ID] = struct{}{}
	}
	responseIDs := make(map[string]struct{}, len(document.Responses))
	requestIDs := make(map[string]struct{}, len(document.Responses))
	for _, response := range document.Responses {
		if err := response.Validate(); err != nil {
			return fmt.Errorf("reviewstate: response %q: %w", response.ID, err)
		}
		if _, exists := responseIDs[response.ID]; exists {
			return fmt.Errorf("reviewstate: response %q is repeated", response.ID)
		}
		if _, exists := requestIDs[response.RequestID]; exists {
			return fmt.Errorf("reviewstate: request %q has multiple responses", response.RequestID)
		}
		responseIDs[response.ID] = struct{}{}
		requestIDs[response.RequestID] = struct{}{}
	}
	return nil
}

func (store *Store) Snapshot() (Document, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return Document{}, ErrClosed
	}
	return clone(store.document)
}

func (store *Store) Replace(expectedRevision uint64, candidate Document) (Document, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return Document{}, ErrClosed
	}
	if candidate.ProjectID != store.document.ProjectID {
		return Document{}, ErrIdentityConflict
	}
	if expectedRevision != store.document.Revision || candidate.Revision != expectedRevision+1 {
		return Document{}, ErrRevisionConflict
	}
	if err := candidate.Validate(); err != nil {
		return Document{}, err
	}
	cloned, err := clone(candidate)
	if err != nil {
		return Document{}, err
	}
	if err := store.write(cloned); err != nil {
		return Document{}, err
	}
	store.document = cloned
	store.publishLocked(cloned)
	return clone(cloned)
}

func (store *Store) Subscribe(ctx context.Context) (<-chan Document, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrClosed
	}
	channel := make(chan Document, 1)
	snapshot, err := clone(store.document)
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
	return store.root.Close()
}

func (store *Store) ensureDirectory() error {
	if err := store.root.MkdirAll(".local/review", 0o755); err != nil {
		return fmt.Errorf("reviewstate: create state directory: %w", err)
	}
	for _, name := range []string{".local", ".local/review"} {
		info, err := store.root.Lstat(name)
		if err != nil {
			return fmt.Errorf("reviewstate: inspect state directory: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return errors.New("reviewstate: state directory is not an admitted directory")
		}
	}
	return nil
}

func (store *Store) load() (Document, error) {
	info, err := store.root.Lstat(statePath)
	if err != nil {
		return Document{}, err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return Document{}, errors.New("reviewstate: state path is not an admitted regular file")
	}
	file, err := store.root.Open(statePath)
	if err != nil {
		return Document{}, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maximumStateBytes+1))
	if err != nil {
		return Document{}, fmt.Errorf("reviewstate: read state: %w", err)
	}
	if len(data) > maximumStateBytes {
		return Document{}, errors.New("reviewstate: state exceeds the size limit")
	}
	var document Document
	if err := contracts.DecodeStrict(data, &document); err != nil {
		return Document{}, fmt.Errorf("reviewstate: decode state: %w", err)
	}
	if err := document.Validate(); err != nil {
		return Document{}, err
	}
	return document, nil
}

func (store *Store) write(document Document) error {
	if err := store.ensureDirectory(); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return fmt.Errorf("reviewstate: encode state: %w", err)
	}
	encoded = append(encoded, '\n')
	if len(encoded) > maximumStateBytes {
		return errors.New("reviewstate: state exceeds the size limit")
	}
	name, err := temporaryName()
	if err != nil {
		return err
	}
	temporary := ".local/review/" + name
	file, err := store.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("reviewstate: create replacement: %w", err)
	}
	installed := false
	defer func() {
		_ = file.Close()
		if !installed {
			_ = store.root.Remove(temporary)
		}
	}()
	if _, err := file.Write(encoded); err != nil {
		return fmt.Errorf("reviewstate: write replacement: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("reviewstate: sync replacement: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("reviewstate: close replacement: %w", err)
	}
	if err := store.root.Rename(temporary, statePath); err != nil {
		return fmt.Errorf("reviewstate: install replacement: %w", err)
	}
	installed = true
	directory, err := store.root.Open(".local/review")
	if err != nil {
		return fmt.Errorf("reviewstate: open state directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("reviewstate: sync state directory: %w", err)
	}
	return nil
}

func (store *Store) publishLocked(document Document) {
	for channel := range store.subscribers {
		snapshot, err := clone(document)
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

func temporaryName() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("reviewstate: create replacement identity: %w", err)
	}
	return ".state-" + hex.EncodeToString(bytes) + ".json", nil
}

func clone(document Document) (Document, error) {
	encoded, err := json.Marshal(document)
	if err != nil {
		return Document{}, fmt.Errorf("reviewstate: clone encode: %w", err)
	}
	var cloned Document
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return Document{}, fmt.Errorf("reviewstate: clone decode: %w", err)
	}
	return cloned, nil
}
