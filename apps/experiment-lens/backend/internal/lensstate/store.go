package lensstate

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

	"github.com/setta/experiment-lens/backend/internal/contracts"
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
	root        *os.Root
	identity    Identity
	document    Document
	subscribers map[chan Document]struct{}
	closed      bool
}

type advisoryLock struct {
	file *os.File
}

func Open(projectRoot string, identity Identity) (*Store, error) {
	if strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(identity.ExperimentID) == "" || strings.TrimSpace(identity.ManifestSHA256) == "" || strings.TrimSpace(identity.ObservationSourceSHA256) == "" {
		return nil, errors.New("lensstate: project root and identity are required")
	}
	root, err := os.OpenRoot(projectRoot)
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
	lock, err := store.acquireAdvisoryLock()
	if err != nil {
		return err
	}
	operationErr := operation()
	releaseErr := lock.release()
	return errors.Join(operationErr, releaseErr)
}

func (store *Store) acquireAdvisoryLock() (*advisoryLock, error) {
	if err := store.ensureDirectory(); err != nil {
		return nil, err
	}
	file, err := store.root.OpenFile(stateLockPath, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, fmt.Errorf("lensstate: open state lock: %w", err)
	}
	pathInfo, pathErr := store.root.Lstat(stateLockPath)
	fileInfo, fileErr := file.Stat()
	if pathErr != nil || fileErr != nil || pathInfo.Mode()&os.ModeSymlink != 0 || !pathInfo.Mode().IsRegular() || !fileInfo.Mode().IsRegular() || !os.SameFile(pathInfo, fileInfo) {
		_ = file.Close()
		return nil, errors.New("lensstate: state lock is not an admitted regular file")
	}
	if err := lockFile(file); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("lensstate: acquire state lock: %w", err)
	}
	return &advisoryLock{file: file}, nil
}

func (lock *advisoryLock) release() error {
	return errors.Join(unlockFile(lock.file), lock.file.Close())
}

func (store *Store) ensureDirectory() error {
	if err := store.root.MkdirAll(".local/experiment-lens", 0o755); err != nil {
		return fmt.Errorf("lensstate: create state directory: %w", err)
	}
	for _, name := range []string{".local", ".local/experiment-lens"} {
		info, err := store.root.Lstat(name)
		if err != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return errors.New("lensstate: state directory is not admitted")
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
		return Document{}, errors.New("lensstate: state path is not admitted")
	}
	file, err := store.root.Open(statePath)
	if err != nil {
		return Document{}, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maximumStateBytes+1))
	if err != nil || len(data) > maximumStateBytes {
		return Document{}, errors.New("lensstate: state exceeds the size limit")
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
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return err
	}
	temporary := ".local/experiment-lens/.state-" + hex.EncodeToString(random) + ".json"
	file, err := store.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	installed := false
	defer func() {
		_ = file.Close()
		if !installed {
			_ = store.root.Remove(temporary)
		}
	}()
	if _, err := file.Write(encoded); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := store.root.Rename(temporary, statePath); err != nil {
		return err
	}
	installed = true
	directory, err := store.root.Open(".local/experiment-lens")
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
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
