package director

import (
	"context"
	"errors"
	"fmt"
	"slices"
)

// The Director command center boundary.
//
// This is the one surface the shell talks to. It dispatches user intent and
// hands back the app-scoped snapshot and its pushed stream, and it exposes no
// pane, conversation, provider, or execution concept in either direction. The
// renderer therefore cannot know how routing, conversation execution,
// persistence, or presentation coordination work internally, which is the point:
// pane identity stopped owning conversational work, and nothing replaced it as a
// second application-level authority.
//
// The registry owns what is durably true. The command center owns what the user
// asked for.

// ErrDirectorUnavailable reports that the command center cannot serve a request
// because the app-scoped registry is not running. It is a runtime condition
// rather than something the caller asked for wrongly.
var ErrDirectorUnavailable = errors.New("director command center is unavailable")

// ErrDirectorIntentRejected reports that trusted state does not hold what the
// intent named. The request is wrong, not the app's state, so the caller is told
// rather than the failure being repaired.
var ErrDirectorIntentRejected = errors.New("director intent rejected")

// DirectorIntentKind is the catalog of user intents the command center accepts.
type DirectorIntentKind string

const (
	// DirectorIntentSelectWorkstream moves app-wide selection to a named
	// workstream.
	DirectorIntentSelectWorkstream DirectorIntentKind = "select_workstream"
	// DirectorIntentMoveSelection moves app-wide selection one step through the
	// workstreams the command center is showing.
	DirectorIntentMoveSelection DirectorIntentKind = "move_selection"
)

var directorIntentKinds = []DirectorIntentKind{
	DirectorIntentSelectWorkstream,
	DirectorIntentMoveSelection,
}

// DirectorSelectionDirection is one step through the ordered workstreams.
type DirectorSelectionDirection string

const (
	DirectorSelectionPrevious DirectorSelectionDirection = "previous"
	DirectorSelectionNext     DirectorSelectionDirection = "next"
)

var directorSelectionDirections = []DirectorSelectionDirection{
	DirectorSelectionPrevious,
	DirectorSelectionNext,
}

// DirectorSelectWorkstreamIntent names the workstream to select. It carries a
// workstream id and nothing else: there is no pane to open, focus, or resolve.
type DirectorSelectWorkstreamIntent struct {
	WorkstreamID string `json:"workstreamId"`
}

// DirectorMoveSelectionIntent moves selection relative to the current one. The
// app resolves which workstream that is, because the order is app state and the
// caller must not be able to select something the registry is not showing.
type DirectorMoveSelectionIntent struct {
	Direction DirectorSelectionDirection `json:"direction"`
}

// DirectorIntent is one dispatched user intent. Kind selects exactly one
// populated payload.
type DirectorIntent struct {
	Kind             DirectorIntentKind              `json:"kind"`
	SelectWorkstream *DirectorSelectWorkstreamIntent `json:"selectWorkstream"`
	MoveSelection    *DirectorMoveSelectionIntent    `json:"moveSelection"`
}

// DirectorReceipt is what a dispatch reports back. The durable change reaches
// the shell through the pushed stream like every other change, so the receipt
// says only what the app decided the intent meant: which workstream is selected
// now. A move with nowhere to go returns the selection it kept.
type DirectorReceipt struct {
	Kind DirectorIntentKind `json:"kind"`
	// SelectedWorkstreamID is the app-wide selection after the dispatch. It is
	// null only when the registry holds no workstream to select.
	SelectedWorkstreamID *string `json:"selectedWorkstreamId"`
}

