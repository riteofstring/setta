package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/semanticcontext"
	"setta/internal/workspace"
)

type Harness interface {
	ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error)
	StartTurn(context.Context, TurnRequest, TurnSink) (TurnCompletion, error)
	SteerTurn(context.Context, SteerRequest) error
	CancelTurn(context.Context, CancelRequest) error
	SubmitApproval(context.Context, ApprovalResponse) error
}

type HarnessTaskRunner interface {
	RunTask(context.Context, HarnessTaskRequest) (HarnessTaskResult, error)
}

type HarnessSurface string
type HarnessTurnMode string
type HarnessOutputContractKind string

const (
	HarnessSurfaceMasterChat           HarnessSurface = "master_chat"
	HarnessSurfaceWorkflowAgent        HarnessSurface = "workflow_agent"
	HarnessSurfaceSemanticCartographer HarnessSurface = "semantic_cartographer"

	HarnessTurnInteractiveConversation HarnessTurnMode = "interactive_conversation"
	HarnessTurnStructuredTask          HarnessTurnMode = "structured_task"

	HarnessOutputFreeTextEvents HarnessOutputContractKind = "free_text_events"
	HarnessOutputStrictJSON     HarnessOutputContractKind = "strict_json_schema"
)

type HarnessTaskRequest struct {
	Surface          HarnessSurface          `json:"surface"`
	HarnessKind      HarnessKind             `json:"harnessKind"`
	TurnMode         HarnessTurnMode         `json:"turnMode"`
	OutputContract   HarnessOutputContract   `json:"outputContract"`
	CapabilityPolicy HarnessCapabilityPolicy `json:"capabilityPolicy"`
	ConversationTurn *HarnessConversationTurn
	StructuredTask   *HarnessStructuredTask `json:"structuredTask"`
	ThreadRef        HarnessThreadRef       `json:"threadRef"`
	Metadata         map[string]string      `json:"metadata"`
}

type HarnessOutputContract struct {
	Kind       HarnessOutputContractKind `json:"kind"`
	JSONSchema json.RawMessage           `json:"jsonSchema"`
}

type HarnessCapabilityPolicy struct {
	AllowedTools      []string `json:"allowedTools"`
	WorkspaceMutation bool     `json:"workspaceMutation"`
	Approvals         bool     `json:"approvals"`
	Streaming         bool     `json:"streaming"`
}

type HarnessConversationTurn struct {
	Request TurnRequest
	Sink    TurnSink
}

type HarnessStructuredTask struct {
	ID              string                     `json:"id"`
	Workspace       workspace.WorkspaceSummary `json:"workspace"`
	Prompt          string                     `json:"prompt"`
	Input           json.RawMessage            `json:"input"`
	Model           string                     `json:"model"`
	ReasoningEffort *ReasoningEffort           `json:"reasoningEffort"`
}

type HarnessTaskResult struct {
	Completion       TurnCompletion       `json:"completion"`
	StructuredOutput json.RawMessage      `json:"structuredOutput"`
	Audit            HarnessAuditMetadata `json:"audit"`
}

type HarnessAuditMetadata struct {
	HarnessKind HarnessKind             `json:"harnessKind"`
	Model       string                  `json:"model"`
	RequestID   string                  `json:"requestId"`
	ResponseID  string                  `json:"responseId"`
	ThreadRef   HarnessThreadRef        `json:"threadRef"`
	Diagnostics []HarnessTaskDiagnostic `json:"diagnostics"`
}

type HarnessTaskDiagnostic struct {
	Code     string             `json:"code"`
	Message  string             `json:"message"`
	Severity DiagnosticSeverity `json:"severity"`
	Context  map[string]string  `json:"context"`
}

var ErrUnsupportedHarnessTask = errors.New("unsupported harness task")

type conversationHarnessTaskRunner struct {
	harness Harness
}

func HarnessTaskRunnerFor(harness Harness) HarnessTaskRunner {
	if runner, ok := harness.(HarnessTaskRunner); ok {
		return runner
	}
	return conversationHarnessTaskRunner{harness: harness}
}

