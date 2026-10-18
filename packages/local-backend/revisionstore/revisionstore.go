package revisionstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"
	"sync"

	"github.com/riteofstring/setta/packages/local-backend/latestvalue"
	"github.com/riteofstring/setta/packages/local-backend/projectfs"
	"github.com/riteofstring/setta/packages/local-backend/strictjson"
)

var (
	ErrClosed           = errors.New("revisionstore: store is closed")
	ErrRevisionConflict = errors.New("revisionstore: revision conflict")
)

type Snapshot[T any] struct {
	Revision uint64 `json:"revision"`
	Value    T      `json:"value"`
}

type Options[T any] struct {
	Path     string
	Initial  T
	Validate func(T) error
	MaxBytes int64
}

type Store[T any] struct {
	mu        sync.Mutex
	root      *projectfs.Root
	options   Options[T]
	lockPath  string
	current   Snapshot[T]
	publisher *latestvalue.Publisher[Snapshot[T]]
	closed    bool
}

func Open[T any](root *projectfs.Root, options Options[T]) (*Store[T], error) {
	if root == nil {
		return nil, errors.New("revisionstore: project root is required")
	}
	if strings.TrimSpace(options.Path) == "" {
		return nil, errors.New("revisionstore: state path is required")
	}
	if options.MaxBytes <= 0 || options.MaxBytes > strictjson.MaximumBytes {
		return nil, fmt.Errorf("revisionstore: maximum size must be between 1 and %d bytes", strictjson.MaximumBytes)
	}
	store := &Store[T]{root: root, options: options, lockPath: options.Path + ".lock"}
	var current Snapshot[T]
	err := store.withAdvisoryLock(func() error {
		var initializeErr error
		current, initializeErr = store.loadOrInitialize()
		return initializeErr
	})
	if err != nil {
		return nil, err
	}
	publisher, err := latestvalue.New(current, clone[T])
	if err != nil {
		return nil, err
	}
	store.current = current
	store.publisher = publisher
	return store, nil
}

func (store *Store[T]) Snapshot() (Snapshot[T], error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return Snapshot[T]{}, ErrClosed
	}
	return clone(store.current)
}

func (store *Store[T]) Replace(expectedRevision uint64, value T) (Snapshot[T], error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return Snapshot[T]{}, ErrClosed
	}
	if err := store.validate(value); err != nil {
		return Snapshot[T]{}, err
	}
	candidate, err := clone(Snapshot[T]{Revision: expectedRevision + 1, Value: value})
	if err != nil {
		return Snapshot[T]{}, err
	}
	var observed Snapshot[T]
	loaded := false
	err = store.withAdvisoryLock(func() error {
		durable, loadErr := store.load()
		if loadErr != nil {
			return loadErr
		}
		observed, loaded = durable, true
		if durable.Revision != expectedRevision {
			return ErrRevisionConflict
		}
		if writeErr := store.write(candidate); writeErr != nil {
			return writeErr
		}
		observed = candidate
		return nil
	})
	if loaded {
		err = errors.Join(err, store.acceptObservedLocked(observed))
	}
	if err != nil {
		return Snapshot[T]{}, err
	}
	return clone(observed)
}

func (store *Store[T]) Subscribe(ctx context.Context) (<-chan Snapshot[T], error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrClosed
	}
	return store.publisher.Subscribe(ctx)
}

func (store *Store[T]) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	return store.publisher.Close()
}

func (store *Store[T]) loadOrInitialize() (Snapshot[T], error) {
	current, err := store.load()
	if !errors.Is(err, os.ErrNotExist) {
		return current, err
	}
	if err := store.validate(store.options.Initial); err != nil {
		return Snapshot[T]{}, err
	}
	initial, err := clone(Snapshot[T]{Revision: 0, Value: store.options.Initial})
	if err != nil {
		return Snapshot[T]{}, err
	}
	if err := store.write(initial); err != nil {
		return Snapshot[T]{}, err
	}
	return initial, nil
}

func (store *Store[T]) acceptObservedLocked(observed Snapshot[T]) error {
	changed := observed.Revision != store.current.Revision
	store.current = observed
	if changed {
		return store.publisher.Publish(observed)
	}
	return nil
}

func (store *Store[T]) validate(value T) error {
	if store.options.Validate == nil {
		return nil
	}
	if err := store.options.Validate(value); err != nil {
		return fmt.Errorf("revisionstore: invalid value: %w", err)
	}
	return nil
}

func (store *Store[T]) withAdvisoryLock(operation func() error) error {
	if err := store.ensureDirectory(); err != nil {
		return err
	}
	return store.root.WithLock(context.Background(), store.lockPath, operation)
}

func (store *Store[T]) ensureDirectory() error {
	directory := path.Dir(store.options.Path)
	if directory == "." {
		return nil
	}
	if err := store.root.EnsureDirectory(directory, 0o755); err != nil {
		return fmt.Errorf("revisionstore: create state directory: %w", err)
	}
	return nil
}

func (store *Store[T]) load() (Snapshot[T], error) {
	data, err := store.root.ReadRegular(store.options.Path, store.options.MaxBytes)
	if err != nil {
		return Snapshot[T]{}, fmt.Errorf("revisionstore: read state: %w", err)
	}
	var snapshot Snapshot[T]
	if err := strictjson.Decode(data, &snapshot); err != nil {
		return Snapshot[T]{}, fmt.Errorf("revisionstore: decode state: %w", err)
	}
	if err := store.validate(snapshot.Value); err != nil {
		return Snapshot[T]{}, err
	}
	return snapshot, nil
}

func (store *Store[T]) write(snapshot Snapshot[T]) error {
	encoded, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("revisionstore: encode state: %w", err)
	}
	encoded = append(encoded, '\n')
	if int64(len(encoded)) > store.options.MaxBytes {
		return errors.New("revisionstore: state exceeds the size limit")
	}
	if err := store.root.Replace(store.options.Path, encoded, store.options.MaxBytes, 0o600); err != nil {
		return fmt.Errorf("revisionstore: install replacement: %w", err)
	}
	return nil
}

func clone[T any](snapshot Snapshot[T]) (Snapshot[T], error) {
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return Snapshot[T]{}, fmt.Errorf("revisionstore: clone encode: %w", err)
	}
	var cloned Snapshot[T]
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return Snapshot[T]{}, fmt.Errorf("revisionstore: clone decode: %w", err)
	}
	return cloned, nil
}