// ValidateDirectorIntent rejects an intent before it reaches durable state.
func ValidateDirectorIntent(intent DirectorIntent) error {
	switch intent.Kind {
	case DirectorIntentSelectWorkstream:
		if intent.SelectWorkstream == nil || intent.MoveSelection != nil {
			return fmt.Errorf("director intent %q requires exactly its own payload", intent.Kind)
		}
		return validateIdentifier("director select workstream id", intent.SelectWorkstream.WorkstreamID)
	case DirectorIntentMoveSelection:
		if intent.MoveSelection == nil || intent.SelectWorkstream != nil {
			return fmt.Errorf("director intent %q requires exactly its own payload", intent.Kind)
		}
		return validateSelectionDirection(intent.MoveSelection.Direction)
	default:
		return fmt.Errorf("unknown director intent kind %q", intent.Kind)
	}
}

func validateSelectionDirection(direction DirectorSelectionDirection) error {
	if !slices.Contains(directorSelectionDirections, direction) {
		return fmt.Errorf("unknown director selection direction %q", direction)
	}
	return nil
}

// ValidateDirectorReceipt proves a receipt names a real selection.
func ValidateDirectorReceipt(receipt DirectorReceipt) error {
	if !slices.Contains(directorIntentKinds, receipt.Kind) {
		return fmt.Errorf("unknown director intent kind %q", receipt.Kind)
	}
	if receipt.SelectedWorkstreamID == nil {
		return nil
	}
	return validateIdentifier("director receipt selected workstream id", *receipt.SelectedWorkstreamID)
}

// CommandCenter is the application boundary the shell dispatches through.
type CommandCenter struct {
	registry *Registry
}

// NewCommandCenter builds the boundary over the app-scoped registry.
func NewCommandCenter(registry *Registry) (*CommandCenter, error) {
	if registry == nil {
		return nil, errors.New("director command center requires the app-scoped registry")
	}
	return &CommandCenter{registry: registry}, nil
}

func (center *CommandCenter) available() error {
	if center == nil || center.registry == nil {
		return ErrDirectorUnavailable
	}
	return nil
}

// Snapshot returns the bounded app-scoped projection and the cursor its
// subscription must continue from.
func (center *CommandCenter) Snapshot() (DirectorSnapshot, error) {
	if err := center.available(); err != nil {
		return DirectorSnapshot{}, err
	}
	return center.registry.Snapshot()
}

// Subscribe continues the pushed app-scoped stream from a cursor.
func (center *CommandCenter) Subscribe(cursor DirectorEventCursor) (DirectorEventSubscription, error) {
	if err := center.available(); err != nil {
		return nil, err
	}
	return center.registry.Subscribe(cursor)
}

// Dispatch carries out one intent. Selection is durable app state, so a
// dispatch commits a fact and the resulting change reaches every subscriber
// through the same fold every other change does.
func (center *CommandCenter) Dispatch(ctx context.Context, intent DirectorIntent) (DirectorReceipt, error) {
	if err := center.available(); err != nil {
		return DirectorReceipt{}, err
	}
	if ctx == nil {
		return DirectorReceipt{}, errors.New("director dispatch context is required")
	}
	if err := ValidateDirectorIntent(intent); err != nil {
		return DirectorReceipt{}, fmt.Errorf("%w: %w", ErrDirectorIntentRejected, err)
	}
	selected, err := center.dispatchSelection(ctx, intent)
	if err != nil {
		return DirectorReceipt{}, err
	}
	receipt := DirectorReceipt{Kind: intent.Kind, SelectedWorkstreamID: selected}
	if err := ValidateDirectorReceipt(receipt); err != nil {
		return DirectorReceipt{}, err
	}
	return receipt, nil
}

func (center *CommandCenter) dispatchSelection(
	ctx context.Context,
	intent DirectorIntent,
) (*string, error) {
	switch intent.Kind {
	case DirectorIntentSelectWorkstream:
		return center.registry.SelectWorkstream(ctx, intent.SelectWorkstream.WorkstreamID)
	case DirectorIntentMoveSelection:
		return center.registry.MoveSelection(ctx, intent.MoveSelection.Direction)
	default:
		return nil, fmt.Errorf("unknown director intent kind %q", intent.Kind)
	}
}
