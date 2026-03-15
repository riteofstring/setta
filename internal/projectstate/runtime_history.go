package projectstate

import (
	"context"
	"reflect"
)

func applyRuntimeMutationState(state *runtimeState, normalized Document) bool {
	if state == nil {
		return false
	}
	if reflect.DeepEqual(state.current, normalized) {
		return false
	}
	state.current = normalized.Clone()
	state.revision++
	recordRuntimeHistoryState(state, state.current)
	return true
}

func recordRuntimeHistoryState(state *runtimeState, document Document) {
	if state == nil {
		return
	}

	cloned := document.Clone()
	if len(state.history) == 0 {
		state.history = []Document{cloned}
		state.historyIndex = 0
		return
	}
	if state.historyIndex < 0 {
		state.historyIndex = 0
	}
	if state.historyIndex >= len(state.history) {
		state.historyIndex = len(state.history) - 1
	}

	if reflect.DeepEqual(state.history[state.historyIndex], cloned) {
		return
	}

	state.history = append(state.history[:state.historyIndex+1], cloned)
	if len(state.history) > defaultRuntimeHistorySize {
		excess := len(state.history) - defaultRuntimeHistorySize
		state.history = state.history[excess:]
	}
	state.historyIndex = len(state.history) - 1
}

func undoRuntimeState(state *runtimeState, steps int) bool {
	if state == nil || steps <= 0 || len(state.history) == 0 {
		return false
	}

	targetIndex := state.historyIndex - steps
	if targetIndex < 0 {
		targetIndex = 0
	}
	if targetIndex == state.historyIndex {
		return false
	}

	state.historyIndex = targetIndex
	state.current = state.history[state.historyIndex].Clone()
	state.revision++
	return true
}

func redoRuntimeState(state *runtimeState, steps int) bool {
	if state == nil || steps <= 0 || len(state.history) == 0 {
		return false
	}

	targetIndex := state.historyIndex + steps
	if targetIndex >= len(state.history) {
		targetIndex = len(state.history) - 1
	}
	if targetIndex == state.historyIndex {
		return false
	}

	state.historyIndex = targetIndex
	state.current = state.history[state.historyIndex].Clone()
	state.revision++
	return true
}

func (r *Runtime) UndoAndSave(ctx context.Context, projectID string, steps int) (Snapshot, error) {
	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			if _, err := state.current.ProjectByID(projectID); err != nil {
				return snapshotFromState(*state), err
			}
			undoRuntimeState(state, steps)
			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshot(ctx, snapshot)
		},
	})
}

func (r *Runtime) RedoAndSave(ctx context.Context, projectID string, steps int) (Snapshot, error) {
	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			if _, err := state.current.ProjectByID(projectID); err != nil {
				return snapshotFromState(*state), err
			}
			redoRuntimeState(state, steps)
			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshot(ctx, snapshot)
		},
	})
}
