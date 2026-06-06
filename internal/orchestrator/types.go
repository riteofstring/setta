package orchestrator

import "encoding/json"

const SchemaVersion = 1

type WorkflowNodeKind string
type WorkflowEdgeKind string
type WorkflowActionKind string
type WorkflowConditionKind string
type WorkflowLoopLimitPolicy string
type WorkflowExecutionStatus string
type WorkflowNodeExecutionStatus string
type WorkflowTokenStatus string
type WorkflowGraphNodeStatus string
type WorkflowGraphEdgeStatus string
type WorkflowEventType string
type WorkflowValidationSeverity string
type WorkflowTerminalReason string
type WorkflowActionCompletionStatus string

const (
	NodeKindStart      WorkflowNodeKind = "start"
	NodeKindEnd        WorkflowNodeKind = "end"
	NodeKindAction     WorkflowNodeKind = "action"
	NodeKindGatewayAND WorkflowNodeKind = "gateway.and"
	NodeKindGatewayOR  WorkflowNodeKind = "gateway.or"
	NodeKindGatewayXOR WorkflowNodeKind = "gateway.xor"
	NodeKindLoopGuard  WorkflowNodeKind = "loop.guard"

	EdgeKindNormal       WorkflowEdgeKind = "normal"
	EdgeKindLoopContinue WorkflowEdgeKind = "loop_continue"
	EdgeKindLoopExit     WorkflowEdgeKind = "loop_exit"

	ActionKindAgentCodex WorkflowActionKind = "agent.codex"

	ConditionAlways         WorkflowConditionKind = "always"
	ConditionActionStatus   WorkflowConditionKind = "action_status"
	ConditionActionSignal   WorkflowConditionKind = "action_signal"
	ConditionScriptExitCode WorkflowConditionKind = "script_exit_code"

	LoopLimitCompleted WorkflowLoopLimitPolicy = "completed"
	LoopLimitFailed    WorkflowLoopLimitPolicy = "failed"
	LoopLimitStopped   WorkflowLoopLimitPolicy = "stopped"

	ExecutionStatusIdle      WorkflowExecutionStatus = "idle"
	ExecutionStatusRunning   WorkflowExecutionStatus = "running"
	ExecutionStatusCompleted WorkflowExecutionStatus = "completed"
	ExecutionStatusFailed    WorkflowExecutionStatus = "failed"
	ExecutionStatusStopped   WorkflowExecutionStatus = "stopped"
	ExecutionStatusCancelled WorkflowExecutionStatus = "cancelled"

	NodeExecutionStatusPending         WorkflowNodeExecutionStatus = "pending"
	NodeExecutionStatusReady           WorkflowNodeExecutionStatus = "ready"
	NodeExecutionStatusRunning         WorkflowNodeExecutionStatus = "running"
	NodeExecutionStatusSucceeded       WorkflowNodeExecutionStatus = "succeeded"
	NodeExecutionStatusFailed          WorkflowNodeExecutionStatus = "failed"
	NodeExecutionStatusCancelled       WorkflowNodeExecutionStatus = "cancelled"
	NodeExecutionStatusWaitingApproval WorkflowNodeExecutionStatus = "waiting_approval"

	TokenStatusActive    WorkflowTokenStatus = "active"
	TokenStatusCompleted WorkflowTokenStatus = "completed"
	TokenStatusCancelled WorkflowTokenStatus = "cancelled"

	GraphNodeStatusNotStarted      WorkflowGraphNodeStatus = "not_started"
	GraphNodeStatusPending         WorkflowGraphNodeStatus = "pending"
	GraphNodeStatusReady           WorkflowGraphNodeStatus = "ready"
	GraphNodeStatusRunning         WorkflowGraphNodeStatus = "running"
	GraphNodeStatusSucceeded       WorkflowGraphNodeStatus = "succeeded"
	GraphNodeStatusFailed          WorkflowGraphNodeStatus = "failed"
	GraphNodeStatusCancelled       WorkflowGraphNodeStatus = "cancelled"
	GraphNodeStatusWaitingApproval WorkflowGraphNodeStatus = "waiting_approval"

	GraphEdgeStatusInactive  WorkflowGraphEdgeStatus = "inactive"
	GraphEdgeStatusActive    WorkflowGraphEdgeStatus = "active"
	GraphEdgeStatusCompleted WorkflowGraphEdgeStatus = "completed"
	GraphEdgeStatusCancelled WorkflowGraphEdgeStatus = "cancelled"

	EventExecutionStarted   WorkflowEventType = "workflow.execution.started"
	EventNodeScheduled      WorkflowEventType = "workflow.node.scheduled"
	EventActionStarted      WorkflowEventType = "workflow.action.started"
	EventActionCompleted    WorkflowEventType = "workflow.action.completed"
	EventActionFailed       WorkflowEventType = "workflow.action.failed"
	EventActionCancelled    WorkflowEventType = "workflow.action.cancelled"
	EventActionApprovalWait WorkflowEventType = "workflow.action.waiting_approval"
	EventGatewayResolved    WorkflowEventType = "workflow.gateway.resolved"
	EventLoopAdvanced       WorkflowEventType = "workflow.loop.advanced"
	EventExecutionCompleted WorkflowEventType = "workflow.execution.completed"
	EventExecutionFailed    WorkflowEventType = "workflow.execution.failed"
	EventExecutionStopped   WorkflowEventType = "workflow.execution.stopped"
	EventExecutionCancelled WorkflowEventType = "workflow.execution.cancelled"

	ValidationSeverityError   WorkflowValidationSeverity = "error"
	ValidationSeverityWarning WorkflowValidationSeverity = "warning"

	TerminalReasonEndReached         WorkflowTerminalReason = "end_reached"
	TerminalReasonLimitReached       WorkflowTerminalReason = "limit_reached"
	TerminalReasonActionFailed       WorkflowTerminalReason = "action_failed"
	TerminalReasonActionCancelled    WorkflowTerminalReason = "action_cancelled"
	TerminalReasonExecutionCancelled WorkflowTerminalReason = "execution_cancelled"
	TerminalReasonInterrupted        WorkflowTerminalReason = "interrupted"
	TerminalReasonRoutingFailed      WorkflowTerminalReason = "routing_failed"

	ActionCompletionCompleted        WorkflowActionCompletionStatus = "completed"
	ActionCompletionFailed           WorkflowActionCompletionStatus = "failed"
	ActionCompletionCancelled        WorkflowActionCompletionStatus = "cancelled"
	ActionCompletionRequiresApproval WorkflowActionCompletionStatus = "requires_approval"
)

