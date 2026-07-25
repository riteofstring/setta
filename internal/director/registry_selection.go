package director

import (
	"context"
	"fmt"
	"slices"
)

// Selection is the one fact the registry writes.
//
// It is persisted app state with no pane identity: a durable Director fact that
// reaches the registry through the same fold every other fact does. The fact
// names the selection it replaces, so two selections cannot reach the log in the
// opposite order to the one they were decided in, and a restart lands on the
// selection the user last made rather than on whichever workstream ran last.

// SelectWorkstream moves app-wide selection to a named workstream and reports
// the selection that results.
func (registry *Registry) SelectWorkstream(ctx context.Context, workstreamID string) (*string, error) {
	registry.selectMutex.Lock()
	defer registry.selectMutex.Unlock()
	return registry.commitSelection(ctx, func(state *registryState, _ *string) (*string, error) {
		if _, known := state.workstreams[workstreamID]; !known {
			return nil, fmt.Errorf("%w: workstream %s is not in the registry", ErrDirectorIntentRejected, workstreamID)
		}
		selected := workstreamID
		return &selected, nil
	})
}

// MoveSelection moves selection one step through the workstreams the command
// center is showing and reports the selection that results.
//
// The step is resolved over the same bounded, recency-ordered window the
// snapshot draws, because selection must land on something the user can see. It
// clamps at both ends rather than wrapping: holding the key at the end of the
// list should stop there, not jump back across the whole app. With nothing
// selected yet, either direction selects the most recent workstream, which is
// the work the next request is most likely about.
func (registry *Registry) MoveSelection(
	ctx context.Context,
	direction DirectorSelectionDirection,
) (*string, error) {
	if err := validateSelectionDirection(direction); err != nil {
		return nil, err
	}
	registry.selectMutex.Lock()
	defer registry.selectMutex.Unlock()
	return registry.commitSelection(ctx, func(state *registryState, pending *string) (*string, error) {
		return neighborWorkstream(state, pending, direction), nil
	})
}

// commitSelection resolves the next selection against the live fold and commits
// it. Resolution reads the pending selection rather than the folded one, so two
// dispatches in quick succession move two steps instead of racing on a selection
// the log has not published yet.
func (registry *Registry) commitSelection(
	ctx context.Context,
	resolve func(state *registryState, pending *string) (*string, error),
) (*string, error) {
	registry.mutex.Lock()
	if !registry.started {
		registry.mutex.Unlock()
		return nil, fmt.Errorf("%w: the app-scoped registry is not started", ErrDirectorUnavailable)
	}
	previous := copyOptionalString(registry.pendingSelection)
	next, err := resolve(registry.state, previous)
	if err != nil {
		registry.mutex.Unlock()
		return nil, err
	}
	if next == nil || (previous != nil && *previous == *next) {
		registry.mutex.Unlock()
		return previous, nil
	}
	emittedAt := registry.timestamp()
	registry.mutex.Unlock()

	factID, err := registry.newID("director-fact")
	if err != nil {
		return nil, err
	}
	fact := DirectorFactEvent{
		ID:                 factID,
		EmittedAt:          emittedAt,
		Kind:               DirectorFactWorkstreamSelected,
		WorkstreamID:       *next,
		Actor:              SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{PreviousWorkstreamID: previous},
	}
	if err := AppendDirectorFact(ctx, registry.facts, fact); err != nil {
		return nil, err
	}
	registry.mutex.Lock()
	registry.pendingSelection = copyOptionalString(next)
	registry.mutex.Unlock()
	return next, nil
}

// neighborWorkstream is the workstream one step from the current selection, or
// nil when there is nothing to select at all.
func neighborWorkstream(
	state *registryState,
	selected *string,
	direction DirectorSelectionDirection,
) *string {
	window := boundWorkstreamWindow(state.recencyOrdered(), MaxSnapshotWorkstreams, selected)
	if len(window) == 0 {
		return nil
	}
	next := window[stepIndex(window, selected, direction)].record.ID
	return &next
}

// stepIndex is the position in the window the move lands on. With nothing
// selected — or a selection the window no longer holds — the move starts at the
// most recent workstream rather than guessing where the missing one would have
// been.
func stepIndex(
	window []*registryWorkstream,
	selected *string,
	direction DirectorSelectionDirection,
) int {
	if selected == nil {
		return 0
	}
	current := slices.IndexFunc(window, func(workstream *registryWorkstream) bool {
		return workstream.record.ID == *selected
	})
	switch {
	case current < 0:
		return 0
	case direction == DirectorSelectionNext:
		return min(current+1, len(window)-1)
	default:
		return max(current-1, 0)
	}
}
