package workspaceactivity

import (
	"setta/internal/chat"
	"setta/internal/orchestrator"
)

const SchemaVersion = 1

type WorkspaceActivityKind string
type WorkspaceActivityStatus string
type WorkspaceActivityEventType string
type WorkspaceActivityDeltaKind string
type WorkspaceActivityAnchorKind string
type WorkspaceActivityDetailKind string

const (
	ActivityKindWorkflowStatus WorkspaceActivityKind = "workflow_status"
	ActivityKindCommand        WorkspaceActivityKind = "command"
	ActivityKindFileChange     WorkspaceActivityKind = "file_change"
	ActivityKindApproval       WorkspaceActivityKind = "approval"

	ActivityStatusPending         WorkspaceActivityStatus = "pending"
	ActivityStatusRunning         WorkspaceActivityStatus = "running"
	ActivityStatusWaitingApproval WorkspaceActivityStatus = "waiting_approval"
	ActivityStatusCompleted       WorkspaceActivityStatus = "completed"
	ActivityStatusFailed          WorkspaceActivityStatus = "failed"
	ActivityStatusCancelled       WorkspaceActivityStatus = "cancelled"
	ActivityStatusApproved        WorkspaceActivityStatus = "approved"
	ActivityStatusDenied          WorkspaceActivityStatus = "denied"
	ActivityStatusAnswered        WorkspaceActivityStatus = "answered"
	ActivityStatusUnknown         WorkspaceActivityStatus = "unknown"

	EventTypeDelta          WorkspaceActivityEventType = "workspace_activity.delta"
	EventTypeResyncRequired WorkspaceActivityEventType = "workspace_activity.resync_required"

	DeltaKindUpsert WorkspaceActivityDeltaKind = "upsert"

	AnchorKindWorkflowExecution WorkspaceActivityAnchorKind = "workflow_execution"
	AnchorKindWorkflowNode      WorkspaceActivityAnchorKind = "workflow_node"

	DetailKindWorkflowEvent WorkspaceActivityDetailKind = "workflow_event"
	DetailKindWorkflowNode  WorkspaceActivityDetailKind = "workflow_node"
	DetailKindChatRunItem   WorkspaceActivityDetailKind = "chat_run_item"
	DetailKindApproval      WorkspaceActivityDetailKind = "approval"
)

var (
	activityKindValues = []WorkspaceActivityKind{
		ActivityKindWorkflowStatus,
		ActivityKindCommand,
		ActivityKindFileChange,
		ActivityKindApproval,
	}
	activityStatusValues = []WorkspaceActivityStatus{
		ActivityStatusPending,
		ActivityStatusRunning,
		ActivityStatusWaitingApproval,
		ActivityStatusCompleted,
		ActivityStatusFailed,
		ActivityStatusCancelled,
		ActivityStatusApproved,
		ActivityStatusDenied,
		ActivityStatusAnswered,
		ActivityStatusUnknown,
	}
	activityEventTypeValues = []WorkspaceActivityEventType{
		EventTypeDelta,
		EventTypeResyncRequired,
	}
	activityDeltaKindValues = []WorkspaceActivityDeltaKind{
		DeltaKindUpsert,
	}
	activityAnchorKindValues = []WorkspaceActivityAnchorKind{
		AnchorKindWorkflowExecution,
		AnchorKindWorkflowNode,
	}
	activityDetailKindValues = []WorkspaceActivityDetailKind{
		DetailKindWorkflowEvent,
		DetailKindWorkflowNode,
		DetailKindChatRunItem,
		DetailKindApproval,
	}
)

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "WorkspaceActivityKind", Values: stringValues(activityKindValues)},
		{Name: "WorkspaceActivityStatus", Values: stringValues(activityStatusValues)},
		{Name: "WorkspaceActivityEventType", Values: stringValues(activityEventTypeValues)},
		{Name: "WorkspaceActivityDeltaKind", Values: stringValues(activityDeltaKindValues)},
		{Name: "WorkspaceActivityAnchorKind", Values: stringValues(activityAnchorKindValues)},
		{Name: "WorkspaceActivityDetailKind", Values: stringValues(activityDetailKindValues)},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

type WorkspaceActivitySnapshot struct {
	SchemaVersion int                       `json:"schemaVersion"`
	WorkspaceID   string                    `json:"workspaceId"`
	StreamID      string                    `json:"streamId"`
	Sequence      int                       `json:"sequence"`
	Revision      int                       `json:"revision"`
	Activities    []WorkspaceActivityRecord `json:"activities"`
}

type WorkspaceActivityRecord struct {
	SchemaVersion int                          `json:"schemaVersion"`
	WorkspaceID   string                       `json:"workspaceId"`
	ActivityID    string                       `json:"activityId"`
	Revision      int                          `json:"revision"`
	Kind          WorkspaceActivityKind        `json:"kind"`
	Status        WorkspaceActivityStatus      `json:"status"`
	OccurredAt    string                       `json:"occurredAt"`
	UpdatedAt     string                       `json:"updatedAt"`
	Provenance    WorkspaceActivityProvenance  `json:"provenance"`
	GraphAnchor   *WorkspaceActivityAnchor     `json:"graphAnchor"`
	DetailRef     WorkspaceActivityDetailRef   `json:"detailRef"`
	Command       *WorkspaceActivityCommand    `json:"command"`
	FileChange    *WorkspaceActivityFileChange `json:"fileChange"`
	Approval      *WorkspaceActivityApproval   `json:"approval"`
	Workflow      *WorkspaceActivityWorkflow   `json:"workflow"`
}

