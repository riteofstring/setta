package projectstate

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
)

const defaultRuntimeQueueSize = 64

var (
	ErrRuntimeClosed   = errors.New("project runtime is closed")
	ErrMutationMissing = errors.New("project runtime mutation is required")
)

type Snapshot struct {
	Document Document
	Revision uint64
}

type Mutation func(Document) (Document, error)

type Runtime struct {
	store *Store

	stateMu  sync.RWMutex
	current  Document
	revision uint64

	submitMu sync.Mutex
	closed   bool
	ops      chan operation
	done     chan struct{}
}

type operation struct {
	run    func(*runtimeState) (Snapshot, error)
	result chan operationResult
}

type operationResult struct {
	snapshot Snapshot
	err      error
}

type runtimeState struct {
	current  Document
	revision uint64
}

func OpenRuntime(ctx context.Context, store *Store) (*Runtime, error) {
	if store == nil {
		return nil, fmt.Errorf("project store is required")
	}

	document, err := store.Load(ctx)
	if err != nil {
		return nil, err
	}

	runtime := &Runtime{
		store:    store,
		current:  document.Clone(),
		revision: 1,
		ops:      make(chan operation, defaultRuntimeQueueSize),
		done:     make(chan struct{}),
	}
	go runtime.runLoop(runtimeState{
		current:  document.Clone(),
		revision: 1,
	})
	return runtime, nil
}

func (r *Runtime) Snapshot() Snapshot {
	if r == nil {
		return Snapshot{}
	}

	r.stateMu.RLock()
	defer r.stateMu.RUnlock()

	return Snapshot{
		Document: r.current.Clone(),
		Revision: r.revision,
	}
}

func (r *Runtime) Mutate(mutate Mutation) (Snapshot, error) {
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			nextDocument, err := mutate(state.current.Clone())
			if err != nil {
				return snapshotFromState(*state), err
			}

			normalized, err := nextDocument.Normalized()
			if err != nil {
				return snapshotFromState(*state), err
			}

			if !reflect.DeepEqual(state.current, normalized) {
				state.current = normalized.Clone()
				state.revision++
			}

			return snapshotFromState(*state), nil
		},
	})
}

func (r *Runtime) Flush() (Snapshot, error) {
	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			return snapshotFromState(*state), nil
		},
	})
}

func (r *Runtime) Save(ctx context.Context) (Snapshot, error) {
	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			snapshot := snapshotFromState(*state)
			if err := r.store.Save(ctx, snapshot.Document); err != nil {
				return snapshot, err
			}
			return snapshot, nil
		},
	})
}

func (r *Runtime) Close() error {
	if r == nil {
		return nil
	}

	r.submitMu.Lock()
	if !r.closed {
		r.closed = true
		close(r.ops)
	}
	r.submitMu.Unlock()

	<-r.done
	return nil
}

func (r *Runtime) submit(op operation) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	op.result = make(chan operationResult, 1)

	r.submitMu.Lock()
	if r.closed {
		r.submitMu.Unlock()
		return Snapshot{}, ErrRuntimeClosed
	}
	r.ops <- op
	r.submitMu.Unlock()

	result := <-op.result
	return result.snapshot, result.err
}

func (r *Runtime) runLoop(initial runtimeState) {
	state := initial
	defer close(r.done)

	for op := range r.ops {
		snapshot, err := op.run(&state)
		r.syncState(state)
		op.result <- operationResult{
			snapshot: snapshot,
			err:      err,
		}
		close(op.result)
	}
}

func (r *Runtime) syncState(state runtimeState) {
	r.stateMu.Lock()
	defer r.stateMu.Unlock()

	r.current = state.current.Clone()
	r.revision = state.revision
}

func snapshotFromState(state runtimeState) Snapshot {
	return Snapshot{
		Document: state.current.Clone(),
		Revision: state.revision,
	}
}