func (runner conversationHarnessTaskRunner) RunTask(ctx context.Context, request HarnessTaskRequest) (HarnessTaskResult, error) {
	return runConversationHarnessTask(ctx, request, runner.harness.StartTurn)
}

func runConversationHarnessTask(
	ctx context.Context,
	request HarnessTaskRequest,
	start func(context.Context, TurnRequest, TurnSink) (TurnCompletion, error),
) (HarnessTaskResult, error) {
	if request.ConversationTurn == nil {
		return HarnessTaskResult{}, fmt.Errorf("%w: conversation turn is required", ErrUnsupportedHarnessTask)
	}
	if request.StructuredTask != nil {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured task cannot be run as conversation", ErrUnsupportedHarnessTask)
	}
	if request.TurnMode != HarnessTurnInteractiveConversation {
		return HarnessTaskResult{}, fmt.Errorf("%w: turn mode %s", ErrUnsupportedHarnessTask, request.TurnMode)
	}
	if request.OutputContract.Kind != HarnessOutputFreeTextEvents {
		return HarnessTaskResult{}, fmt.Errorf("%w: output contract %s", ErrUnsupportedHarnessTask, request.OutputContract.Kind)
	}
	switch request.Surface {
	case HarnessSurfaceMasterChat, HarnessSurfaceWorkflowAgent:
	default:
		return HarnessTaskResult{}, fmt.Errorf("%w: surface %s", ErrUnsupportedHarnessTask, request.Surface)
	}
	completion, err := start(ctx, request.ConversationTurn.Request, request.ConversationTurn.Sink)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	return HarnessTaskResult{
		Completion: completion,
		Audit: HarnessAuditMetadata{
			HarnessKind: request.HarnessKind,
			Model:       conversationTaskModel(request.ConversationTurn.Request),
			ThreadRef:   request.ThreadRef,
		},
	}, nil
}

func conversationTaskModel(request TurnRequest) string {
	if request.Conversation.CodexSettings == nil {
		return ""
	}
	return request.Conversation.CodexSettings.Model
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
	Workspace       workspace.WorkspaceSummary
	Conversation    Conversation
	Run             Run
	Prompt          string
	SemanticContext *semanticcontext.Delivery
	ThreadRef       HarnessThreadRef
}

type CancelRequest struct {
	RunID          string
	WorkspaceID    string
	ConversationID string
}

type SteerRequest struct {
	RunID           string
	WorkspaceID     string
	ConversationID  string
	ThreadID        string
	TurnID          string
	Text            string
	SemanticContext *semanticcontext.Delivery
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

// BackgroundTerminalSink receives Codex unified-exec lifecycle events that are
// not scoped to an active run or turn. A background terminal can keep running,
// emitting output, and finally exit after the assistant turn that started it has
// completed; those late events arrive on the provider connection when no TurnSink
// is live. The sink is conversation-scoped and outlives any single turn, so it
// updates the backend-owned background terminal registry directly. Startup and
// interaction markers are chronological and stay on the run-scoped TurnSink path;
// only the run-independent output and completion updates route here.
type BackgroundTerminalSink interface {
	BackgroundTerminalOutputDelta(workspaceID string, conversationID string, providerItemID string, providerProcessID string, stream string, text string) error
	BackgroundTerminalCompleted(workspaceID string, conversationID string, providerItemID string, providerProcessID string, exitCode int, errorMessage string) error
}

type TurnSink interface {
	AssistantTextDelta(providerItemID string, text string) error
	ApprovalRequested(approval ApprovalRequest) error
	ApprovalResolved(approvalID string, approved bool, response string) error
	CodexEffectiveSettingsUpdated(settings ChatCodexEffectiveSettings) error
	ProviderDiagnostic(code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error
	GoalUpdated(goal *ChatGoalState) error
	RunItemOutputDelta(providerItemID string, stream string, text string) error
	RunItemUpsert(item RunItem) error
	ThreadLinked(threadID string, sessionID string, turnID string, settings *ChatCodexEffectiveSettings) error
	UserMessageCommitted(text string) error
	Trace(eventType string, message string) error
}
