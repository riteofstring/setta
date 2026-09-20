package lensstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/setta/experiment-lens/backend/internal/contracts"
	"github.com/setta/local-backend/projectfs"
)

const (
	stateVersion      = 1
	statePath         = ".local/experiment-lens/state.json"
	stateLockPath     = ".local/experiment-lens/state.lock"
	maximumStateBytes = 16 << 20
)

var (
	ErrClosed           = errors.New("lensstate: store is closed")
	ErrRevisionConflict = errors.New("lensstate: revision conflict")
	ErrIdentityConflict = errors.New("lensstate: experiment identity conflict")
)

type Identity struct {
	ExperimentID            string
	ManifestSHA256          string
	ObservationSourceSHA256 string
}

type Document struct {
	Version                 int                     `json:"version"`
	ExperimentID            string                  `json:"experimentId"`
	ManifestSHA256          string                  `json:"manifestSha256"`
	ObservationSourceSHA256 string                  `json:"observationSourceSha256"`
	Revision                uint64                  `json:"revision"`
	Selection               contracts.LensSelection `json:"selection"`
}

type Store struct {
	mu          sync.Mutex
	root        *projectfs.Root
	identity    Identity
	document    Document
	subscribers map[chan Document]struct{}
	closed      bool
}

func Open(projectRoot string, identity Identity) (*Store, error) {
	if strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(identity.ExperimentID) == "" || strings.TrimSpace(identity.ManifestSHA256) == "" || strings.TrimSpace(identity.ObservationSourceSHA256) == "" {
		return nil, errors.New("lensstate: project root and identity are required")
	}
	root, err := projectfs.Open(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("lensstate: open project root: %w", err)
	}
	store := &Store{root: root, identity: identity, subscribers: make(map[chan Document]struct{})}
	var document Document
	err = store.withAdvisoryLock(func() error {
		var loadErr error
		document, loadErr = store.loadOrInitialize()
		return loadErr
	})
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	store.document = document
	return store, nil
}

func (document Document) Validate() error {
	if document.Version != stateVersion {
		return fmt.Errorf("lensstate: unsupported state version %d", document.Version)
	}
	if strings.TrimSpace(document.ExperimentID) == "" || strings.TrimSpace(document.ManifestSHA256) == "" || strings.TrimSpace(document.ObservationSourceSHA256) == "" {
		return errors.New("lensstate: state identity is invalid")
	}
	return document.Selection.Validate()
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
	if !store.matches(candidate) {
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
	if store.matches(observed) {
		store.acceptObservedLocked(observed)
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

func (store *Store) loadOrInitialize() (Document, error) {
	document, err := store.load()
	if errors.Is(err, os.ErrNotExist) {
		document = Document{
			Version: stateVersion, ExperimentID: store.identity.ExperimentID,
			ManifestSHA256: store.identity.ManifestSHA256, ObservationSourceSHA256: store.identity.ObservationSourceSHA256,
			Revision: 0, Selection: contracts.EmptySelection(),
		}
		if err := store.write(document); err != nil {
			return Document{}, err
		}
	} else if err != nil {
		return Document{}, err
	}
	if !store.matches(document) {
		return Document{}, ErrIdentityConflict
	}
	return document, nil
}

func (store *Store) replaceDurable(expectedRevision uint64, candidate Document) (Document, error) {
	durable, err := store.load()
	if err != nil {
		return Document{}, err
	}
	if !store.matches(durable) {
		return Document{}, ErrIdentityConflict
	}
	if durable.Revision != expectedRevision || candidate.Revision != expectedRevision+1 {
		return durable, ErrRevisionConflict
	}
	if err := store.write(candidate); err != nil {
		return durable, err
	}
	return candidate, nil
}

func (store *Store) matches(document Document) bool {
	return document.ExperimentID == store.identity.ExperimentID && document.ManifestSHA256 == store.identity.ManifestSHA256 && document.ObservationSourceSHA256 == store.identity.ObservationSourceSHA256
}

func (store *Store) acceptObservedLocked(document Document) {
	changed := document.Revision != store.document.Revision
	store.document = document
	if changed {
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
}

func (store *Store) withAdvisoryLock(operation func() error) error {
	if err := store.ensureDirectory(); err != nil {
		return err
	}
	return store.root.WithLock(context.Background(), stateLockPath, operation)
}

func (store *Store) ensureDirectory() error {
	if err := store.root.EnsureDirectory(".local/experiment-lens", 0o755); err != nil {
		return fmt.Errorf("lensstate: create state directory: %w", err)
	}
	return nil
}

func (store *Store) load() (Document, error) {
	data, err := store.root.ReadRegular(statePath, maximumStateBytes)
	if err != nil {
		return Document{}, fmt.Errorf("lensstate: read state: %w", err)
	}
	var document Document
	if err := contracts.DecodeStrict(data, &document); err != nil {
		return Document{}, fmt.Errorf("lensstate: decode state: %w", err)
	}
	if err := document.Validate(); err != nil {
		return Document{}, err
	}
	return document, nil
}

func (store *Store) write(document Document) error {
	if err := document.Validate(); err != nil {
		return err
	}
	if err := store.ensureDirectory(); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	encoded = append(encoded, '\n')
	if len(encoded) > maximumStateBytes {
		return errors.New("lensstate: state exceeds the size limit")
	}
	return store.root.Replace(statePath, encoded, maximumStateBytes, 0o600)
}

func clone(document Document) (Document, error) {
	encoded, err := json.Marshal(document)
	if err != nil {
		return Document{}, err
	}
	var cloned Document
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return Document{}, err
	}
	return cloned, nil
}
