package runtime

import (
	"context"
	"errors"

	"setta/internal/conversation"
	"setta/internal/director"
)

// The local adapter behind the Director execution port.
//
// The Director states what it needs done in workstream language; this says it
// in the conversation service's own vocabulary and nothing more. Every id in a
// request was minted by trusted product code, so this adapter resolves nothing
// and decides nothing: it translates one call and passes every failure back
// unchanged.
//
// A managed-runtime adapter replaces exactly this file. That is why the port
// carries Setta identities rather than provider ones — nothing here is the
// Director's only possible execution path.

type directorWorkstreamCommands interface {
	StartDirectorWorkstream(
		context.Context,
		conversation.DirectorWorkstreamStart,
	) (conversation.ConversationSnapshot, error)
	SendDirectorTurn(context.Context, *string, string, string, string) (conversation.ConversationSnapshot, error)
	QueueDirectorTurn(context.Context, *string, string, string, string) (conversation.ConversationSnapshot, error)
	SteerDirectorTurn(
		context.Context,
		*string,
		string,
		string,
		string,
		string,
	) (conversation.ConversationSnapshot, error)
	CancelDirectorTurn(context.Context, *string, string, string) (conversation.ConversationSnapshot, error)
	SubmitDirectorApproval(
		context.Context,
		*string,
		string,
		string,
		conversation.ConversationApprovalResponse,
	) (conversation.ConversationSnapshot, error)
	RenameDirectorWorkstream(
		context.Context,
		string,
		string,
	) (conversation.ConversationSnapshot, error)
	ArchiveDirectorWorkstream(context.Context, string) (conversation.ConversationSnapshot, error)
	BindFolderResource(context.Context, string, string) (conversation.ConversationSnapshot, error)
	RecoverDirectorTurn(context.Context, *string, string, string, string) (conversation.ConversationSnapshot, error)
}

type directorWorkstreamExecution struct {
	conversations directorWorkstreamCommands
	registry      *director.Registry
}

func newDirectorWorkstreamExecution(
	conversations directorWorkstreamCommands,
	registry *director.Registry,
) (*directorWorkstreamExecution, error) {
	if conversations == nil || registry == nil {
		return nil, errors.New(
			"director workstream execution requires the conversation service and registry",
		)
	}
	return &directorWorkstreamExecution{conversations: conversations, registry: registry}, nil
}

func (execution *directorWorkstreamExecution) StartWorkstream(
	ctx context.Context,
	request director.WorkstreamStartRequest,
) error {
	snapshot, err := execution.conversations.StartDirectorWorkstream(
		ctx,
		conversation.DirectorWorkstreamStart{
			ConversationID: request.ConversationID,
			Title:          request.Title,
			WorkspaceID:    request.WorkspaceID,
		},
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) SendWork(
	ctx context.Context,
	request director.WorkDeliveryRequest,
) error {
	snapshot, err := execution.conversations.SendDirectorTurn(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
		request.Text,
		request.RunID,
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) QueueWork(
	ctx context.Context,
	request director.WorkDeliveryRequest,
) error {
	snapshot, err := execution.conversations.QueueDirectorTurn(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
		request.Text,
		request.RunID,
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) SteerRun(
	ctx context.Context,
	request director.SteerRunRequest,
) error {
	snapshot, err := execution.conversations.SteerDirectorTurn(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
		request.Text,
		request.TargetRunID,
		request.DecisionID,
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) CancelRun(
	ctx context.Context,
	request director.CancelRunRequest,
) error {
	snapshot, err := execution.conversations.CancelDirectorTurn(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
		request.RunID,
	)
	if err != nil {
		return err
	}
	return execution.registry.AwaitRunTerminal(
		context.WithoutCancel(ctx),
		request.ConversationID,
		request.RunID,
		snapshot.EventCursor.Sequence,
	)
}

func (execution *directorWorkstreamExecution) ResolveApproval(
	ctx context.Context,
	request director.ResolveApprovalRequest,
) error {
	snapshot, err := execution.conversations.SubmitDirectorApproval(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
		request.RunID,
		conversation.ConversationApprovalResponse{
			ApprovalID: request.ApprovalID,
			Decision:   request.Decision,
			Answers:    request.Answers,
		},
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) RenameWorkstream(
	ctx context.Context,
	request director.RenameWorkstreamRequest,
) error {
	snapshot, err := execution.conversations.RenameDirectorWorkstream(
		ctx,
		request.ConversationID,
		request.Title,
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) ArchiveWorkstream(
	ctx context.Context,
	request director.ArchiveWorkstreamRequest,
) error {
	snapshot, err := execution.conversations.ArchiveDirectorWorkstream(ctx, request.ConversationID)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) BindWorkstreamResource(
	ctx context.Context,
	request director.BindWorkstreamResourceRequest,
) error {
	snapshot, err := execution.conversations.BindFolderResource(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

func (execution *directorWorkstreamExecution) RecoverRun(
	ctx context.Context,
	request director.RecoverRunRequest,
) error {
	snapshot, err := execution.conversations.RecoverDirectorTurn(
		ctx,
		request.WorkspaceID,
		request.ConversationID,
		request.FailedRunID,
		request.RunID,
	)
	return execution.observe(ctx, request.ConversationID, snapshot, err)
}

// observe waits until the durable change a command made is visible to the
// registry. Command failures cross unchanged: the Director decides before it
// delivers whether work needs the user's files, so nothing this adapter returns
// needs interpreting into a product state.
func (execution *directorWorkstreamExecution) observe(
	ctx context.Context,
	conversationID string,
	snapshot conversation.ConversationSnapshot,
	commandErr error,
) error {
	if commandErr != nil {
		return commandErr
	}
	return execution.registry.AwaitConversationEvent(
		context.WithoutCancel(ctx),
		conversationID,
		snapshot.EventCursor.Sequence,
	)
}
