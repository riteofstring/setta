package director

import (
	"context"
	"fmt"

	"setta/internal/conversation"
)

// Carrying out the commands the user dispatches directly.
//
// A submitted request is routed: the Director decides what it means, because the
// user described work rather than naming it. These three are not. Cancelling a
// run, answering an approval, and supplying a folder are the user acting on
// something the command center is already showing them, so there is nothing to
// decide — only trusted state to resolve and one execution-port operation to
// run. Putting a model between the user and the thing they pointed at would add
// a way for the app to do something else.
//
// Two of the three commit no Director fact. The conversation already commits the
// interruption and the approval resolution durably, and the registry folds those
// into the same rails the command came from, so a second Director record of the
// same event could only disagree with it. Supplying a resource is the exception:
// no conversation event says the app's own request closed.

// CancelRun stops the run the user asked to stop.
func (executor *DecisionExecutor) CancelRun(ctx context.Context, intent DirectorCancelRunIntent) error {
	if err := executor.available(ctx); err != nil {
		return err
	}
	target, err := executor.registry.ActiveRunTarget(intent.WorkstreamID, intent.RunID)
	if err != nil {
		return err
	}
	return executor.execution.CancelRun(ctx, CancelRunRequest{
		ConversationID: target.ConversationID,
		WorkspaceID:    target.WorkspaceID,
		RunID:          target.RunID,
	})
}

// ResolveApproval answers one approval a run is waiting on. The answers cross to
// the provider path that asked for them and are never committed here: the
// durable resolution is the conversation's, with its secrets already redacted.
func (executor *DecisionExecutor) ResolveApproval(
	ctx context.Context,
	intent DirectorResolveApprovalIntent,
) error {
	if err := executor.available(ctx); err != nil {
		return err
	}
	target, err := executor.registry.PendingApprovalTarget(intent.ApprovalID)
	if err != nil {
		return err
	}
	return executor.execution.ResolveApproval(ctx, ResolveApprovalRequest{
		ConversationID: target.ConversationID,
		WorkspaceID:    target.WorkspaceID,
		RunID:          target.RunID,
		ApprovalID:     intent.ApprovalID,
		Decision:       intent.Decision,
		Answers:        append([]conversation.ConversationApprovalAnswer{}, intent.Answers...),
	})
}

// ResolveResourceRequest supplies the resource one open request is waiting for.
//
// The durable substrate gains the folder before the app records that it has one.
// The binding fact is a claim about what the workstream can now reach, so
// committing it first would leave the registry asserting a folder the
// conversation does not have if the bind failed. In the other order a lost fact
// leaves the request open, which is the state the user can act on again — and
// binding the same folder twice is the same durable state, so acting on it again
// resolves it.
func (executor *DecisionExecutor) ResolveResourceRequest(
	ctx context.Context,
	intent DirectorResolveResourceRequestIntent,
) error {
	executor.resourceMutex.Lock()
	defer executor.resourceMutex.Unlock()
	if err := executor.available(ctx); err != nil {
		return err
	}
	target, err := executor.registry.OpenResourceRequestTarget(intent.RequestID)
	if err != nil {
		return err
	}
	if target.Kind != WorkstreamResourceKindFolder {
		return fmt.Errorf(
			"%w: resource request %s is waiting for a %s, not a folder",
			ErrDirectorIntentRejected,
			intent.RequestID,
			target.Kind,
		)
	}
	folder, err := executor.registry.OfferedFolderResource(intent.WorkspaceID)
	if err != nil {
		return err
	}
	if err := executor.execution.BindWorkstreamResource(ctx, BindWorkstreamResourceRequest{
		ConversationID: target.ConversationID,
		WorkspaceID:    folder.WorkspaceID,
	}); err != nil {
		return err
	}
	return executor.commitResourceResolution(ctx, target, folder)
}

// CreateWorkstream starts a root workstream in a folder the command center is
// already offering, then moves selection to the workstream the durable
// conversation record registered.
func (executor *DecisionExecutor) CreateWorkstream(
	ctx context.Context,
	intent DirectorCreateWorkstreamIntent,
) (*string, error) {
	if err := executor.available(ctx); err != nil {
		return nil, err
	}
	folder, err := executor.registry.OfferedFolderResource(intent.WorkspaceID)
	if err != nil {
		return nil, err
	}
	conversationID, err := executor.newID("conversation")
	if err != nil {
		return nil, err
	}
	workstreamID, err := WorkstreamIDForConversation(conversationID)
	if err != nil {
		return nil, err
	}
	workspaceID := folder.WorkspaceID
	if err := executor.execution.StartWorkstream(ctx, WorkstreamStartRequest{
		ConversationID: conversationID,
		Origin:         WorkstreamOrigin{Kind: WorkstreamCreationRoot},
		Title:          intent.Title,
		WorkspaceID:    &workspaceID,
	}); err != nil {
		return nil, err
	}
	if err := executor.registry.awaitWorkstream(ctx, workstreamID); err != nil {
		return nil, err
	}
	return executor.registry.SelectWorkstream(ctx, workstreamID)
}

// commitResourceResolution records that the workstream gained the resource and
// that the request asking for it is closed. They are separate facts because they
// answer separate questions: what the workstream can reach now, and what the user
// is still being asked for.
func (executor *DecisionExecutor) commitResourceResolution(
	ctx context.Context,
	target ResourceRequestTarget,
	folder WorkstreamFolderResource,
) error {
	binding := WorkstreamResourceBinding{Kind: WorkstreamResourceKindFolder, Folder: &folder}
	if _, err := executor.appendFact(ctx, DirectorFactEvent{
		Kind:                    DirectorFactWorkstreamResourceBound,
		WorkstreamID:            &target.WorkstreamID,
		Actor:                   SemanticActorUser,
		WorkstreamResourceBound: &DirectorWorkstreamResourceBound{Binding: binding},
	}); err != nil {
		return err
	}
	_, err := executor.appendFact(ctx, DirectorFactEvent{
		Kind:         DirectorFactResourceRequestResolved,
		WorkstreamID: &target.WorkstreamID,
		Actor:        SemanticActorUser,
		ResourceRequestResolved: &DirectorResourceRequestResolved{
			RequestID: target.RequestID,
			Status:    ResourceRequestStatusResolved,
			Binding:   &binding,
		},
	})
	return err
}
