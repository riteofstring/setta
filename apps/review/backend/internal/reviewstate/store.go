package reviewstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/setta/local-backend/latestvalue"
	"github.com/setta/local-backend/projectfs"
	"github.com/setta/review/backend/internal/contracts"
)

const (
	stateVersion      = 1
	statePath         = ".local/review/state.json"
	stateLockPath     = ".local/review/state.lock"
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
	mu        sync.Mutex
	root      *projectfs.Root
	projectID string
	document  Document
	publisher *latestvalue.Publisher[Document]
	closed    bool
}

func Open(projectRoot string, projectID string) (*Store, error) {
	if strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(projectID) == "" {
		return nil, errors.New("reviewstate: project root and identity are required")
	}
	root, err := projectfs.Open(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("reviewstate: open project root: %w", err)
	}
	store := &Store{root: root, projectID: projectID}
	var document Document
	err = store.withAdvisoryLock(func() error {
		var initializeErr error
		document, initializeErr = store.loadOrInitialize(projectID)
		return initializeErr
	})
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	store.document = document
	publisher, err := latestvalue.New(document, clone)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	store.publisher = publisher
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
	if err := validateAssessments(document.Assessments); err != nil {
		return err
	}
	return validateResponses(document.Responses)
}

func validateAssessments(assessments []contracts.ExternalAssessment) error {
	identities := make(map[string]struct{}, len(assessments))
	for _, assessment := range assessments {
		if err := assessment.Validate(); err != nil {
			return fmt.Errorf("reviewstate: assessment %q: %w", assessment.ID, err)
		}
		if _, exists := identities[assessment.ID]; exists {
			return fmt.Errorf("reviewstate: assessment %q is repeated", assessment.ID)
		}
		identities[assessment.ID] = struct{}{}
	}
	return nil
}

func validateResponses(responses []contracts.ReviewResponse) error {
	responseIDs := make(map[string]struct{}, len(responses))
	requestIDs := make(map[string]struct{}, len(responses))
	for _, response := range responses {
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
	if candidate.ProjectID != store.projectID {
		return Document{}, ErrIdentityConflict
	}
	if candidate.Revision != expectedRevision+1 {
		return Document{}, ErrRevisionConflict
	}
	if err := candidate.Validate(); err != nil {
		return Document{}, err
	}
	cloned, err := clone(candidate)
	if err != nil {
		return Document{}, err
	}
	var observed Document
	err = store.withAdvisoryLock(func() error {
		var replaceErr error
		observed, replaceErr = store.replaceDurable(expectedRevision, cloned)
		return replaceErr
	})
	if observed.ProjectID == store.projectID {
		err = errors.Join(err, store.acceptObservedLocked(observed))
	}
	if err != nil {
		return Document{}, err
	}
	return clone(observed)
}

func (store *Store) Subscribe(ctx context.Context) (<-chan Document, error) {
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

func (store *Store) loadOrInitialize(projectID string) (Document, error) {
	document, err := store.load()
	if errors.Is(err, os.ErrNotExist) {
		document = Document{
			Version: stateVersion, ProjectID: projectID, Revision: 0,
			Assessments: []contracts.ExternalAssessment{}, Responses: []contracts.ReviewResponse{},
		}
		if err := document.Validate(); err != nil {
			return Document{}, err
		}
		if err := store.write(document); err != nil {
			return Document{}, err
		}
	} else if err != nil {
		return Document{}, err
	}
	if document.ProjectID != projectID {
		return Document{}, ErrIdentityConflict
	}
	return document, nil
}

func (store *Store) replaceDurable(expectedRevision uint64, candidate Document) (Document, error) {
	durable, err := store.load()
	if err != nil {
		return Document{}, err
	}
	if durable.ProjectID != store.projectID {
		return Document{}, ErrIdentityConflict
	}
	if expectedRevision != durable.Revision || candidate.Revision != expectedRevision+1 {
		return durable, ErrRevisionConflict
	}
	if err := store.write(candidate); err != nil {
		return durable, err
	}
	return candidate, nil
}

func (store *Store) acceptObservedLocked(document Document) error {
	changed := document.Revision != store.document.Revision
	store.document = document
	if changed {
		return store.publisher.Publish(document)
	}
	return nil
}

func (store *Store) withAdvisoryLock(operation func() error) error {
	if err := store.ensureDirectory(); err != nil {
		return err
	}
	return store.root.WithLock(context.Background(), stateLockPath, operation)
}

func (store *Store) ensureDirectory() error {
	if err := store.root.EnsureDirectory(".local/review", 0o755); err != nil {
		return fmt.Errorf("reviewstate: create state directory: %w", err)
	}
	return nil
}

func (store *Store) load() (Document, error) {
	data, err := store.root.ReadRegular(statePath, maximumStateBytes)
	if err != nil {
		return Document{}, fmt.Errorf("reviewstate: read state: %w", err)
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
	encoded, err := encodeDocument(document)
	if err != nil {
		return err
	}
	if err := store.root.Replace(statePath, encoded, maximumStateBytes, 0o600); err != nil {
		return fmt.Errorf("reviewstate: install replacement: %w", err)
	}
	return nil
}

func encodeDocument(document Document) ([]byte, error) {
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("reviewstate: encode state: %w", err)
	}
	encoded = append(encoded, '\n')
	if len(encoded) > maximumStateBytes {
		return nil, errors.New("reviewstate: state exceeds the size limit")
	}
	return encoded, nil
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
