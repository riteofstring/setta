package chat

import (
	"context"

	"setta/internal/workspace"
)

type Harness interface {
	StartTurn(context.Context, TurnRequest, TurnSink) error
	CancelTurn(context.Context, CancelRequest) error
	SubmitApproval(context.Context, ApprovalResponse) error
}

type TurnRequest struct {
	Workspace    workspace.WorkspaceSummary
	Conversation Conversation
	Run          Run
	Prompt       string
	ThreadRef    HarnessThreadRef
}

type CancelRequest struct {
	RunID          string
	WorkspaceID    string
	ConversationID string
}

type ApprovalResponse struct {
	RunID      string
	ApprovalID string
	Approved   bool
	Response   string
	Cancelled  bool
}

type TurnSink interface {
	AssistantTextDelta(text string) error
	ApprovalRequested(approval ApprovalRequest) error
	ApprovalResolved(approvalID string, approved bool, response string) error
	ThreadLinked(threadID string, sessionID string, turnID string) error
	Trace(eventType string, message string) error
}
