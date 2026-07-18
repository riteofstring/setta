package orchestrator

import (
	"encoding/json"

	"setta/internal/chat"
)

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
type WorkflowGraphViewMode string
type WorkflowEventType string
type WorkflowValidationSeverity string
type WorkflowTerminalReason string
type WorkflowActionCompletionStatus string
type RunnerOperation string
type RunnerOutputMode string
type RunnerApprovalKind string
type RunnerRequirementNetwork string
type RunnerRequirementSidecarProcess string
type RunnerRequirementWorkspaceAccess string
type RunnerRecoveryCapability string
type RunnerRecoveryOutcome string
type RunnerEventType string
type WorkflowRunnerStateStatus string
type SideEffectPolicyKind string
type SideEffectScope string
type ApprovalTrigger string
type WorkflowAgentSettingsSource string

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
	ConditionDefault        WorkflowConditionKind = "default"
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

	NodeExecutionStatusPending          WorkflowNodeExecutionStatus = "pending"
	NodeExecutionStatusReady            WorkflowNodeExecutionStatus = "ready"
	NodeExecutionStatusRunning          WorkflowNodeExecutionStatus = "running"
	NodeExecutionStatusSucceeded        WorkflowNodeExecutionStatus = "succeeded"
	NodeExecutionStatusFailed           WorkflowNodeExecutionStatus = "failed"
	NodeExecutionStatusCancelled        WorkflowNodeExecutionStatus = "cancelled"
	NodeExecutionStatusWaitingApproval  WorkflowNodeExecutionStatus = "waiting_approval"
	NodeExecutionStatusRecoveryRequired WorkflowNodeExecutionStatus = "recovery_required"

	TokenStatusActive    WorkflowTokenStatus = "active"
	TokenStatusCompleted WorkflowTokenStatus = "completed"
	TokenStatusCancelled WorkflowTokenStatus = "cancelled"

	GraphNodeStatusNotStarted       WorkflowGraphNodeStatus = "not_started"
	GraphNodeStatusPending          WorkflowGraphNodeStatus = "pending"
	GraphNodeStatusReady            WorkflowGraphNodeStatus = "ready"
	GraphNodeStatusRunning          WorkflowGraphNodeStatus = "running"
	GraphNodeStatusSucceeded        WorkflowGraphNodeStatus = "succeeded"
	GraphNodeStatusFailed           WorkflowGraphNodeStatus = "failed"
	GraphNodeStatusCancelled        WorkflowGraphNodeStatus = "cancelled"
	GraphNodeStatusWaitingApproval  WorkflowGraphNodeStatus = "waiting_approval"
	GraphNodeStatusRecoveryRequired WorkflowGraphNodeStatus = "recovery_required"

	GraphEdgeStatusInactive  WorkflowGraphEdgeStatus = "inactive"
	GraphEdgeStatusActive    WorkflowGraphEdgeStatus = "active"
	GraphEdgeStatusCompleted WorkflowGraphEdgeStatus = "completed"
	GraphEdgeStatusCancelled WorkflowGraphEdgeStatus = "cancelled"

	GraphViewModeDraft   WorkflowGraphViewMode = "draft"
	GraphViewModeVersion WorkflowGraphViewMode = "version"
	GraphViewModeRun     WorkflowGraphViewMode = "run"

	EventExecutionStarted       WorkflowEventType = "workflow.execution.started"
	EventNodeScheduled          WorkflowEventType = "workflow.node.scheduled"
	EventActionStarted          WorkflowEventType = "workflow.action.started"
	EventActionCompleted        WorkflowEventType = "workflow.action.completed"
	EventActionFailed           WorkflowEventType = "workflow.action.failed"
	EventActionCancelled        WorkflowEventType = "workflow.action.cancelled"
	EventActionApprovalWait     WorkflowEventType = "workflow.action.waiting_approval"
	EventGatewayResolved        WorkflowEventType = "workflow.gateway.resolved"
	EventLoopAdvanced           WorkflowEventType = "workflow.loop.advanced"
	EventExecutionCompleted     WorkflowEventType = "workflow.execution.completed"
	EventExecutionFailed        WorkflowEventType = "workflow.execution.failed"
	EventExecutionStopped       WorkflowEventType = "workflow.execution.stopped"
	EventExecutionCancelled     WorkflowEventType = "workflow.execution.cancelled"
	EventRunnerRefsAttached     WorkflowEventType = "workflow.runner_refs.attached"
	EventActionRecovered        WorkflowEventType = "workflow.action.recovered"
	EventActionRecoveryRequired WorkflowEventType = "workflow.action.recovery_required"

	WorkflowAgentSettingsSourceNode     WorkflowAgentSettingsSource = "node"
	WorkflowAgentSettingsSourceWorkflow WorkflowAgentSettingsSource = "workflow"
	WorkflowAgentSettingsSourceDefault  WorkflowAgentSettingsSource = "default"

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

	RunnerOperationStart   RunnerOperation = "start"
	RunnerOperationCancel  RunnerOperation = "cancel"
	RunnerOperationSignal  RunnerOperation = "signal"
	RunnerOperationRecover RunnerOperation = "recover"

	RunnerOutputModeSignals        RunnerOutputMode = "signals"
	RunnerOutputModeStructuredJSON RunnerOutputMode = "structured_json"
	RunnerOutputModeFileRefs       RunnerOutputMode = "file_refs"
	RunnerOutputModeExitCode       RunnerOutputMode = "exit_code"
	RunnerOutputModeMetrics        RunnerOutputMode = "metrics"
	RunnerOutputModeNone           RunnerOutputMode = "none"

	RunnerApprovalKindCommand         RunnerApprovalKind = "command"
	RunnerApprovalKindFileChange      RunnerApprovalKind = "file_change"
	RunnerApprovalKindPermission      RunnerApprovalKind = "permission"
	RunnerApprovalKindStructuredInput RunnerApprovalKind = "structured_input"
	RunnerApprovalKindUserInput       RunnerApprovalKind = "user_input"
	RunnerApprovalKindExternalAction  RunnerApprovalKind = "external_action"

	RunnerRequirementNetworkForbidden RunnerRequirementNetwork = "forbidden"
	RunnerRequirementNetworkOptional  RunnerRequirementNetwork = "optional"
	RunnerRequirementNetworkRequired  RunnerRequirementNetwork = "required"

	RunnerRequirementSidecarProcessNotUsed  RunnerRequirementSidecarProcess = "not_used"
	RunnerRequirementSidecarProcessRequired RunnerRequirementSidecarProcess = "required"

	RunnerRequirementWorkspaceAccessNone          RunnerRequirementWorkspaceAccess = "none"
	RunnerRequirementWorkspaceAccessRead          RunnerRequirementWorkspaceAccess = "read"
	RunnerRequirementWorkspaceAccessWrite         RunnerRequirementWorkspaceAccess = "write"
	RunnerRequirementWorkspaceAccessRunnerDefined RunnerRequirementWorkspaceAccess = "runner_defined"

	RunnerRecoveryCapabilityNone            RunnerRecoveryCapability = "none"
	RunnerRecoveryCapabilityFailInterrupted RunnerRecoveryCapability = "fail_interrupted"
	RunnerRecoveryCapabilityReconcileRefs   RunnerRecoveryCapability = "reconcile_refs"
	RunnerRecoveryCapabilityReattachStream  RunnerRecoveryCapability = "reattach_stream"

	RunnerRecoveryOutcomeRecoveredRunning       RunnerRecoveryOutcome = "recovered_running"
	RunnerRecoveryOutcomeRecoveredCompleted     RunnerRecoveryOutcome = "recovered_completed"
	RunnerRecoveryOutcomeRecoveredFailed        RunnerRecoveryOutcome = "recovered_failed"
	RunnerRecoveryOutcomeRetryScheduled         RunnerRecoveryOutcome = "retry_scheduled"
	RunnerRecoveryOutcomeManualRecoveryRequired RunnerRecoveryOutcome = "manual_recovery_required"
	RunnerRecoveryOutcomeFailedInterrupted      RunnerRecoveryOutcome = "failed_interrupted"

	RunnerEventAttemptStarted           RunnerEventType = "runner.attempt.started"
	RunnerEventTextDelta                RunnerEventType = "runner.text.delta"
	RunnerEventToolCallStarted          RunnerEventType = "runner.tool_call.started"
	RunnerEventToolCallOutput           RunnerEventType = "runner.tool_call.output"
	RunnerEventApprovalRequested        RunnerEventType = "runner.approval.requested"
	RunnerEventApprovalResolved         RunnerEventType = "runner.approval.resolved"
	RunnerEventArtifactReported         RunnerEventType = "runner.artifact.reported"
	RunnerEventStructuredOutputReceived RunnerEventType = "runner.structured_output.received"
	RunnerEventAttemptCompleted         RunnerEventType = "runner.attempt.completed"
	RunnerEventAttemptFailed            RunnerEventType = "runner.attempt.failed"
	RunnerEventAttemptCancelled         RunnerEventType = "runner.attempt.cancelled"
	RunnerEventAttemptRecoveryRequired  RunnerEventType = "runner.attempt.recovery_required"

	EventRunnerAttemptStarted           WorkflowEventType = WorkflowEventType(RunnerEventAttemptStarted)
	EventRunnerTextDelta                WorkflowEventType = WorkflowEventType(RunnerEventTextDelta)
	EventRunnerToolCallStarted          WorkflowEventType = WorkflowEventType(RunnerEventToolCallStarted)
	EventRunnerToolCallOutput           WorkflowEventType = WorkflowEventType(RunnerEventToolCallOutput)
	EventRunnerApprovalRequested        WorkflowEventType = WorkflowEventType(RunnerEventApprovalRequested)
	EventRunnerApprovalResolved         WorkflowEventType = WorkflowEventType(RunnerEventApprovalResolved)
	EventRunnerArtifactReported         WorkflowEventType = WorkflowEventType(RunnerEventArtifactReported)
	EventRunnerStructuredOutputReceived WorkflowEventType = WorkflowEventType(RunnerEventStructuredOutputReceived)
	EventRunnerAttemptCompleted         WorkflowEventType = WorkflowEventType(RunnerEventAttemptCompleted)
	EventRunnerAttemptFailed            WorkflowEventType = WorkflowEventType(RunnerEventAttemptFailed)
	EventRunnerAttemptCancelled         WorkflowEventType = WorkflowEventType(RunnerEventAttemptCancelled)
	EventRunnerAttemptRecoveryRequired  WorkflowEventType = WorkflowEventType(RunnerEventAttemptRecoveryRequired)

	RunnerStateStatusStarting         WorkflowRunnerStateStatus = "starting"
	RunnerStateStatusRunning          WorkflowRunnerStateStatus = "running"
	RunnerStateStatusWaitingApproval  WorkflowRunnerStateStatus = "waiting_approval"
	RunnerStateStatusCompleted        WorkflowRunnerStateStatus = "completed"
	RunnerStateStatusFailed           WorkflowRunnerStateStatus = "failed"
	RunnerStateStatusCancelled        WorkflowRunnerStateStatus = "cancelled"
	RunnerStateStatusRecoveryRequired WorkflowRunnerStateStatus = "recovery_required"

	SideEffectPolicyKindPure             SideEffectPolicyKind = "pure"
	SideEffectPolicyKindIdempotent       SideEffectPolicyKind = "idempotent"
	SideEffectPolicyKindAtLeastOnce      SideEffectPolicyKind = "at_least_once"
	SideEffectPolicyKindRequiresApproval SideEffectPolicyKind = "requires_approval"
	SideEffectPolicyKindManualRecovery   SideEffectPolicyKind = "manual_recovery"
	SideEffectPolicyKindCompensatable    SideEffectPolicyKind = "compensatable"

	SideEffectScopeNone            SideEffectScope = "none"
	SideEffectScopeWorkspace       SideEffectScope = "workspace"
	SideEffectScopeExternalService SideEffectScope = "external_service"
	SideEffectScopeProviderAccount SideEffectScope = "provider_account"
	SideEffectScopeRunnerDefined   SideEffectScope = "runner_defined"

	ApprovalTriggerNetworkAccess        ApprovalTrigger = "network_access"
	ApprovalTriggerWorkspaceWrite       ApprovalTrigger = "workspace_write"
	ApprovalTriggerOutOfWorkspaceWrite  ApprovalTrigger = "out_of_workspace_write"
	ApprovalTriggerProtectedPathWrite   ApprovalTrigger = "protected_path_write"
	ApprovalTriggerCredentialAccess     ApprovalTrigger = "credential_access"
	ApprovalTriggerExternalWrite        ApprovalTrigger = "external_write"
	ApprovalTriggerDestructiveAction    ApprovalTrigger = "destructive_action"
	ApprovalTriggerUnsandboxedExecution ApprovalTrigger = "unsandboxed_execution"
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
		ConditionDefault,
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
		NodeExecutionStatusRecoveryRequired,
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
		GraphNodeStatusRecoveryRequired,
	}
	workflowGraphEdgeStatusValues = []WorkflowGraphEdgeStatus{
		GraphEdgeStatusInactive,
		GraphEdgeStatusActive,
		GraphEdgeStatusCompleted,
		GraphEdgeStatusCancelled,
	}
	workflowGraphViewModeValues = []WorkflowGraphViewMode{
		GraphViewModeDraft,
		GraphViewModeVersion,
		GraphViewModeRun,
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
		EventRunnerRefsAttached,
		EventActionRecovered,
		EventActionRecoveryRequired,
		EventRunnerAttemptStarted,
		EventRunnerTextDelta,
		EventRunnerToolCallStarted,
		EventRunnerToolCallOutput,
		EventRunnerApprovalRequested,
		EventRunnerApprovalResolved,
		EventRunnerArtifactReported,
		EventRunnerStructuredOutputReceived,
		EventRunnerAttemptCompleted,
		EventRunnerAttemptFailed,
		EventRunnerAttemptCancelled,
		EventRunnerAttemptRecoveryRequired,
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
	runnerOperationValues = []RunnerOperation{
		RunnerOperationStart,
		RunnerOperationCancel,
		RunnerOperationSignal,
		RunnerOperationRecover,
	}
	runnerOutputModeValues = []RunnerOutputMode{
		RunnerOutputModeSignals,
		RunnerOutputModeStructuredJSON,
		RunnerOutputModeFileRefs,
		RunnerOutputModeExitCode,
		RunnerOutputModeMetrics,
		RunnerOutputModeNone,
	}
	runnerApprovalKindValues = []RunnerApprovalKind{
		RunnerApprovalKindCommand,
		RunnerApprovalKindFileChange,
		RunnerApprovalKindPermission,
		RunnerApprovalKindStructuredInput,
		RunnerApprovalKindUserInput,
		RunnerApprovalKindExternalAction,
	}
	runnerRequirementNetworkValues = []RunnerRequirementNetwork{
		RunnerRequirementNetworkForbidden,
		RunnerRequirementNetworkOptional,
		RunnerRequirementNetworkRequired,
	}
	runnerRequirementSidecarProcessValues = []RunnerRequirementSidecarProcess{
		RunnerRequirementSidecarProcessNotUsed,
		RunnerRequirementSidecarProcessRequired,
	}
	runnerRequirementWorkspaceAccessValues = []RunnerRequirementWorkspaceAccess{
		RunnerRequirementWorkspaceAccessNone,
		RunnerRequirementWorkspaceAccessRead,
		RunnerRequirementWorkspaceAccessWrite,
		RunnerRequirementWorkspaceAccessRunnerDefined,
	}
	runnerRecoveryCapabilityValues = []RunnerRecoveryCapability{
		RunnerRecoveryCapabilityNone,
		RunnerRecoveryCapabilityFailInterrupted,
		RunnerRecoveryCapabilityReconcileRefs,
		RunnerRecoveryCapabilityReattachStream,
	}
	runnerRecoveryOutcomeValues = []RunnerRecoveryOutcome{
		RunnerRecoveryOutcomeRecoveredRunning,
		RunnerRecoveryOutcomeRecoveredCompleted,
		RunnerRecoveryOutcomeRecoveredFailed,
		RunnerRecoveryOutcomeRetryScheduled,
		RunnerRecoveryOutcomeManualRecoveryRequired,
		RunnerRecoveryOutcomeFailedInterrupted,
	}
	runnerEventTypeValues = []RunnerEventType{
		RunnerEventAttemptStarted,
		RunnerEventTextDelta,
		RunnerEventToolCallStarted,
		RunnerEventToolCallOutput,
		RunnerEventApprovalRequested,
		RunnerEventApprovalResolved,
		RunnerEventArtifactReported,
		RunnerEventStructuredOutputReceived,
		RunnerEventAttemptCompleted,
		RunnerEventAttemptFailed,
		RunnerEventAttemptCancelled,
		RunnerEventAttemptRecoveryRequired,
	}
	workflowRunnerStateStatusValues = []WorkflowRunnerStateStatus{
		RunnerStateStatusStarting,
		RunnerStateStatusRunning,
		RunnerStateStatusWaitingApproval,
		RunnerStateStatusCompleted,
		RunnerStateStatusFailed,
		RunnerStateStatusCancelled,
		RunnerStateStatusRecoveryRequired,
	}
	sideEffectPolicyKindValues = []SideEffectPolicyKind{
		SideEffectPolicyKindPure,
		SideEffectPolicyKindIdempotent,
		SideEffectPolicyKindAtLeastOnce,
		SideEffectPolicyKindRequiresApproval,
		SideEffectPolicyKindManualRecovery,
		SideEffectPolicyKindCompensatable,
	}
	sideEffectScopeValues = []SideEffectScope{
		SideEffectScopeNone,
		SideEffectScopeWorkspace,
		SideEffectScopeExternalService,
		SideEffectScopeProviderAccount,
		SideEffectScopeRunnerDefined,
	}
	approvalTriggerValues = []ApprovalTrigger{
		ApprovalTriggerNetworkAccess,
		ApprovalTriggerWorkspaceWrite,
		ApprovalTriggerOutOfWorkspaceWrite,
		ApprovalTriggerProtectedPathWrite,
		ApprovalTriggerCredentialAccess,
		ApprovalTriggerExternalWrite,
		ApprovalTriggerDestructiveAction,
		ApprovalTriggerUnsandboxedExecution,
	}
	workflowAgentSettingsSourceValues = []WorkflowAgentSettingsSource{
		WorkflowAgentSettingsSourceNode,
		WorkflowAgentSettingsSourceWorkflow,
		WorkflowAgentSettingsSourceDefault,
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
		{Name: "WorkflowGraphViewMode", Values: stringValues(workflowGraphViewModeValues)},
		{Name: "WorkflowEventType", Values: stringValues(workflowEventTypeValues)},
		{Name: "WorkflowValidationSeverity", Values: stringValues(workflowValidationSeverityValues)},
		{Name: "WorkflowTerminalReason", Values: stringValues(workflowTerminalReasonValues)},
		{Name: "WorkflowActionCompletionStatus", Values: stringValues(workflowActionCompletionStatusValues)},
		{Name: "RunnerOperation", Values: stringValues(runnerOperationValues)},
		{Name: "RunnerOutputMode", Values: stringValues(runnerOutputModeValues)},
		{Name: "RunnerApprovalKind", Values: stringValues(runnerApprovalKindValues)},
		{Name: "RunnerRequirementNetwork", Values: stringValues(runnerRequirementNetworkValues)},
		{Name: "RunnerRequirementSidecarProcess", Values: stringValues(runnerRequirementSidecarProcessValues)},
		{Name: "RunnerRequirementWorkspaceAccess", Values: stringValues(runnerRequirementWorkspaceAccessValues)},
		{Name: "RunnerRecoveryCapability", Values: stringValues(runnerRecoveryCapabilityValues)},
		{Name: "RunnerRecoveryOutcome", Values: stringValues(runnerRecoveryOutcomeValues)},
		{Name: "RunnerEventType", Values: stringValues(runnerEventTypeValues)},
		{Name: "WorkflowRunnerStateStatus", Values: stringValues(workflowRunnerStateStatusValues)},
		{Name: "SideEffectPolicyKind", Values: stringValues(sideEffectPolicyKindValues)},
		{Name: "SideEffectScope", Values: stringValues(sideEffectScopeValues)},
		{Name: "ApprovalTrigger", Values: stringValues(approvalTriggerValues)},
		{Name: "WorkflowAgentSettingsSource", Values: stringValues(workflowAgentSettingsSourceValues)},
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
	SchemaVersion int           `json:"schemaVersion"`
	ID            string        `json:"id"`
	WorkspaceID   string        `json:"workspaceId"`
	Name          string        `json:"name"`
	Description   string        `json:"description"`
	Graph         WorkflowGraph `json:"graph"`
	CreatedAt     string        `json:"createdAt"`
	UpdatedAt     string        `json:"updatedAt"`
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
	Nodes         []WorkflowNode        `json:"nodes"`
	Edges         []WorkflowEdge        `json:"edges"`
	Layout        WorkflowGraphLayout   `json:"layout"`
	AgentDefaults WorkflowAgentSettings `json:"agentDefaults"`
}

type WorkflowGraphLayout struct {
	Nodes []WorkflowGraphNodeLayout `json:"nodes"`
}

type WorkflowGraphNodeLayout struct {
	NodeID string `json:"nodeId"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
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
	Prompt            string                `json:"prompt"`
	FreshConversation bool                  `json:"freshConversation"`
	Settings          WorkflowAgentSettings `json:"settings"`
}

type WorkflowAgentSettings struct {
	Model           string                            `json:"model"`
	ReasoningEffort *chat.ReasoningEffort             `json:"reasoningEffort"`
	Permission      *chat.ChatCodexPermissionSettings `json:"permission"`
}

type WorkflowAgentEffectiveRunSettings struct {
	Model                      string                       `json:"model"`
	ModelDisplayName           string                       `json:"modelDisplayName"`
	ModelSource                WorkflowAgentSettingsSource  `json:"modelSource"`
	ReasoningEffort            *chat.ReasoningEffort        `json:"reasoningEffort"`
	ReasoningEffortDisplayName string                       `json:"reasoningEffortDisplayName"`
	ReasoningEffortSource      WorkflowAgentSettingsSource  `json:"reasoningEffortSource"`
	PermissionPreset           *chat.ChatPermissionPresetID `json:"permissionPreset"`
	PermissionProfileID        string                       `json:"permissionProfileId"`
	PermissionDisplayLabel     string                       `json:"permissionDisplayLabel"`
	ApprovalPolicy             string                       `json:"approvalPolicy"`
	Permissions                string                       `json:"permissions"`
	PermissionSource           WorkflowAgentSettingsSource  `json:"permissionSource"`
}

type WorkflowActionPolicy struct {
	SchemaVersion    int                `json:"schemaVersion"`
	RunnerKind       WorkflowActionKind `json:"runnerKind"`
	SideEffectPolicy SideEffectPolicy   `json:"sideEffectPolicy"`
	InputSchema      json.RawMessage    `json:"inputSchema"`
	OutputSchema     json.RawMessage    `json:"outputSchema"`
	ExtensionKind    string             `json:"extensionKind"`
	ExtensionVersion int                `json:"extensionVersion"`
	ExtensionJSON    json.RawMessage    `json:"extensionJson"`
}

type SideEffectPolicy struct {
	Kind                       SideEffectPolicyKind `json:"kind"`
	Scope                      SideEffectScope      `json:"scope"`
	ApprovalTriggers           []ApprovalTrigger    `json:"approvalTriggers"`
	IdempotencyRequired        bool                 `json:"idempotencyRequired"`
	CompensationActionRef      *string              `json:"compensationActionRef"`
	ManualRecoveryInstructions string               `json:"manualRecoveryInstructions"`
}

type RunnerCapabilities struct {
	SchemaVersion    int                             `json:"schemaVersion"`
	RunnerKind       WorkflowActionKind              `json:"runnerKind"`
	DisplayName      string                          `json:"displayName"`
	Operations       []RunnerOperation               `json:"operations"`
	EmittedEvents    []RunnerEventType               `json:"emittedEvents"`
	OutputModes      []RunnerOutputMode              `json:"outputModes"`
	ApprovalKinds    []RunnerApprovalKind            `json:"approvalKinds"`
	Requirements     RunnerRequirements              `json:"requirements"`
	SideEffectPolicy SideEffectPolicy                `json:"sideEffectPolicy"`
	Recovery         RunnerRecoveryCapability        `json:"recovery"`
	PolicyExtension  RunnerPolicyExtensionDescriptor `json:"policyExtension"`
}

type RunnerRequirements struct {
	Network         RunnerRequirementNetwork         `json:"network"`
	SidecarProcess  RunnerRequirementSidecarProcess  `json:"sidecarProcess"`
	WorkspaceAccess RunnerRequirementWorkspaceAccess `json:"workspaceAccess"`
}

type RunnerPolicyExtensionDescriptor struct {
	ExtensionKind    string `json:"extensionKind"`
	ExtensionVersion int    `json:"extensionVersion"`
}

type WorkflowRunnerState struct {
	SchemaVersion          int                       `json:"schemaVersion"`
	WorkspaceID            string                    `json:"workspaceId"`
	ExecutionID            string                    `json:"executionId"`
	NodeExecutionID        string                    `json:"nodeExecutionId"`
	RunnerKind             WorkflowActionKind        `json:"runnerKind"`
	Status                 WorkflowRunnerStateStatus `json:"status"`
	LastRunnerEventOrdinal int                       `json:"lastRunnerEventOrdinal"`
	OpaqueState            json.RawMessage           `json:"opaqueState"`
	RecoveryToken          string                    `json:"recoveryToken"`
	CreatedAt              string                    `json:"createdAt"`
	UpdatedAt              string                    `json:"updatedAt"`
}

type WorkflowActivityRef struct {
	SchemaVersion   int             `json:"schemaVersion"`
	ID              string          `json:"id"`
	WorkspaceID     string          `json:"workspaceId"`
	ExecutionID     string          `json:"executionId"`
	NodeExecutionID string          `json:"nodeExecutionId"`
	Kind            string          `json:"kind"`
	Ref             string          `json:"ref"`
	StartCursor     string          `json:"startCursor"`
	EndCursor       string          `json:"endCursor"`
	Metadata        json.RawMessage `json:"metadata"`
	CreatedAt       string          `json:"createdAt"`
	UpdatedAt       string          `json:"updatedAt"`
}

type RunnerEvent struct {
	SchemaVersion      int                `json:"schemaVersion"`
	ID                 string             `json:"id"`
	WorkspaceID        string             `json:"workspaceId"`
	ExecutionID        string             `json:"executionId"`
	NodeID             string             `json:"nodeId"`
	NodeExecutionID    string             `json:"nodeExecutionId"`
	RunnerKind         WorkflowActionKind `json:"runnerKind"`
	RunnerEventOrdinal int                `json:"runnerEventOrdinal"`
	OccurredAt         string             `json:"occurredAt"`
	Type               RunnerEventType    `json:"type"`
	Payload            json.RawMessage    `json:"payload"`
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
	RecoveryOutcome        *RunnerRecoveryOutcome  `json:"recoveryOutcome"`
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

type WorkflowExecutionSummary struct {
	ID                      string                  `json:"id"`
	WorkspaceID             string                  `json:"workspaceId"`
	DefinitionID            string                  `json:"definitionId"`
	DefinitionVersionID     string                  `json:"definitionVersionId"`
	DefinitionVersionNumber int                     `json:"definitionVersionNumber"`
	Status                  WorkflowExecutionStatus `json:"status"`
	TerminalReason          *WorkflowTerminalReason `json:"terminalReason"`
	StartedAt               string                  `json:"startedAt"`
	UpdatedAt               string                  `json:"updatedAt"`
	CompletedAt             string                  `json:"completedAt"`
	LastEventOrdinal        int                     `json:"lastEventOrdinal"`
}

type WorkflowNodeExecution struct {
	SchemaVersion      int                                `json:"schemaVersion"`
	ID                 string                             `json:"id"`
	ExecutionID        string                             `json:"executionId"`
	NodeID             string                             `json:"nodeId"`
	Attempt            int                                `json:"attempt"`
	Iteration          int                                `json:"iteration"`
	Status             WorkflowNodeExecutionStatus        `json:"status"`
	IdempotencyKey     string                             `json:"idempotencyKey"`
	ScheduledAt        string                             `json:"scheduledAt"`
	StartedAt          string                             `json:"startedAt"`
	CompletedAt        string                             `json:"completedAt"`
	ActionKind         *WorkflowActionKind                `json:"actionKind"`
	RunnerKind         *WorkflowActionKind                `json:"runnerKind"`
	InputHash          string                             `json:"inputHash"`
	Input              json.RawMessage                    `json:"input"`
	ActionPolicy       *WorkflowActionPolicy              `json:"actionPolicy"`
	SideEffectPolicy   *SideEffectPolicy                  `json:"sideEffectPolicy"`
	RunnerCapabilities *RunnerCapabilities                `json:"runnerCapabilities"`
	AgentRunSettings   *WorkflowAgentEffectiveRunSettings `json:"agentRunSettings"`
	Result             *WorkflowActionResult              `json:"result"`
	RunnerRefs         []WorkflowActionRunnerRef          `json:"runnerRefs"`
	RunnerState        *WorkflowRunnerState               `json:"runnerState"`
	ActivityRefs       []WorkflowActivityRef              `json:"activityRefs"`
	RecoveryOutcome    *RunnerRecoveryOutcome             `json:"recoveryOutcome"`
	RecoveryMessage    string                             `json:"recoveryMessage"`
	Error              string                             `json:"error"`
}

type WorkflowActionResult struct {
	Status          WorkflowActionCompletionStatus `json:"status"`
	Signals         []WorkflowActionSignal         `json:"signals"`
	Output          json.RawMessage                `json:"output"`
	FilePaths       []string                       `json:"filePaths"`
	ExitCode        *int                           `json:"exitCode"`
	Error           string                         `json:"error"`
	PendingApproval *WorkflowPendingApproval       `json:"pendingApproval"`
}

type WorkflowActionSignal struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type WorkflowPendingApproval struct {
	WorkspaceID     string               `json:"workspaceId"`
	ExecutionID     string               `json:"executionId"`
	NodeID          string               `json:"nodeId"`
	NodeExecutionID string               `json:"nodeExecutionId"`
	ApprovalID      string               `json:"approvalId"`
	Approval        chat.ApprovalRequest `json:"approval"`
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
	SchemaVersion       int                 `json:"schemaVersion"`
	ID                  string              `json:"id"`
	WorkspaceID         string              `json:"workspaceId"`
	DefinitionID        string              `json:"definitionId"`
	DefinitionVersionID string              `json:"definitionVersionId"`
	ExecutionID         string              `json:"executionId"`
	Ordinal             int                 `json:"ordinal"`
	Type                WorkflowEventType   `json:"type"`
	NodeID              string              `json:"nodeId"`
	NodeExecutionID     string              `json:"nodeExecutionId"`
	TokenID             string              `json:"tokenId"`
	RunnerKind          *WorkflowActionKind `json:"runnerKind"`
	CreatedAt           string              `json:"createdAt"`
	Message             string              `json:"message"`
	Details             json.RawMessage     `json:"details"`
}

type WorkflowExecutionEventPage struct {
	ExecutionID        string          `json:"executionId"`
	Events             []WorkflowEvent `json:"events"`
	HasMoreOlder       bool            `json:"hasMoreOlder"`
	OlderBeforeOrdinal int             `json:"olderBeforeOrdinal"`
}

type WorkflowAgentTrajectoryScope struct {
	WorkspaceID         string `json:"workspaceId"`
	DefinitionID        string `json:"definitionId"`
	DefinitionVersionID string `json:"definitionVersionId"`
	ExecutionID         string `json:"executionId"`
	NodeID              string `json:"nodeId"`
	NodeExecutionID     string `json:"nodeExecutionId"`
	Attempt             int    `json:"attempt"`
	Iteration           int    `json:"iteration"`
}

type WorkflowAgentTrajectoryCapabilities struct {
	CanLoadOlderHistory  bool `json:"canLoadOlderHistory"`
	CanLoadMoreActivity  bool `json:"canLoadMoreActivity"`
	CanLoadRunItemOutput bool `json:"canLoadRunItemOutput"`
	CanRetryLiveness     bool `json:"canRetryLiveness"`
	CanSteer             bool `json:"canSteer"`
	CanStopRun           bool `json:"canStopRun"`
	CanSubmitApproval    bool `json:"canSubmitApproval"`
}

type WorkflowAgentTrajectoryRunItemOutputPageState struct {
	RunID                string   `json:"runId"`
	RunItemID            string   `json:"runItemId"`
	OutputIDs            []string `json:"outputIds"`
	HasMore              bool     `json:"hasMore"`
	LoadedThroughOrdinal int      `json:"loadedThroughOrdinal"`
	NextOrdinal          int      `json:"nextOrdinal"`
}

type WorkflowAgentTrajectoryPage struct {
	SchemaVersion            int                                             `json:"schemaVersion"`
	Scope                    WorkflowAgentTrajectoryScope                    `json:"scope"`
	ConversationID           string                                          `json:"conversationId"`
	RunID                    string                                          `json:"runId"`
	LastChatEventStreamID    string                                          `json:"lastChatEventStreamId"`
	LastChatEventSequence    int                                             `json:"lastChatEventSequence"`
	LastWorkflowEventOrdinal int                                             `json:"lastWorkflowEventOrdinal"`
	Run                      chat.Run                                        `json:"run"`
	ActiveRun                *chat.Run                                       `json:"activeRun"`
	ActiveRunLiveness        *chat.RunLiveness                               `json:"activeRunLiveness"`
	RunSettings              *WorkflowAgentEffectiveRunSettings              `json:"runSettings"`
	Blocks                   []chat.TranscriptBlock                          `json:"blocks"`
	PendingSteeringMessages  []chat.ChatMessage                              `json:"pendingSteeringMessages"`
	Items                    []chat.RunItem                                  `json:"items"`
	Activity                 []chat.ActivityItemBlockProjection              `json:"activity"`
	OutputPages              []WorkflowAgentTrajectoryRunItemOutputPageState `json:"outputPages"`
	Outputs                  []chat.RunItemOutput                            `json:"outputs"`
	PendingApproval          *WorkflowPendingApproval                        `json:"pendingApproval"`
	HasMoreOlder             bool                                            `json:"hasMoreOlder"`
	OlderBeforeBlockOrdinal  int                                             `json:"olderBeforeBlockOrdinal"`
	HasMoreItems             bool                                            `json:"hasMoreItems"`
	NextItemID               string                                          `json:"nextItemId"`
	Capabilities             WorkflowAgentTrajectoryCapabilities             `json:"capabilities"`
}

type WorkflowGraphProjection struct {
	SchemaVersion              int                      `json:"schemaVersion"`
	WorkspaceID                string                   `json:"workspaceId"`
	DefinitionID               string                   `json:"definitionId"`
	DefinitionVersionID        string                   `json:"definitionVersionId"`
	DefinitionVersionNumber    int                      `json:"definitionVersionNumber"`
	DefinitionVersionCreatedAt string                   `json:"definitionVersionCreatedAt"`
	DefinitionName             string                   `json:"definitionName"`
	DefinitionDescription      string                   `json:"definitionDescription"`
	ViewMode                   WorkflowGraphViewMode    `json:"viewMode"`
	Editable                   bool                     `json:"editable"`
	DraftUpdatedAt             string                   `json:"draftUpdatedAt"`
	DraftMatchesVersion        bool                     `json:"draftMatchesVersion"`
	VersionMismatch            bool                     `json:"versionMismatch"`
	ExecutionID                string                   `json:"executionId"`
	ExecutionStatus            *WorkflowExecutionStatus `json:"executionStatus"`
	TerminalReason             *WorkflowTerminalReason  `json:"terminalReason"`
	LastEventOrdinal           int                      `json:"lastEventOrdinal"`
	UpdatedAt                  string                   `json:"updatedAt"`
	Layout                     WorkflowGraphLayout      `json:"layout"`
	Nodes                      []WorkflowGraphNode      `json:"nodes"`
	Edges                      []WorkflowGraphEdge      `json:"edges"`
}

type WorkflowGraphNode struct {
	ID                    string                   `json:"id"`
	Kind                  WorkflowNodeKind         `json:"kind"`
	Title                 string                   `json:"title"`
	Label                 string                   `json:"label"`
	Status                WorkflowGraphNodeStatus  `json:"status"`
	Active                bool                     `json:"active"`
	ExecutionCount        int                      `json:"executionCount"`
	LatestNodeExecutionID string                   `json:"latestNodeExecutionId"`
	LatestAttempt         int                      `json:"latestAttempt"`
	LatestIteration       int                      `json:"latestIteration"`
	ActionKind            *WorkflowActionKind      `json:"actionKind"`
	Signals               []WorkflowActionSignal   `json:"signals"`
	FilePaths             []string                 `json:"filePaths"`
	Error                 string                   `json:"error"`
	PendingApproval       *WorkflowPendingApproval `json:"pendingApproval"`
	RecoveryOutcome       *RunnerRecoveryOutcome   `json:"recoveryOutcome"`
	RecoveryMessage       string                   `json:"recoveryMessage"`
}

type WorkflowGraphEdge struct {
	ID                  string                  `json:"id"`
	Kind                WorkflowEdgeKind        `json:"kind"`
	FromNodeID          string                  `json:"fromNodeId"`
	ToNodeID            string                  `json:"toNodeId"`
	Condition           *WorkflowCondition      `json:"condition"`
	Label               string                  `json:"label"`
	Status              WorkflowGraphEdgeStatus `json:"status"`
	ActiveTokenCount    int                     `json:"activeTokenCount"`
	CompletedTokenCount int                     `json:"completedTokenCount"`
	CancelledTokenCount int                     `json:"cancelledTokenCount"`
}
