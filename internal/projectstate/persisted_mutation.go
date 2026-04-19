package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
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
		return "", ErrAppSpecStoreUnsupported
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

			normalized, err := plan.NextDocument.Normalized()
			if err != nil {
				return snapshotFromState(*state), err
			}

			nextState := runtimeState{
				current:  state.current.Clone(),
				revision: state.revision,
			}
			if !reflect.DeepEqual(state.current, normalized) {
				nextState.current = normalized.Clone()
				nextState.revision++
			}
			nextSnapshot := snapshotFromState(nextState)

			if plan.ApplyExternalChanges != nil {
				if err := plan.ApplyExternalChanges(); err != nil {
					return snapshotFromState(*state), err
				}
			}

			if err := r.persistSnapshot(ctx, nextSnapshot); err != nil {
				if plan.RollbackExternalChanges == nil {
					return snapshotFromState(*state), err
				}
				rollbackErr := plan.RollbackExternalChanges()
				if rollbackErr != nil {
					return snapshotFromState(*state), errors.Join(err, rollbackErr)
				}
				return snapshotFromState(*state), err
			}

			*state = nextState
			return nextSnapshot, nil
		},
	})
}