var (
	workflowNodeKindValues = []WorkflowNodeKind{
		NodeKindStart,
		NodeKindEnd,
		NodeKindAction,
		NodeKindGatewayAND,
		NodeKindGatewayOR,
		NodeKindGatewayXOR,
		NodeKindLoopGuard,
	}
	workflowEdgeKindValues = []WorkflowEdgeKind{
		EdgeKindNormal,
		EdgeKindLoopContinue,
		EdgeKindLoopExit,
	}
	workflowActionKindValues = []WorkflowActionKind{
		ActionKindAgentCodex,
	}
	workflowConditionKindValues = []WorkflowConditionKind{
		ConditionAlways,
		ConditionActionStatus,
		ConditionActionSignal,
		ConditionScriptExitCode,
	}
	workflowLoopLimitPolicyValues = []WorkflowLoopLimitPolicy{
		LoopLimitCompleted,
		LoopLimitFailed,
		LoopLimitStopped,
	}
	workflowExecutionStatusValues = []WorkflowExecutionStatus{
		ExecutionStatusIdle,
		ExecutionStatusRunning,
		ExecutionStatusCompleted,
		ExecutionStatusFailed,
		ExecutionStatusStopped,
		ExecutionStatusCancelled,
	}
	workflowNodeExecutionStatusValues = []WorkflowNodeExecutionStatus{
		NodeExecutionStatusPending,
		NodeExecutionStatusReady,
		NodeExecutionStatusRunning,
		NodeExecutionStatusSucceeded,
		NodeExecutionStatusFailed,
		NodeExecutionStatusCancelled,
		NodeExecutionStatusWaitingApproval,
	}
	workflowTokenStatusValues = []WorkflowTokenStatus{
		TokenStatusActive,
		TokenStatusCompleted,
		TokenStatusCancelled,
	}
	workflowGraphNodeStatusValues = []WorkflowGraphNodeStatus{
		GraphNodeStatusNotStarted,
		GraphNodeStatusPending,
		GraphNodeStatusReady,
		GraphNodeStatusRunning,
		GraphNodeStatusSucceeded,
		GraphNodeStatusFailed,
		GraphNodeStatusCancelled,
		GraphNodeStatusWaitingApproval,
	}
	workflowGraphEdgeStatusValues = []WorkflowGraphEdgeStatus{
		GraphEdgeStatusInactive,
		GraphEdgeStatusActive,
		GraphEdgeStatusCompleted,
		GraphEdgeStatusCancelled,
	}
	workflowEventTypeValues = []WorkflowEventType{
		EventExecutionStarted,
		EventNodeScheduled,
		EventActionStarted,
		EventActionCompleted,
		EventActionFailed,
		EventActionCancelled,
		EventActionApprovalWait,
		EventGatewayResolved,
		EventLoopAdvanced,
		EventExecutionCompleted,
		EventExecutionFailed,
		EventExecutionStopped,
		EventExecutionCancelled,
	}
	workflowValidationSeverityValues = []WorkflowValidationSeverity{
		ValidationSeverityError,
		ValidationSeverityWarning,
	}
	workflowTerminalReasonValues = []WorkflowTerminalReason{
		TerminalReasonEndReached,
		TerminalReasonLimitReached,
		TerminalReasonActionFailed,
		TerminalReasonActionCancelled,
		TerminalReasonExecutionCancelled,
		TerminalReasonInterrupted,
		TerminalReasonRoutingFailed,
	}
	workflowActionCompletionStatusValues = []WorkflowActionCompletionStatus{
		ActionCompletionCompleted,
		ActionCompletionFailed,
		ActionCompletionCancelled,
		ActionCompletionRequiresApproval,
	}
)

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "WorkflowNodeKind", Values: stringValues(workflowNodeKindValues)},
		{Name: "WorkflowEdgeKind", Values: stringValues(workflowEdgeKindValues)},
		{Name: "WorkflowActionKind", Values: stringValues(workflowActionKindValues)},
		{Name: "WorkflowConditionKind", Values: stringValues(workflowConditionKindValues)},
		{Name: "WorkflowLoopLimitPolicy", Values: stringValues(workflowLoopLimitPolicyValues)},
		{Name: "WorkflowExecutionStatus", Values: stringValues(workflowExecutionStatusValues)},
		{Name: "WorkflowNodeExecutionStatus", Values: stringValues(workflowNodeExecutionStatusValues)},
		{Name: "WorkflowTokenStatus", Values: stringValues(workflowTokenStatusValues)},
		{Name: "WorkflowGraphNodeStatus", Values: stringValues(workflowGraphNodeStatusValues)},
		{Name: "WorkflowGraphEdgeStatus", Values: stringValues(workflowGraphEdgeStatusValues)},
		{Name: "WorkflowEventType", Values: stringValues(workflowEventTypeValues)},
		{Name: "WorkflowValidationSeverity", Values: stringValues(workflowValidationSeverityValues)},
		{Name: "WorkflowTerminalReason", Values: stringValues(workflowTerminalReasonValues)},
		{Name: "WorkflowActionCompletionStatus", Values: stringValues(workflowActionCompletionStatusValues)},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

