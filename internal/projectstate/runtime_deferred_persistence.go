package projectstate

import "context"

type scheduledPersist struct {
	ctx      context.Context
	snapshot Snapshot
}

func (r *Runtime) MutateAndPersistLater(ctx context.Context, mutate Mutation) (Snapshot, error) {
	return r.mutateAndPersistLaterWithHistoryMode(ctx, mutate, runtimeHistoryModeAppend)
}

func (r *Runtime) mutateAndPersistLaterWithHistoryMode(ctx context.Context, mutate Mutation, historyMode runtimeHistoryMode) (Snapshot, error) {
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	persistCtx := detachedPersistContext(ctx)
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
			r.scheduleDeferredPersist(persistCtx, snapshot)
			return snapshot, nil
		},
	})
}

func detachedPersistContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return context.WithoutCancel(ctx)
}

func (r *Runtime) scheduleDeferredPersist(ctx context.Context, snapshot Snapshot) {
	if r == nil || r.savePolicy != SavePolicyPersist || r.saveFn == nil {
		return
	}

	r.persistStateMu.Lock()
	defer r.persistStateMu.Unlock()

	if snapshot.Revision <= r.persistedRevision {
		return
	}

	scheduled := &scheduledPersist{
		ctx: detachedPersistContext(ctx),
		snapshot: Snapshot{
			Document: snapshot.Document.Clone(),
			Revision: snapshot.Revision,
		},
	}
	if r.pendingPersist == nil || r.pendingPersist.snapshot.Revision <= scheduled.snapshot.Revision {
		r.pendingPersist = scheduled
	}
	if r.persistRunning {
		return
	}

	r.persistRunning = true
	r.persistWG.Add(1)
	go r.runDeferredPersistLoop()
}

func (r *Runtime) runDeferredPersistLoop() {
	defer r.persistWG.Done()

	for {
		scheduled, ok := r.dequeueDeferredPersist()
		if !ok {
			return
		}
		_ = r.persistSnapshotDeferred(scheduled.ctx, scheduled.snapshot)
	}
}

func (r *Runtime) dequeueDeferredPersist() (scheduledPersist, bool) {
	r.persistStateMu.Lock()
	defer r.persistStateMu.Unlock()

	for {
		if r.pendingPersist == nil {
			r.persistRunning = false
			return scheduledPersist{}, false
		}

		scheduled := *r.pendingPersist
		r.pendingPersist = nil
		if scheduled.snapshot.Revision <= r.persistedRevision {
			continue
		}
		return scheduled, true
	}
}

func (r *Runtime) persistSnapshotSync(ctx context.Context, snapshot Snapshot) error {
	return r.persistSnapshotSerialized(ctx, snapshot, false)
}

func (r *Runtime) persistSnapshotDeferred(ctx context.Context, snapshot Snapshot) error {
	return r.persistSnapshotSerialized(ctx, snapshot, true)
}

func (r *Runtime) persistSnapshotSerialized(ctx context.Context, snapshot Snapshot, deferred bool) error {
	if r.savePolicy != SavePolicyPersist || r.saveFn == nil {
		return nil
	}

	r.persistExecMu.Lock()
	defer r.persistExecMu.Unlock()

	r.persistStateMu.Lock()
	if snapshot.Revision <= r.persistedRevision {
		r.persistStateMu.Unlock()
		return nil
	}
	r.persistStateMu.Unlock()

	err := r.persistSnapshot(ctx, snapshot)

	r.persistStateMu.Lock()
	defer r.persistStateMu.Unlock()

	if err == nil {
		if snapshot.Revision > r.persistedRevision {
			r.persistedRevision = snapshot.Revision
		}
		if snapshot.Revision >= r.deferredPersistErrVersion {
			r.deferredPersistErr = nil
			r.deferredPersistErrVersion = 0
		}
		return nil
	}
	if deferred {
		r.deferredPersistErr = err
		r.deferredPersistErrVersion = snapshot.Revision
	}
	return err
}

func (r *Runtime) deferredPersistError() error {
	if r == nil {
		return nil
	}

	r.persistStateMu.Lock()
	defer r.persistStateMu.Unlock()
	return r.deferredPersistErr
}
