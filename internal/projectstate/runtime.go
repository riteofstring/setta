package projectstate

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

const (
	defaultRuntimeQueueSize   = 64
	defaultRuntimeHistorySize = 1000
)

var (
	ErrRuntimeClosed   = errors.New("project runtime is closed")
	ErrMutationMissing = errors.New("project runtime mutation is required")
)

type SavePolicy string

const (
	SavePolicyPersist  SavePolicy = "persist"
	SavePolicyInMemory SavePolicy = "in_memory"
)

type Snapshot struct {
	Document Document
	Revision uint64
}

type Mutation func(Document) (Document, error)
type BeforeSaveHook func(context.Context, Snapshot) error
type AfterSaveHook func(context.Context, Snapshot) error
type PersistedDocumentTransform func(Document) (Document, error)

type RuntimeOptions struct {
	BeforeSave                     BeforeSaveHook
	AfterSave                      AfterSaveHook
	PersistedTransform             PersistedDocumentTransform
	PasswordSecrets                PasswordSecretStore
	PythonCodegenSectionReconciler PythonCodegenSectionReconciler
	WatchCodeIgnoredRoots          []string
}

type Runtime struct {
	store      *Store
	savePolicy SavePolicy
	saveFn     func(context.Context, Document) error
	beforeSave BeforeSaveHook
	afterSave  AfterSaveHook
	transform  PersistedDocumentTransform

	stateMu  sync.RWMutex
	current  Document
	revision uint64

	persistStateMu            sync.Mutex
	persistExecMu             sync.Mutex
	persistRunning            bool
	pendingPersist            *scheduledPersist
	persistWG                 sync.WaitGroup
	persistedRevision         uint64
	deferredPersistErr        error
	deferredPersistErrVersion uint64

	frontendOpsMu        sync.RWMutex
	pendingFrontendOps   map[string]struct{}
	completedFrontendOps []string

	pythonCodegenSectionReconciler PythonCodegenSectionReconciler

	submitMu sync.Mutex
	closed   bool
	ops      chan operation
	done     chan struct{}
}

type operation struct {
	run          func(*runtimeState) (Snapshot, error)
	frontendOpID string
	result       chan operationResult
}

type operationResult struct {
	snapshot Snapshot
	err      error
}

type runtimeState struct {
	current      Document
	revision     uint64
	history      []Document
	historyIndex int
}

func OpenRuntimeWithOptions(ctx context.Context, store *Store, options RuntimeOptions) (*Runtime, error) {
	if store == nil {
		return nil, fmt.Errorf("project store is required")
	}

	document, err := store.Load(ctx)
	if err != nil {
		return nil, err
	}
	document = document.withPasswordSecrets(options.PasswordSecrets)
	watchCodeIgnoredRoots, err := normalizeWatchCodeIgnoredRoots(options.WatchCodeIgnoredRoots)
	if err != nil {
		return nil, fmt.Errorf("normalize watch code ignored roots: %w", err)
	}
	document = document.withWatchCodeIgnoredRoots(watchCodeIgnoredRoots)

	runtime, err := openRuntime(document, saveController{
		store:      store,
		savePolicy: SavePolicyPersist,
		saveFn:     store.Save,
		beforeSave: options.BeforeSave,
		afterSave:  options.AfterSave,
		transform:  options.PersistedTransform,
	})
	if err != nil {
		return nil, err
	}
	runtime.pythonCodegenSectionReconciler = options.PythonCodegenSectionReconciler
	return runtime, nil
}

func OpenOverlayRuntime(document Document) (*Runtime, error) {
	return OpenOverlayRuntimeWithOptions(document, RuntimeOptions{})
}

func OpenOverlayRuntimeWithOptions(document Document, options RuntimeOptions) (*Runtime, error) {
	document = document.withPasswordSecrets(options.PasswordSecrets)
	watchCodeIgnoredRoots, err := normalizeWatchCodeIgnoredRoots(options.WatchCodeIgnoredRoots)
	if err != nil {
		return nil, fmt.Errorf("normalize watch code ignored roots: %w", err)
	}
	document = document.withWatchCodeIgnoredRoots(watchCodeIgnoredRoots)
	runtime, err := openRuntime(document, saveController{
		savePolicy: SavePolicyInMemory,
		beforeSave: options.BeforeSave,
		afterSave:  options.AfterSave,
		transform:  options.PersistedTransform,
	})
	if err != nil {
		return nil, err
	}
	runtime.pythonCodegenSectionReconciler = options.PythonCodegenSectionReconciler
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

func (r *Runtime) LoadPersistedDocument(ctx context.Context) (Document, error) {
	if r == nil {
		return Document{}, ErrRuntimeClosed
	}
	if r.store == nil {
		return r.Snapshot().Document, nil
	}
	return r.store.LoadRaw(ctx)
}

func (r *Runtime) FrontendOpStatus() FrontendOpStatus {
	if r == nil {
		return FrontendOpStatus{}
	}

	r.frontendOpsMu.RLock()
	defer r.frontendOpsMu.RUnlock()

	return cloneFrontendOpStatus(r.pendingFrontendOps, r.completedFrontendOps)
}

func (r *Runtime) SnapshotAndConsumeFrontendOps() (Snapshot, FrontendOpStatus, error) {
	if r == nil {
		return Snapshot{}, FrontendOpStatus{}, ErrRuntimeClosed
	}

	status := FrontendOpStatus{}
	snapshot, err := r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			status = r.consumeFrontendOpsLocked()
			return snapshotFromState(*state), nil
		},
	})
	return snapshot, status, err
}

func (r *Runtime) SavePolicy() SavePolicy {
	if r == nil {
		return ""
	}
	return r.savePolicy
}