type WorkflowDefinition struct {
	SchemaVersion        int           `json:"schemaVersion"`
	ID                   string        `json:"id"`
	WorkspaceID          string        `json:"workspaceId"`
	Name                 string        `json:"name"`
	Description          string        `json:"description"`
	CurrentVersionID     string        `json:"currentVersionId"`
	CurrentVersionNumber int           `json:"currentVersionNumber"`
	Graph                WorkflowGraph `json:"graph"`
	CreatedAt            string        `json:"createdAt"`
	UpdatedAt            string        `json:"updatedAt"`
}

type WorkflowDefinitionVersion struct {
	SchemaVersion int           `json:"schemaVersion"`
	ID            string        `json:"id"`
	WorkspaceID   string        `json:"workspaceId"`
	DefinitionID  string        `json:"definitionId"`
	VersionNumber int           `json:"versionNumber"`
	Name          string        `json:"name"`
	Description   string        `json:"description"`
	Graph         WorkflowGraph `json:"graph"`
	CreatedAt     string        `json:"createdAt"`
}

type WorkflowGraph struct {
	Nodes []WorkflowNode `json:"nodes"`
	Edges []WorkflowEdge `json:"edges"`
}

type WorkflowNode struct {
	ID        string                   `json:"id"`
	Kind      WorkflowNodeKind         `json:"kind"`
	Title     string                   `json:"title"`
	Action    *WorkflowActionConfig    `json:"action"`
	Gateway   *WorkflowGatewayConfig   `json:"gateway"`
	LoopGuard *WorkflowLoopGuardConfig `json:"loopGuard"`
}

