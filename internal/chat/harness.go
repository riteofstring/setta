package chat

import (
	"context"
	"errors"

	"setta/internal/workspace"
)

type Harness interface {
	StartTurn(context.Context, TurnRequest, TurnSink) (TurnCompletion, error)
	SteerTurn(context.Context, SteerRequest) error
	CancelTurn(context.Context, CancelRequest) error
	SubmitApproval(context.Context, ApprovalResponse) error
}

type HarnessGoalContinuationStarter interface {
	BeginGoalContinuation(context.Context, HarnessCommandRequest) (HarnessCommandResult, HarnessGoalContinuation, error)
}

type HarnessGoalContinuation interface {
	Wait(context.Context, TurnRequest, TurnSink) (TurnCompletion, error)
	Close()
}

type TurnOutcome string

const (
	TurnOutcomeCompleted TurnOutcome = "completed"
	TurnOutcomeCancelled TurnOutcome = "cancelled"
	TurnOutcomeFailed    TurnOutcome = "failed"
)

type TurnCompletion struct {
	Outcome      TurnOutcome
	ErrorMessage string
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

type SteerRequest struct {
	RunID          string
	WorkspaceID    string
	ConversationID string
	ThreadID       string
	TurnID         string
	Text           string
}

type ApprovalResponse struct {
	RunID      string
	ApprovalID string
	Approved   bool
	Answers    []ApprovalAnswer
	Response   string
	Cancelled  bool
}

var ErrTurnNotStarted = errors.New("turn has not started")

type HarnessRefUnavailableError struct {
	Err      error
	Harness  HarnessKind
	ThreadID string
	Message  string
}

func (err *HarnessRefUnavailableError) Error() string {
	if err.Message != "" {
		return err.Message
	}
	return string(err.Harness) + " thread ref unavailable: " + err.ThreadID
}

func (err *HarnessRefUnavailableError) Unwrap() error {
	return err.Err
}

type TurnSink interface {
	AssistantTextDelta(providerItemID string, text string) error
	ApprovalRequested(approval ApprovalRequest) error
	ApprovalResolved(approvalID string, approved bool, response string) error
	ProviderDiagnostic(code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error
	GoalUpdated(goal *ChatGoalState) error
	RunItemOutputDelta(providerItemID string, stream string, text string) error
	RunItemUpsert(item RunItem) error
	ThreadLinked(threadID string, sessionID string, turnID string) error
	Trace(eventType string, message string) error
}