func (r *Runtime) Mutate(mutate Mutation) (Snapshot, error) {
	return r.mutateWithHistoryMode(mutate, runtimeHistoryModeAppend)
}

func (r *Runtime) mutateWithHistoryMode(mutate Mutation, historyMode runtimeHistoryMode) (Snapshot, error) {
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

			applyRuntimeMutationState(state, normalized, historyMode)

			return snapshotFromState(*state), nil
		},
	})
}

func (r *Runtime) MutateWithContext(ctx context.Context, mutate Mutation) (Snapshot, error) {
	return r.mutateWithContextAndHistoryMode(ctx, mutate, runtimeHistoryModeAppend)
}

func (r *Runtime) mutateWithContextAndHistoryMode(ctx context.Context, mutate Mutation, historyMode runtimeHistoryMode) (Snapshot, error) {
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	return r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			nextDocument, err := mutate(state.current.Clone())
			if err != nil {
				return snapshotFromState(*state), err
			}

			normalized, err := nextDocument.Normalized()
			if err != nil {
				return snapshotFromState(*state), err
			}

			applyRuntimeMutationState(state, normalized, historyMode)

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
			recordRuntimeHistoryState(state, state.current)
			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshotSync(ctx, snapshot)
		},
		frontendOpID: frontendOpIDFromContext(ctx),
	})
}

func (r *Runtime) MutateAndSave(ctx context.Context, mutate Mutation) (Snapshot, error) {
	return r.mutateAndSaveWithHistoryMode(ctx, mutate, runtimeHistoryModeAppend)
}

func (r *Runtime) mutateAndSaveWithHistoryMode(ctx context.Context, mutate Mutation, historyMode runtimeHistoryMode) (Snapshot, error) {
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	return r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			nextDocument, err := mutate(state.current.Clone())
			if err != nil {
				return snapshotFromState(*state), err
			}

			normalized, err := nextDocument.Normalized()
			if err != nil {
				return snapshotFromState(*state), err
			}

			applyRuntimeMutationState(state, normalized, historyMode)
			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshotSync(ctx, snapshot)
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
	r.persistWG.Wait()
	return r.deferredPersistError()
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
		frontendOpID := normalizeFrontendOpID(op.frontendOpID)
		if frontendOpID != "" {
			r.registerPendingFrontendOp(frontendOpID)
		}
		snapshot, err := op.run(&state)
		if frontendOpID != "" {
			r.finalizeFrontendOp(frontendOpID, err == nil)
		}
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

func (r *Runtime) registerPendingFrontendOp(frontendOpID string) {
	r.frontendOpsMu.Lock()
	defer r.frontendOpsMu.Unlock()

	if r.pendingFrontendOps == nil {
		r.pendingFrontendOps = map[string]struct{}{}
	}
	r.pendingFrontendOps[frontendOpID] = struct{}{}
}

func (r *Runtime) finalizeFrontendOp(frontendOpID string, success bool) {
	r.frontendOpsMu.Lock()
	defer r.frontendOpsMu.Unlock()

	delete(r.pendingFrontendOps, frontendOpID)
	if !success {
		return
	}
	for _, completedFrontendOpID := range r.completedFrontendOps {
		if completedFrontendOpID == frontendOpID {
			return
		}
	}
	r.completedFrontendOps = append(r.completedFrontendOps, frontendOpID)
}

func (r *Runtime) consumeFrontendOpsLocked() FrontendOpStatus {
	r.frontendOpsMu.Lock()
	defer r.frontendOpsMu.Unlock()

	status := cloneFrontendOpStatus(r.pendingFrontendOps, r.completedFrontendOps)
	r.completedFrontendOps = nil
	return status
}

func snapshotFromState(state runtimeState) Snapshot {
	return Snapshot{
		Document: state.current.Clone(),
		Revision: state.revision,
	}
}

func (r *Runtime) persistSnapshot(ctx context.Context, snapshot Snapshot) error {
	if r.savePolicy != SavePolicyPersist || r.saveFn == nil {
		return nil
	}
	if r.beforeSave != nil {
		if err := r.beforeSave(ctx, snapshot); err != nil {
			return err
		}
	}
	documentToPersist := snapshot.Document.Clone()
	if r.transform != nil {
		transformed, err := r.transform(documentToPersist)
		if err != nil {
			return err
		}
		documentToPersist = transformed
	}
	if err := r.saveFn(ctx, documentToPersist); err != nil {
		return err
	}
	if r.afterSave != nil {
		if err := r.afterSave(ctx, snapshot); err != nil {
			return err
		}
	}
	return nil
}

type saveController struct {
	store      *Store
	savePolicy SavePolicy
	saveFn     func(context.Context, Document) error
	beforeSave BeforeSaveHook
	afterSave  AfterSaveHook
	transform  PersistedDocumentTransform
}

func openRuntime(document Document, controller saveController) (*Runtime, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return nil, err
	}

	runtime := &Runtime{
		store:                controller.store,
		savePolicy:           controller.savePolicy,
		saveFn:               controller.saveFn,
		beforeSave:           controller.beforeSave,
		afterSave:            controller.afterSave,
		transform:            controller.transform,
		current:              normalized.Clone(),
		revision:             1,
		pendingFrontendOps:   map[string]struct{}{},
		completedFrontendOps: []string{},
		ops:                  make(chan operation, defaultRuntimeQueueSize),
		done:                 make(chan struct{}),
	}
	go runtime.runLoop(runtimeState{
		current:      normalized.Clone(),
		revision:     1,
		history:      []Document{normalized.Clone()},
		historyIndex: 0,
	})
	return runtime, nil
}