type WorkspaceActivityProvenance struct {
	WorkflowDefinitionID        string                          `json:"workflowDefinitionId"`
	WorkflowDefinitionVersionID string                          `json:"workflowDefinitionVersionId"`
	WorkflowExecutionID         string                          `json:"workflowExecutionId"`
	WorkflowNodeID              string                          `json:"workflowNodeId"`
	WorkflowNodeExecutionID     string                          `json:"workflowNodeExecutionId"`
	WorkflowEventID             string                          `json:"workflowEventId"`
	WorkflowEventType           *orchestrator.WorkflowEventType `json:"workflowEventType"`
	WorkflowEventOrdinal        int                             `json:"workflowEventOrdinal"`
	WorkflowEventStreamID       string                          `json:"workflowEventStreamId"`
	WorkflowEventStreamSequence *int                            `json:"workflowEventStreamSequence"`
	RunnerEventID               string                          `json:"runnerEventId"`
	RunnerEventType             *orchestrator.RunnerEventType   `json:"runnerEventType"`
	RunnerEventOrdinal          int                             `json:"runnerEventOrdinal"`
	ChatConversationID          string                          `json:"chatConversationId"`
	ChatRunID                   string                          `json:"chatRunId"`
	ChatMessageID               string                          `json:"chatMessageId"`
	RunItemID                   string                          `json:"runItemId"`
	ProviderItemID              string                          `json:"providerItemId"`
	ChatEventID                 string                          `json:"chatEventId"`
	ChatEventStreamID           string                          `json:"chatEventStreamId"`
	ChatEventSequence           int                             `json:"chatEventSequence"`
}

type WorkspaceActivityAnchor struct {
	Kind                        WorkspaceActivityAnchorKind `json:"kind"`
	WorkflowDefinitionID        string                      `json:"workflowDefinitionId"`
	WorkflowDefinitionVersionID string                      `json:"workflowDefinitionVersionId"`
	WorkflowExecutionID         string                      `json:"workflowExecutionId"`
	WorkflowNodeID              string                      `json:"workflowNodeId"`
	WorkflowNodeExecutionID     string                      `json:"workflowNodeExecutionId"`
}

type WorkspaceActivityDetailRef struct {
	Kind                WorkspaceActivityDetailKind `json:"kind"`
	WorkspaceID         string                      `json:"workspaceId"`
	ConversationID      string                      `json:"conversationId"`
	RunID               string                      `json:"runId"`
	RunItemID           string                      `json:"runItemId"`
	WorkflowEventID     string                      `json:"workflowEventId"`
	WorkflowExecutionID string                      `json:"workflowExecutionId"`
	ApprovalID          string                      `json:"approvalId"`
}

type WorkspaceActivityCommand struct {
	CommandPreview string             `json:"commandPreview"`
	Cwd            string             `json:"cwd"`
	ExitCode       *int               `json:"exitCode"`
	DurationMs     *int               `json:"durationMs"`
	RunItemStatus  chat.RunItemStatus `json:"runItemStatus"`
}

type WorkspaceActivityFileChange struct {
	Paths          []string           `json:"paths"`
	PathCount      int                `json:"pathCount"`
	PathsTruncated bool               `json:"pathsTruncated"`
	PatchStatus    string             `json:"patchStatus"`
	RunItemStatus  chat.RunItemStatus `json:"runItemStatus"`
}

type WorkspaceActivityApproval struct {
	ApprovalID     string              `json:"approvalId"`
	Kind           *chat.ApprovalKind  `json:"kind"`
	Status         chat.ApprovalStatus `json:"status"`
	Title          string              `json:"title"`
	TargetLabel    string              `json:"targetLabel"`
	CommandPreview string              `json:"commandPreview"`
	FilePath       string              `json:"filePath"`
	Permission     string              `json:"permission"`
}

type WorkspaceActivityWorkflow struct {
	EventID    string                           `json:"eventId"`
	EventType  orchestrator.WorkflowEventType   `json:"eventType"`
	Message    string                           `json:"message"`
	RunnerKind *orchestrator.WorkflowActionKind `json:"runnerKind"`
}

type WorkspaceActivityEvent struct {
	SchemaVersion int                              `json:"schemaVersion"`
	StreamID      string                           `json:"streamId"`
	Sequence      int                              `json:"sequence"`
	EventID       string                           `json:"eventId"`
	Type          WorkspaceActivityEventType       `json:"type"`
	EmittedAt     string                           `json:"emittedAt"`
	WorkspaceID   string                           `json:"workspaceId"`
	Revision      int                              `json:"revision"`
	Delta         *WorkspaceActivityDelta          `json:"delta"`
	Resync        *WorkspaceActivityResyncRequired `json:"resync"`
}

type WorkspaceActivityDelta struct {
	Kind       WorkspaceActivityDeltaKind `json:"kind"`
	ActivityID string                     `json:"activityId"`
	Activity   *WorkspaceActivityRecord   `json:"activity"`
}

type WorkspaceActivityResyncRequired struct {
	Reason            string `json:"reason"`
	RequestedStreamID string `json:"requestedStreamId"`
	RequestedSequence int    `json:"requestedSequence"`
	CurrentStreamID   string `json:"currentStreamId"`
	CurrentSequence   int    `json:"currentSequence"`
	CurrentRevision   int    `json:"currentRevision"`
	EarliestSequence  int    `json:"earliestSequence"`
}

type EventCursor struct {
	StreamID string
	Sequence int
}
