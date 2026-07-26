package director

import (
	"context"
	"fmt"

	"setta/internal/conversation"
)

// The Director execution port.
//
// This is the whole of what the Director needs the rest of the app to do:
// create the durable substrate a workstream runs on, deliver work to it, steer
// the run that is carrying work now, stop it, answer what it is waiting on,
// supply a resource it does not have, restart work a durable failure
// interrupted, retitle a workstream, and retire one the user is finished with.
// It is consumer-owned. Every request names Setta identities
// trusted product code minted before the call — the conversation a workstream
// executes on, the folder resource it is bound to when it has one, the run the
// work will be — and no provider id, thread, credential, lease, working
// directory, or execution detail appears in either direction.
//
// Ids are supplied rather than returned so the Director keeps authority over
// Setta identity. Run ids are minted immediately before the execution call;
// provider identities never cross this boundary.
//
// A managed runtime adapter satisfies exactly this contract. That is the point
// of stating it here rather than depending on the conversation service: the
// Director cannot grow a dependency on how local execution happens.
//
// A successful method has one additional semantic guarantee: the durable
// change is visible to the Director registry before the method returns. The
// provider may call another tool in the same turn, and that call must authorize
// against the effect that just succeeded rather than against a stale fold.

// WorkstreamResourceRequiredError reports work that cannot start until the user
// supplies a resource the workstream does not have. It is a product state, not
// a failure: the Director turns it into a durable resource request, which is
// the affordance the pane world could only derive from a routing failure code.
//
// Only work that declared it needs the user's own files reaches this. Producing
// an artifact, answering from the conversation, or anything else the app can do
// on its own runs without a folder.
type WorkstreamResourceRequiredError struct {
	// Kind is the resource the work is waiting for.
	Kind WorkstreamResourceKind
}

func (err *WorkstreamResourceRequiredError) Error() string {
	return fmt.Sprintf("workstream work requires a %s resource", err.Kind)
}

// WorkstreamStartRequest creates the durable substrate for one new workstream.
// It delivers no work: a workstream exists and is selectable before it runs
// anything, so creating it and starting its first run are separate facts.
type WorkstreamStartRequest struct {
	ConversationID string
	Title          string
	// WorkspaceID is the folder resource the workstream is scoped to, or nil
	// for a folderless workstream.
	WorkspaceID *string
}

// WorkDeliveryRequest is one unit of work the Director authored for a
// workstream that already exists.
type WorkDeliveryRequest struct {
	ConversationID string
	// WorkspaceID is the user's folder the work is authorized to read, or nil
	// when the work needs none. It is not where the provider process runs: that
	// is an execution detail the adapter owns, and work that needs no folder runs
	// just as well without one.
	WorkspaceID *string
	// RunID is the durable run this work becomes.
	RunID string
	Text  string
}

// SteerRunRequest changes the instruction of the run a workstream is carrying.
type SteerRunRequest struct {
	ConversationID string
	WorkspaceID    *string
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
	WorkspaceID    *string
	FailedRunID    string
	// RunID is the durable run the recovered work becomes.
	RunID string
}

// CancelRunRequest stops the run a workstream is carrying. The run is named
// rather than left to the adapter to resolve, because the user cancelled the run
// they were shown: a workstream can promote queued work the moment the previous
// run ends, and stopping whichever run happens to be active would stop work they
// never saw.
type CancelRunRequest struct {
	ConversationID string
	WorkspaceID    *string
	// RunID is the run the user asked to stop.
	RunID string
}

// ResolveApprovalRequest answers one approval the named run is waiting on.
// Answers may contain secrets, which is why this is a request to the execution
// port rather than a durable fact: the answer reaches the provider path that
// asked for it, and the durable trajectory the adapter writes carries the
// redacted resolution.
type ResolveApprovalRequest struct {
	ConversationID string
	WorkspaceID    *string
	// RunID is the run waiting on the approval.
	RunID      string
	ApprovalID string
	Decision   conversation.TrajectoryApprovalDecision
	Answers    []conversation.ConversationApprovalAnswer
}

// RenameWorkstreamRequest retitles one workstream. It names no folder resource
// because a title is app-scoped state: a workstream still waiting for a folder
// has a name the user reads in the command center just like every other one.
type RenameWorkstreamRequest struct {
	ConversationID string
	Title          string
}

// ArchiveWorkstreamRequest retires one workstream from the active list. It
// names no folder resource for the same reason a rename does not — work the
// user no longer wants may never have been given a folder at all.
type ArchiveWorkstreamRequest struct {
	ConversationID string
}

// BindWorkstreamResourceRequest attaches the folder resource the user supplied
// to the durable substrate a workstream runs on. It is what turns a workstream
// that was asked for a folder into one that can run the work needing it.
type BindWorkstreamResourceRequest struct {
	ConversationID string
	WorkspaceID    string
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
	// CancelRun stops the named run.
	CancelRun(ctx context.Context, request CancelRunRequest) error
	// ResolveApproval answers one approval the named run is waiting on.
	ResolveApproval(ctx context.Context, request ResolveApprovalRequest) error
	// RenameWorkstream retitles the workstream.
	RenameWorkstream(ctx context.Context, request RenameWorkstreamRequest) error
	// ArchiveWorkstream retires the workstream from the active list.
	ArchiveWorkstream(ctx context.Context, request ArchiveWorkstreamRequest) error
	// BindWorkstreamResource attaches a resource the user supplied.
	BindWorkstreamResource(ctx context.Context, request BindWorkstreamResourceRequest) error
	// RecoverRun restarts the work a durable failure interrupted.
	RecoverRun(ctx context.Context, request RecoverRunRequest) error
}
