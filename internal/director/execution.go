package director

import (
	"context"
	"fmt"
)

// The Director execution port.
//
// This is the whole of what the Director needs the rest of the app to do:
// create the durable substrate a workstream runs on, deliver work to it, steer
// the run that is carrying work now, and restart work a durable failure
// interrupted. It is consumer-owned. Every request names Setta identities
// trusted product code minted before the call — the conversation a workstream
// executes on, the folder resource it is bound to, the run the work will be —
// and no provider id, thread, credential, lease, or execution detail appears in
// either direction.
//
// Ids are supplied rather than returned, so a decision and the effect it
// authorizes address the same run across a crash: replaying the decision
// addresses the run it already named instead of minting a second one.
//
// A managed runtime adapter satisfies exactly this contract. That is the point
// of stating it here rather than depending on the conversation service: the
// Director cannot grow a dependency on how local execution happens.

// WorkstreamResourceRequiredError reports work that cannot start until the user
// supplies a resource the workstream does not have. It is a product state, not
// a failure: the Director turns it into a durable resource request, which is
// the affordance the pane world could only derive from a routing failure code.
type WorkstreamResourceRequiredError struct {
	// Kind is the resource the work is waiting for.
	Kind WorkstreamResourceKind
}

func (err *WorkstreamResourceRequiredError) Error() string {
	return fmt.Sprintf("workstream work requires a %s resource", err.Kind)
}

// WorkstreamOrigin is the durable parentage a new workstream is created with.
// A root workstream has none; a child hangs off its parent, and a fork
// additionally carries one completed run of that parent forward.
type WorkstreamOrigin struct {
	Kind WorkstreamCreationOriginKind
	// ParentConversationID is the substrate of the authorized parent. It is
	// empty exactly for a root origin.
	ParentConversationID string
	// ForkedAtRunID is the completed run a fork carries forward. It is empty
	// for every other origin.
	ForkedAtRunID string
}

// WorkstreamStartRequest creates the durable substrate for one new workstream.
// It delivers no work: a folderless workstream exists and is selectable before
// it can run anything, so creating it and starting its first run are separate
// facts.
type WorkstreamStartRequest struct {
	ConversationID string
	Title          string
	// WorkspaceID is the folder resource the workstream is scoped to, or nil
	// for a folderless workstream.
	WorkspaceID *string
	Origin      WorkstreamOrigin
}

// WorkDeliveryRequest is one unit of work the Director authored for a
// workstream that already exists.
type WorkDeliveryRequest struct {
	ConversationID string
	// WorkspaceID is the folder resource the work runs inside. Setta runs work
	// in a folder, so this is never empty: a workstream without one is waiting
	// for a resource rather than able to run.
	WorkspaceID string
	// RunID is the durable run this work becomes.
	RunID string
	Text  string
}

// SteerRunRequest changes the instruction of the run a workstream is carrying.
type SteerRunRequest struct {
	ConversationID string
	WorkspaceID    string
	// TargetRunID is the active run being steered.
	TargetRunID string
	Text        string
	// DecisionID is the durable Director decision this steering came from, so
	// the steered run records which decision changed it.
	DecisionID string
}

// RecoverRunRequest restarts the work a durable failure interrupted. The failed
// run's own authored input is the work, because the Director recovers a path
// rather than re-authoring the request the user already made.
type RecoverRunRequest struct {
	ConversationID string
	WorkspaceID    string
	FailedRunID    string
	// RunID is the durable run the recovered work becomes.
	RunID string
}

// WorkstreamExecution is the Director's execution boundary.
type WorkstreamExecution interface {
	// StartWorkstream creates the durable substrate a new workstream runs on.
	StartWorkstream(ctx context.Context, request WorkstreamStartRequest) error
	// SendWork starts a run on a workstream with no active run.
	SendWork(ctx context.Context, request WorkDeliveryRequest) error
	// QueueWork preserves the active run and queues work behind it.
	QueueWork(ctx context.Context, request WorkDeliveryRequest) error
	// SteerRun changes the instruction of the active run.
	SteerRun(ctx context.Context, request SteerRunRequest) error
	// RecoverRun restarts the work a durable failure interrupted.
	RecoverRun(ctx context.Context, request RecoverRunRequest) error
}