type WorkflowEdge struct {
	ID         string             `json:"id"`
	FromNodeID string             `json:"fromNodeId"`
	ToNodeID   string             `json:"toNodeId"`
	Kind       WorkflowEdgeKind   `json:"kind"`
	Condition  *WorkflowCondition `json:"condition"`
}

type WorkflowActionConfig struct {
	Kind  WorkflowActionKind         `json:"kind"`
	Codex *WorkflowCodexActionConfig `json:"codex"`
}

type WorkflowCodexActionConfig struct {
	Prompt            string `json:"prompt"`
	FreshConversation bool   `json:"freshConversation"`
	Model             string `json:"model"`
	ReasoningEffort   string `json:"reasoningEffort"`
}

type WorkflowGatewayConfig struct {
	RequiredIncoming []string `json:"requiredIncoming"`
}

type WorkflowLoopGuardConfig struct {
	MaxIterations     *int                    `json:"maxIterations"`
	LimitPolicy       WorkflowLoopLimitPolicy `json:"limitPolicy"`
	ContinueCondition *WorkflowCondition      `json:"continueCondition"`
	ExitCondition     *WorkflowCondition      `json:"exitCondition"`
}

type WorkflowCondition struct {
	Kind        WorkflowConditionKind        `json:"kind"`
	NodeID      string                       `json:"nodeId"`
	Status      *WorkflowNodeExecutionStatus `json:"status"`
	SignalName  string                       `json:"signalName"`
	SignalValue string                       `json:"signalValue"`
	ExitCode    *int                         `json:"exitCode"`
	Invert      bool                         `json:"invert"`
}

type WorkflowValidationResult struct {
	Valid       bool                           `json:"valid"`
	Diagnostics []WorkflowValidationDiagnostic `json:"diagnostics"`
}

type WorkflowValidationDiagnostic struct {
	Severity WorkflowValidationSeverity `json:"severity"`
	Code     string                     `json:"code"`
	Message  string                     `json:"message"`
	NodeID   string                     `json:"nodeId"`
	EdgeID   string                     `json:"edgeId"`
}

type WorkflowExecution struct {
	SchemaVersion          int                     `json:"schemaVersion"`
	ID                     string                  `json:"id"`
	WorkspaceID            string                  `json:"workspaceId"`
	DefinitionID           string                  `json:"definitionId"`
	DefinitionVersionID    string                  `json:"definitionVersionId"`
	Status                 WorkflowExecutionStatus `json:"status"`
	TerminalReason         *WorkflowTerminalReason `json:"terminalReason"`
	CreatedAt              string                  `json:"createdAt"`
	StartedAt              string                  `json:"startedAt"`
	UpdatedAt              string                  `json:"updatedAt"`
	CompletedAt            string                  `json:"completedAt"`
	Error                  string                  `json:"error"`
	NodeExecutions         []WorkflowNodeExecution `json:"nodeExecutions"`
	Tokens                 []WorkflowToken         `json:"tokens"`
	LoopIterations         []WorkflowLoopIteration `json:"loopIterations"`
	ActiveNodeExecutionIDs []string                `json:"activeNodeExecutionIds"`
	LastEventOrdinal       int                     `json:"lastEventOrdinal"`
}

type WorkflowNodeExecution struct {
	SchemaVersion  int                         `json:"schemaVersion"`
	ID             string                      `json:"id"`
	ExecutionID    string                      `json:"executionId"`
	NodeID         string                      `json:"nodeId"`
	Attempt        int                         `json:"attempt"`
	Iteration      int                         `json:"iteration"`
	Status         WorkflowNodeExecutionStatus `json:"status"`
	IdempotencyKey string                      `json:"idempotencyKey"`
	ScheduledAt    string                      `json:"scheduledAt"`
	StartedAt      string                      `json:"startedAt"`
	CompletedAt    string                      `json:"completedAt"`
	ActionKind     *WorkflowActionKind         `json:"actionKind"`
	Result         *WorkflowActionResult       `json:"result"`
	RunnerRefs     []WorkflowActionRunnerRef   `json:"runnerRefs"`
	Error          string                      `json:"error"`
}

