package settingsstate

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
)

var (
	ErrRuntimeClosed   = errors.New("settings runtime is closed")
	ErrMutationMissing = errors.New("settings runtime mutation is required")
)

type Snapshot struct {
	Document Document
	Revision uint64
}

type Mutation func(Document) (Document, error)

type Runtime struct {
	mu       sync.RWMutex
	store    *Store
	current  Document
	revision uint64
	closed   bool
}

func OpenRuntime(ctx context.Context, store *Store) (*Runtime, error) {
	if store == nil {
		return nil, fmt.Errorf("settings store is required")
	}
	document, err := store.Load(ctx)
	if err != nil {
		return nil, err
	}
	return &Runtime{
		store:    store,
		current:  document,
		revision: 1,
	}, nil
}

func (r *Runtime) Snapshot() Snapshot {
	if r == nil {
		return Snapshot{}
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	return Snapshot{
		Document: r.current.Clone(),
		Revision: r.revision,
	}
}

func (r *Runtime) Mutate(mutate Mutation) (Snapshot, error) {
	return r.applyMutation(context.Background(), mutate, false)
}

func (r *Runtime) MutateAndSave(ctx context.Context, mutate Mutation) (Snapshot, error) {
	return r.applyMutation(ctx, mutate, true)
}

func (r *Runtime) ReplaceAndSave(ctx context.Context, document Document) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(Document) (Document, error) {
		return document, nil
	})
}

func (r *Runtime) Save(ctx context.Context) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed {
		return Snapshot{}, ErrRuntimeClosed
	}

	snapshot := Snapshot{
		Document: r.current.Clone(),
		Revision: r.revision,
	}
	if r.store != nil {
		if err := r.store.Save(ctx, snapshot.Document); err != nil {
			return Snapshot{}, err
		}
	}
	return snapshot, nil
}

func (r *Runtime) Close() error {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.closed = true
	return nil
}

func (r *Runtime) applyMutation(ctx context.Context, mutate Mutation, persist bool) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed {
		return Snapshot{}, ErrRuntimeClosed
	}

	nextDocument, err := mutate(r.current.Clone())
	if err != nil {
		return Snapshot{
			Document: r.current.Clone(),
			Revision: r.revision,
		}, err
	}

	normalized, err := nextDocument.Normalized()
	if err != nil {
		return Snapshot{}, err
	}
	if !reflect.DeepEqual(r.current, normalized) {
		r.current = normalized.Clone()
		r.revision++
	}

	snapshot := Snapshot{
		Document: r.current.Clone(),
		Revision: r.revision,
	}
	if persist && r.store != nil {
		if err := r.store.Save(ctx, snapshot.Document); err != nil {
			return Snapshot{}, err
		}
	}
	return snapshot, nil
}
