package projectstate

import (
	"context"
	"errors"
	"path/filepath"
)

type PersistedMutationPlan struct {
	NextDocument            Document
	ApplyExternalChanges    func() error
	RollbackExternalChanges func() error
}

type PersistedMutation func(Document) (PersistedMutationPlan, error)

func (r *Runtime) ProjectRoot() (string, error) {
	if r == nil {
		return "", ErrRuntimeClosed
	}
	if r.store == nil {
		return "", ErrPersistedStoreUnsupported
	}
	return filepath.Dir(r.store.Path()), nil
}

func (r *Runtime) MutatePersistedWithContext(
	ctx context.Context,
	mutate PersistedMutation,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	if mutate == nil {
		return Snapshot{}, ErrMutationMissing
	}

	return r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			plan, err := mutate(state.current.Clone())
			if err != nil {
				return snapshotFromState(*state), err
			}
			return r.applyPersistedMutationPlan(ctx, state, plan)
		},
	})
}

func (r *Runtime) applyPersistedMutationPlan(
	ctx context.Context,
	state *runtimeState,
	plan PersistedMutationPlan,
) (Snapshot, error) {
	normalized, err := plan.NextDocument.Normalized()
	if err != nil {
		return snapshotFromState(*state), err
	}

	previousState := cloneRuntimeState(*state)
	applyRuntimeMutationState(state, normalized, runtimeHistoryModeAppend)
	nextSnapshot := snapshotFromState(*state)

	if err := applyPersistedExternalChanges(plan); err != nil {
		return rollbackPersistedMutationState(state, previousState, plan, err)
	}

	if err := r.persistSnapshotSync(ctx, nextSnapshot); err != nil {
		if persistSnapshotErrorCommitted(err) {
			return nextSnapshot, err
		}
		return rollbackPersistedMutationState(state, previousState, plan, err)
	}

	return nextSnapshot, nil
}

func applyPersistedExternalChanges(plan PersistedMutationPlan) error {
	if plan.ApplyExternalChanges == nil {
		return nil
	}
	return plan.ApplyExternalChanges()
}

func rollbackPersistedMutationState(
	state *runtimeState,
	previousState runtimeState,
	plan PersistedMutationPlan,
	cause error,
) (Snapshot, error) {
	*state = previousState
	if plan.RollbackExternalChanges == nil {
		return snapshotFromState(*state), cause
	}

	rollbackErr := plan.RollbackExternalChanges()
	if rollbackErr != nil {
		return snapshotFromState(*state), errors.Join(cause, rollbackErr)
	}

	return snapshotFromState(*state), cause
}