type WorkflowActionResult struct {
	Status    WorkflowActionCompletionStatus `json:"status"`
	Signals   []WorkflowActionSignal         `json:"signals"`
	Output    json.RawMessage                `json:"output"`
	FilePaths []string                       `json:"filePaths"`
	ExitCode  *int                           `json:"exitCode"`
	Error     string                         `json:"error"`
}

type WorkflowActionSignal struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type WorkflowActionRunnerRef struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

type WorkflowToken struct {
	SchemaVersion int                 `json:"schemaVersion"`
	ID            string              `json:"id"`
	ExecutionID   string              `json:"executionId"`
	NodeID        string              `json:"nodeId"`
	SourceNodeID  string              `json:"sourceNodeId"`
	EdgeID        string              `json:"edgeId"`
	Iteration     int                 `json:"iteration"`
	Status        WorkflowTokenStatus `json:"status"`
	CreatedAt     string              `json:"createdAt"`
	CompletedAt   string              `json:"completedAt"`
}

type WorkflowLoopIteration struct {
	NodeID string `json:"nodeId"`
	Count  int    `json:"count"`
}

type WorkflowEvent struct {
	SchemaVersion       int               `json:"schemaVersion"`
	ID                  string            `json:"id"`
	WorkspaceID         string            `json:"workspaceId"`
	DefinitionID        string            `json:"definitionId"`
	DefinitionVersionID string            `json:"definitionVersionId"`
	ExecutionID         string            `json:"executionId"`
	Ordinal             int               `json:"ordinal"`
	Type                WorkflowEventType `json:"type"`
	NodeID              string            `json:"nodeId"`
	NodeExecutionID     string            `json:"nodeExecutionId"`
	TokenID             string            `json:"tokenId"`
	CreatedAt           string            `json:"createdAt"`
	Message             string            `json:"message"`
	Details             json.RawMessage   `json:"details"`
}

type WorkflowExecutionEventPage struct {
	ExecutionID        string          `json:"executionId"`
	Events             []WorkflowEvent `json:"events"`
	HasMoreOlder       bool            `json:"hasMoreOlder"`
	OlderBeforeOrdinal int             `json:"olderBeforeOrdinal"`
}

type WorkflowGraphProjection struct {
	SchemaVersion         int                      `json:"schemaVersion"`
	WorkspaceID           string                   `json:"workspaceId"`
	DefinitionID          string                   `json:"definitionId"`
	DefinitionVersionID   string                   `json:"definitionVersionId"`
	DefinitionName        string                   `json:"definitionName"`
	DefinitionDescription string                   `json:"definitionDescription"`
	ExecutionID           string                   `json:"executionId"`
	ExecutionStatus       *WorkflowExecutionStatus `json:"executionStatus"`
	TerminalReason        *WorkflowTerminalReason  `json:"terminalReason"`
	LastEventOrdinal      int                      `json:"lastEventOrdinal"`
	UpdatedAt             string                   `json:"updatedAt"`
	Nodes                 []WorkflowGraphNode      `json:"nodes"`
	Edges                 []WorkflowGraphEdge      `json:"edges"`
}

type WorkflowGraphNode struct {
	ID                    string                  `json:"id"`
	Kind                  WorkflowNodeKind        `json:"kind"`
	Title                 string                  `json:"title"`
	Label                 string                  `json:"label"`
	Status                WorkflowGraphNodeStatus `json:"status"`
	Active                bool                    `json:"active"`
	ExecutionCount        int                     `json:"executionCount"`
	LatestNodeExecutionID string                  `json:"latestNodeExecutionId"`
	LatestAttempt         int                     `json:"latestAttempt"`
	LatestIteration       int                     `json:"latestIteration"`
	ActionKind            *WorkflowActionKind     `json:"actionKind"`
	Signals               []WorkflowActionSignal  `json:"signals"`
	FilePaths             []string                `json:"filePaths"`
	Error                 string                  `json:"error"`
}

type WorkflowGraphEdge struct {
	ID                  string                  `json:"id"`
	Kind                WorkflowEdgeKind        `json:"kind"`
	FromNodeID          string                  `json:"fromNodeId"`
	ToNodeID            string                  `json:"toNodeId"`
	Status              WorkflowGraphEdgeStatus `json:"status"`
	ActiveTokenCount    int                     `json:"activeTokenCount"`
	CompletedTokenCount int                     `json:"completedTokenCount"`
	CancelledTokenCount int                     `json:"cancelledTokenCount"`
}
