package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

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

type HarnessRunLivenessReconciler interface {
	ReconcileRunLiveness(context.Context, HarnessRunLivenessRequest) (HarnessRunLivenessResult, error)
}

type HarnessRunLivenessRequest struct {
	RunID          string
	WorkspaceID    string
	ConversationID string
	ThreadID       string
	TurnID         string
}

type HarnessThreadRuntimeStatus string

const (
	HarnessThreadRuntimeActive      HarnessThreadRuntimeStatus = "active"
	HarnessThreadRuntimeIdle        HarnessThreadRuntimeStatus = "idle"
	HarnessThreadRuntimeNotLoaded   HarnessThreadRuntimeStatus = "notLoaded"
	HarnessThreadRuntimeSystemError HarnessThreadRuntimeStatus = "systemError"
)

type HarnessTurnRuntimeStatus string

const (
	HarnessTurnRuntimeCompleted   HarnessTurnRuntimeStatus = "completed"
	HarnessTurnRuntimeFailed      HarnessTurnRuntimeStatus = "failed"
	HarnessTurnRuntimeInterrupted HarnessTurnRuntimeStatus = "interrupted"
	HarnessTurnRuntimeInProgress  HarnessTurnRuntimeStatus = "inProgress"
)

type HarnessRunLivenessResult struct {
	ThreadID     string
	ThreadStatus HarnessThreadRuntimeStatus
	TurnID       string
	TurnFound    bool
	TurnStatus   HarnessTurnRuntimeStatus
	TurnError    string
}

type HarnessProviderLifecycleError struct {
	Reason  RunLivenessReason
	Message string
	Err     error
}

func (err *HarnessProviderLifecycleError) Error() string {
	if err == nil {
		return "provider lifecycle error"
	}
	if err.Message == "" {
		if err.Err != nil {
			return err.Err.Error()
		}
		return "provider lifecycle error"
	}
	if err.Err == nil {
		return err.Message
	}
	return fmt.Sprintf("%s: %v", err.Message, err.Err)
}

func (err *HarnessProviderLifecycleError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Err
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

// HarnessGoalOperationStarter starts the logical, thread-scoped operation behind
// /goal set and /goal resume. The returned operation owns the run until the
// provider goal is terminal, cleared, cancelled, or fails.
type HarnessGoalOperationStarter interface {
	BeginGoalOperation(context.Context, HarnessCommandRequest) (HarnessCommandResult, HarnessGoalOperation, error)
}

type HarnessGoalOperation interface {
	// Wait must return promptly when ctx is canceled. Cancel requests provider-side
	// cancellation; the service still owns the context fallback that unblocks Wait.
	Wait(context.Context, TurnRequest, TurnSink) (TurnCompletion, error)
	Cancel(context.Context) error
	Close()
}

type HarnessGoalOperationCancelDrainer interface {
	CancelDrainTimeout() time.Duration
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

type ProviderTurnError struct {
	Message           string
	AdditionalDetails string
	CodexErrorInfo    json.RawMessage
	CodexErrorKind    string
	ProviderThreadID  string
	ProviderTurnID    string
	Retryable         bool
	StreamFailure     bool
}

type TurnRequest struct {
	Workspace       workspace.WorkspaceSummary
	Conversation    Conversation
	Run             Run
	Input           ChatInput
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
	Input           ChatInput
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

// ConnectionDiagnosticSink receives provider diagnostics from connection-scoped
// notifications that are not owned by any single turn. Implementations should
// record them at the provided workspace scope without guessing a conversation or
// run owner.
type ConnectionDiagnosticSink interface {
	ProviderConnectionDiagnostic(workspaceID string, code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error
}

type TurnSink interface {
	AssistantTextDelta(providerItemID string, text string) error
	ApprovalRequested(approval ApprovalRequest) error
	ApprovalResolved(approvalID string, approved bool, response string) error
	CodexEffectiveSettingsUpdated(settings ChatCodexEffectiveSettings) error
	ProviderTurnError(providerError ProviderTurnError) error
	ProviderDiagnostic(code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error
	GoalUpdated(goal *ChatGoalState) error
	RunItemOutputDelta(providerItemID string, stream string, text string) error
	RunItemUpsert(item RunItem) error
	ThreadLinked(threadID string, sessionID string, turnID string, settings *ChatCodexEffectiveSettings) error
	UserMessageCommitted(text string) error
	Trace(eventType string, message string) error
}
