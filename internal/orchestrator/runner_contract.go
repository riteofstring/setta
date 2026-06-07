package orchestrator

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"setta/internal/chat"
)

type WorkflowActionStartMetadata struct {
	RunnerKind       WorkflowActionKind
	RunnerRefs       []WorkflowActionRunnerRef
	Policy           *WorkflowActionPolicy
	SideEffectPolicy *SideEffectPolicy
	Capabilities     *RunnerCapabilities
	InputHash        string
	Input            json.RawMessage
	RunnerState      *WorkflowRunnerState
	ActivityRefs     []WorkflowActivityRef
}

type RunnerAttemptStartedPayload struct {
	RunnerRefs       []WorkflowActionRunnerRef `json:"runnerRefs"`
	Capabilities     RunnerCapabilities        `json:"capabilities"`
	InputHash        string                    `json:"inputHash"`
	IdempotencyKey   string                    `json:"idempotencyKey"`
	SideEffectPolicy SideEffectPolicy          `json:"sideEffectPolicy"`
	ActivityRefs     []WorkflowActivityRef     `json:"activityRefs"`
}

type RunnerApprovalRequestedPayload struct {
	ApprovalID       string             `json:"approvalId"`
	ApprovalKind     RunnerApprovalKind `json:"approvalKind"`
	Title            string             `json:"title"`
	Request          json.RawMessage    `json:"request"`
	Operation        string             `json:"operation"`
	SideEffectPolicy SideEffectPolicy   `json:"sideEffectPolicy"`
}

type RunnerApprovalResolvedPayload struct {
	ApprovalID string                `json:"approvalId"`
	Status     string                `json:"status"`
	Approved   bool                  `json:"approved"`
	Response   string                `json:"response"`
	Answers    []chat.ApprovalAnswer `json:"answers"`
	ResolvedAt string                `json:"resolvedAt"`
}

type RunnerStructuredOutputPayload struct {
	SchemaName    string                 `json:"schemaName"`
	SchemaVersion int                    `json:"schemaVersion"`
	Output        json.RawMessage        `json:"output"`
	Signals       []WorkflowActionSignal `json:"signals"`
	FilePaths     []string               `json:"filePaths"`
	ExitCode      *int                   `json:"exitCode"`
}

type RunnerAttemptCompletedPayload struct {
	Status    WorkflowActionCompletionStatus `json:"status"`
	Output    json.RawMessage                `json:"output"`
	Signals   []WorkflowActionSignal         `json:"signals"`
	FilePaths []string                       `json:"filePaths"`
	ExitCode  *int                           `json:"exitCode"`
	Metrics   json.RawMessage                `json:"metrics"`
}

type RunnerAttemptFailedPayload struct {
	ErrorCode string          `json:"errorCode"`
	Message   string          `json:"message"`
	Retryable bool            `json:"retryable"`
	Metrics   json.RawMessage `json:"metrics"`
}

type RunnerAttemptCancelledPayload struct {
	Reason  string          `json:"reason"`
	Message string          `json:"message"`
	Metrics json.RawMessage `json:"metrics"`
}

type workflowActionInputSnapshot struct {
	SchemaVersion       int                  `json:"schemaVersion"`
	DefinitionID        string               `json:"definitionId"`
	DefinitionVersionID string               `json:"definitionVersionId"`
	ExecutionID         string               `json:"executionId"`
	NodeID              string               `json:"nodeId"`
	NodeExecutionID     string               `json:"nodeExecutionId"`
	Attempt             int                  `json:"attempt"`
	Iteration           int                  `json:"iteration"`
	IdempotencyKey      string               `json:"idempotencyKey"`
	Policy              WorkflowActionPolicy `json:"policy"`
}

func workflowActionPolicyForConfig(config WorkflowActionConfig) (WorkflowActionPolicy, error) {
	switch config.Kind {
	case ActionKindAgentCodex:
		if config.Codex == nil {
			return WorkflowActionPolicy{}, fmt.Errorf("agent.codex action must declare codex config")
		}
		extensionJSON, err := json.Marshal(config.Codex)
		if err != nil {
			return WorkflowActionPolicy{}, fmt.Errorf("encode agent.codex extension config: %w", err)
		}
		return WorkflowActionPolicy{
			SchemaVersion:    SchemaVersion,
			RunnerKind:       ActionKindAgentCodex,
			SideEffectPolicy: codexSideEffectPolicy(),
			InputSchema:      nil,
			OutputSchema:     nil,
			ExtensionKind:    string(ActionKindAgentCodex),
			ExtensionVersion: 1,
			ExtensionJSON:    extensionJSON,
		}, nil
	default:
		return WorkflowActionPolicy{}, fmt.Errorf("unsupported action kind %q", config.Kind)
	}
}

func codexSideEffectPolicy() SideEffectPolicy {
	return SideEffectPolicy{
		Kind:  SideEffectPolicyKindRequiresApproval,
		Scope: SideEffectScopeRunnerDefined,
		ApprovalTriggers: []ApprovalTrigger{
			ApprovalTriggerWorkspaceWrite,
			ApprovalTriggerOutOfWorkspaceWrite,
			ApprovalTriggerProtectedPathWrite,
			ApprovalTriggerCredentialAccess,
			ApprovalTriggerExternalWrite,
			ApprovalTriggerDestructiveAction,
		},
		IdempotencyRequired:        false,
		ManualRecoveryInstructions: "Review the workflow-owned Codex chat activity before retrying or marking the action resolved.",
	}
}

func workflowActionInputForStart(execution WorkflowExecution, node WorkflowNode, nodeExecution WorkflowNodeExecution, policy WorkflowActionPolicy) (json.RawMessage, string, error) {
	snapshot := workflowActionInputSnapshot{
		SchemaVersion:       SchemaVersion,
		DefinitionID:        execution.DefinitionID,
		DefinitionVersionID: execution.DefinitionVersionID,
		ExecutionID:         execution.ID,
		NodeID:              node.ID,
		NodeExecutionID:     nodeExecution.ID,
		Attempt:             nodeExecution.Attempt,
		Iteration:           nodeExecution.Iteration,
		IdempotencyKey:      nodeExecution.IdempotencyKey,
		Policy:              policy,
	}
	input, err := json.Marshal(snapshot)
	if err != nil {
		return nil, "", fmt.Errorf("encode action input snapshot: %w", err)
	}
	hash := sha256.Sum256(input)
	return input, "sha256:" + hex.EncodeToString(hash[:]), nil
}

func initialRunnerState(workspaceID string, execution WorkflowExecution, nodeExecution WorkflowNodeExecution, runnerKind WorkflowActionKind, now string) WorkflowRunnerState {
	return WorkflowRunnerState{
		SchemaVersion:          SchemaVersion,
		WorkspaceID:            workspaceID,
		ExecutionID:            execution.ID,
		NodeExecutionID:        nodeExecution.ID,
		RunnerKind:             runnerKind,
		Status:                 RunnerStateStatusStarting,
		LastRunnerEventOrdinal: 0,
		OpaqueState:            json.RawMessage(`{}`),
		CreatedAt:              now,
		UpdatedAt:              now,
	}
}
