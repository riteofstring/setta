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

// SelectView moves app-wide selection to a named workstream, or to the
// Director's own view when the workstream is nil, and reports what results.
func (registry *Registry) SelectView(ctx context.Context, workstreamID *string) (*string, error) {
	if workstreamID == nil {
		registry.selectMutex.Lock()
		defer registry.selectMutex.Unlock()
		return registry.commitSelection(ctx, func(_ *registryState, _ *string) (selectionTarget, error) {
			return selectionTarget{workstreamID: nil, resolved: true}, nil
		})
	}
	return registry.SelectWorkstream(ctx, *workstreamID)
}

// SelectWorkstream moves app-wide selection to a named workstream and reports
// the selection that results.
func (registry *Registry) SelectWorkstream(ctx context.Context, workstreamID string) (*string, error) {
	registry.selectMutex.Lock()
	defer registry.selectMutex.Unlock()
	return registry.commitSelection(ctx, func(state *registryState, _ *string) (selectionTarget, error) {
		workstream, known := state.workstreams[workstreamID]
		if !known || !state.isActiveWorkstream(workstream) {
			return selectionTarget{}, fmt.Errorf(
				"%w: workstream %s is not in the registry",
				ErrDirectorIntentRejected,
				workstreamID,
			)
		}
		selected := workstreamID
		return selectionTarget{workstreamID: &selected, resolved: true}, nil
	})
}

/*
 * MoveSelection moves selection one step through the views the command center
 * is showing and reports the selection that results.
 *
 * The views are the Director and then the workstreams, in that order, because
 * the Director is where the app opens and is what an unselected state means.
 * Selection is not the absence of a workstream: it is the Director's own view,
 * and arrowing back past the first workstream lands on it.
 *
 * The step is resolved over the same bounded, recency-ordered window the
 * snapshot draws, because selection must land on something the user can see. It
 * clamps at both ends rather than wrapping: holding the key at the end should
 * stop there, not jump back across the whole app.
 */
func (registry *Registry) MoveSelection(
	ctx context.Context,
	direction DirectorSelectionDirection,
) (*string, error) {
	if err := validateSelectionDirection(direction); err != nil {
		return nil, err
	}
	registry.selectMutex.Lock()
	defer registry.selectMutex.Unlock()
	return registry.commitSelection(ctx, func(state *registryState, pending *string) (selectionTarget, error) {
		return neighborView(state, pending, direction), nil
	})
}

// commitSelection resolves the next selection against the live fold and commits
// it. Resolution reads the pending selection rather than the folded one, so two
// dispatches in quick succession move two steps instead of racing on a selection
// the log has not published yet.
/*
 * selectionTarget is what a resolver decided.
 *
 * A nil workstream is the Director's view, which is a destination. That is not
 * the same as a move with nowhere to go, so `resolved` carries the difference —
 * without it the two are one value and the Director could never be arrowed to.
 */
type selectionTarget struct {
	workstreamID *string
	resolved     bool
}

func (registry *Registry) commitSelection(
	ctx context.Context,
	resolve func(state *registryState, pending *string) (selectionTarget, error),
) (*string, error) {
	registry.mutex.Lock()
	if err := registry.requireAvailableLocked(); err != nil {
		registry.mutex.Unlock()
		return nil, err
	}
	previous := copyOptionalString(registry.pendingSelection)
	target, err := resolve(registry.state, previous)
	if err != nil {
		registry.mutex.Unlock()
		return nil, err
	}
	if !target.resolved {
		selected := registry.state.activeSelection()
		registry.mutex.Unlock()
		return selected, nil
	}
	next := target.workstreamID
	if sameSelection(previous, next) {
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
		WorkstreamID:       next,
		Actor:              SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{PreviousWorkstreamID: previous},
	}
	committed, err := AppendDirectorFact(ctx, registry.facts, fact)
	if err != nil {
		return nil, err
	}
	// The durable append, not the caller's wait, advances the pending chain. A
	// request context may be cancelled after commit but before the follower
	// folds it; leaving the old predecessor here would make the next selection
	// commit a fact that contradicts the durable one already in the log.
	registry.mutex.Lock()
	registry.pendingSelection = copyOptionalString(next)
	registry.mutex.Unlock()
	if err := registry.awaitCommit(ctx, committed.CommitSequence); err != nil {
		return nil, err
	}
	registry.mutex.Lock()
	availabilityErr := registry.requireAvailableLocked()
	registry.mutex.Unlock()
	if availabilityErr != nil {
		return nil, availabilityErr
	}
	return next, nil
}

// neighborWorkstream is the workstream one step from the current selection, or
// nil when there is nothing to select at all.
// sameSelection compares two views, where nil is the Director's own.
func sameSelection(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

/*
 * neighborView is the view one step away.
 *
 * Position 0 is the Director and the workstreams follow it, so index -1 in the
 * window means the Director's view. Both ends clamp.
 */
func neighborView(
	state *registryState,
	selected *string,
	direction DirectorSelectionDirection,
) selectionTarget {
	window := boundWorkstreamWindow(state.activeRecencyOrdered(), MaxSnapshotWorkstreams, selected)
	if len(window) == 0 {
		// Nothing but the Director to be on, and it is already the selection.
		return selectionTarget{workstreamID: nil, resolved: selected != nil}
	}
	index := stepIndex(window, selected, direction)
	if index < 0 {
		return selectionTarget{workstreamID: nil, resolved: true}
	}
	next := window[index].record.ID
	return selectionTarget{workstreamID: &next, resolved: true}
}

/*
 * stepIndex is the position in the window the move lands on, or -1 for the
 * Director's view ahead of it.
 *
 * A selection the window no longer holds starts at the most recent workstream
 * rather than guessing where the missing one would have been.
 */
func stepIndex(
	window []*registryWorkstream,
	selected *string,
	direction DirectorSelectionDirection,
) int {
	if selected == nil {
		if direction == DirectorSelectionNext {
			return 0
		}
		return -1
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
		return current - 1
	}
}
