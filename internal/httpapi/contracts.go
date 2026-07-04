package httpapi

import (
	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspaceactivity"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type UpdateAppearanceSettingsRequest struct {
	Settings appearance.AppearanceSettings `json:"settings"`
}

type OpenWorkspaceRequest struct {
	RootPath string `json:"rootPath"`
}

type OpenWorkspaceResponse struct {
	Workspace workspace.WorkspaceSummary        `json:"workspace"`
	Session   workspacesession.WorkspaceSession `json:"session"`
}

type SelectWorkspaceRequest struct {
	ID string `json:"id"`
}

type WorkspaceSelectedConversations struct {
	SelectedConversationIDsByWorkspaceID map[string]string `json:"selectedConversationIdsByWorkspaceId"`
}

type SetWorkspaceSelectedConversationRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type CloseWorkspaceRequest struct {
	ID string `json:"id"`
}

type ReorderWorkspaceRequest struct {
	IDs []string `json:"ids"`
}

type RemoveRecentWorkspaceRequest struct {
	ID string `json:"id"`
}

type ReadWorkspaceUILayoutRequest struct {
	WorkspaceID string `json:"workspaceId"`
}

type SaveWorkspaceUILayoutRequest struct {
	Layout workspaceui.WorkspaceUILayout `json:"layout"`
}

type ReadWorkspaceActivitySnapshotRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Limit       int    `json:"limit"`
}

type ReadWorkspaceActivitySnapshotResponse struct {
	Snapshot workspaceactivity.WorkspaceActivitySnapshot `json:"snapshot"`
}

type ReadWorkflowExecutionActivityRequest struct {
	WorkspaceID string `json:"workspaceId"`
	ExecutionID string `json:"executionId"`
	Limit       int    `json:"limit"`
}

type ReadWorkflowExecutionActivityResponse struct {
	Snapshot workspaceactivity.WorkspaceActivitySnapshot `json:"snapshot"`
}

type ListConversationsRequest struct {
	WorkspaceID string `json:"workspaceId"`
}

type ListConversationsResponse struct {
	Conversations []chat.ConversationListItem `json:"conversations"`
	Corruption    chat.CorruptionSummary      `json:"corruption"`
	Diagnostics   []chat.Diagnostic           `json:"diagnostics"`
}

type CreateConversationRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
}

type DeleteConversationRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type MarkConversationReadRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type SetConversationPinnedRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Pinned         bool   `json:"pinned"`
}

type GetMessagePageRequest struct {
	WorkspaceID        string `json:"workspaceId"`
	ConversationID     string `json:"conversationId"`
	BeforeBlockOrdinal int    `json:"beforeBlockOrdinal"`
	Limit              int    `json:"limit"`
}

type ListComposerPromptHistoryRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	BeforeOrdinal  int    `json:"beforeOrdinal"`
	Limit          int    `json:"limit"`
}

type SendChatMessageRequest struct {
	WorkspaceID    string         `json:"workspaceId"`
	ConversationID string         `json:"conversationId"`
	Input          chat.ChatInput `json:"input"`
}

type QueueChatMessageRequest struct {
	WorkspaceID    string         `json:"workspaceId"`
	ConversationID string         `json:"conversationId"`
	Input          chat.ChatInput `json:"input"`
}

type EditQueuedChatMessageRequest struct {
	WorkspaceID    string         `json:"workspaceId"`
	ConversationID string         `json:"conversationId"`
	MessageID      string         `json:"messageId"`
	Input          chat.ChatInput `json:"input"`
}

type RemoveQueuedChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
}

type SteerChatMessageRequest struct {
	WorkspaceID    string         `json:"workspaceId"`
	ConversationID string         `json:"conversationId"`
	Input          chat.ChatInput `json:"input"`
}

type SendSteeringImmediatelyRequest struct {
	WorkspaceID    string          `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	Input          *chat.ChatInput `json:"input,omitempty"`
}

type CreateChatImageAttachmentFromBytesRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	FileName       string `json:"fileName"`
	DataBase64     string `json:"dataBase64"`
}

type CreateChatImageAttachmentFromPathRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	SourcePath     string `json:"sourcePath"`
}

type ListChatCommandsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ExecuteChatCommandRequest struct {
	WorkspaceID            string `json:"workspaceId"`
	ConversationID         string `json:"conversationId"`
	Raw                    string `json:"raw"`
	ConfirmGoalReplacement bool   `json:"confirmGoalReplacement"`
}

type SetChatCodexModelRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	ModelID        string `json:"modelId"`
}

type OpenChatCodexModelPickerRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type OpenChatCodexPermissionPickerRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type UpdateChatCodexDefaultsRequest struct {
	Settings  chat.ChatCodexSettings `json:"settings"`
	Confirmed bool                   `json:"confirmed"`
}

type SetChatCodexReasoningEffortRequest struct {
	WorkspaceID     string               `json:"workspaceId"`
	ConversationID  string               `json:"conversationId"`
	ReasoningEffort chat.ReasoningEffort `json:"reasoningEffort"`
}

type SetChatCodexPermissionPresetRequest struct {
	WorkspaceID    string                      `json:"workspaceId"`
	ConversationID string                      `json:"conversationId"`
	Preset         chat.ChatPermissionPresetID `json:"preset"`
	Confirmed      bool                        `json:"confirmed"`
}

type CancelRunRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type GetActiveRunRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type GetActiveRunResponse struct {
	HasActiveRun bool              `json:"hasActiveRun"`
	Run          *chat.Run         `json:"run"`
	Liveness     *chat.RunLiveness `json:"liveness"`
}

type ReconcileChatRunsRequest struct {
	WorkspaceID    string                 `json:"workspaceId"`
	ConversationID string                 `json:"conversationId"`
	Reason         chat.RunLivenessReason `json:"reason"`
}

type ReconcileChatRunsResponse struct {
	Result chat.RunLivenessReconciliationResult `json:"result"`
}

type ListRunsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ListRunsResponse struct {
	Runs []chat.Run `json:"runs"`
}

type GetRunActivityRequest struct {
	WorkspaceID string `json:"workspaceId"`
	RunID       string `json:"runId"`
	Limit       int    `json:"limit"`
}

type GetRunItemOutputRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	RunID        string `json:"runId"`
	RunItemID    string `json:"runItemId"`
	AfterOrdinal int    `json:"afterOrdinal"`
	Limit        int    `json:"limit"`
}

type ListBackgroundTerminalsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type GetBackgroundTerminalOutputRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	ProcessID      string `json:"processId"`
	AfterOrdinal   int    `json:"afterOrdinal"`
	Limit          int    `json:"limit"`
}

type KillBackgroundTerminalRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	ProcessID      string `json:"processId"`
}

type KillAllBackgroundTerminalsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ListDiagnosticsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	RunID          string `json:"runId"`
}

type ListDiagnosticsResponse struct {
	Diagnostics []chat.Diagnostic `json:"diagnostics"`
}

type SubmitApprovalRequest struct {
	WorkspaceID    string                `json:"workspaceId"`
	ConversationID string                `json:"conversationId"`
	ApprovalID     string                `json:"approvalId"`
	Approved       bool                  `json:"approved"`
	Response       string                `json:"response"`
	Answers        []chat.ApprovalAnswer `json:"answers"`
	Cancelled      bool                  `json:"cancelled"`
}

type ListWorkflowDefinitionsRequest struct {
	WorkspaceID string `json:"workspaceId"`
}

type ListWorkflowDefinitionsResponse struct {
	Definitions []orchestrator.WorkflowDefinition `json:"definitions"`
}

type CreateWorkflowDefinitionRequest struct {
	WorkspaceID string                     `json:"workspaceId"`
	Name        string                     `json:"name"`
	Description string                     `json:"description"`
	Graph       orchestrator.WorkflowGraph `json:"graph"`
}

type ReadWorkflowDefinitionRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	DefinitionID string `json:"definitionId"`
}

type UpdateWorkflowDefinitionRequest struct {
	WorkspaceID  string                     `json:"workspaceId"`
	DefinitionID string                     `json:"definitionId"`
	Name         string                     `json:"name"`
	Description  string                     `json:"description"`
	Graph        orchestrator.WorkflowGraph `json:"graph"`
}

type DeleteWorkflowDefinitionRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	DefinitionID string `json:"definitionId"`
}

type DeleteWorkflowDefinitionResponse struct {
	Deleted bool `json:"deleted"`
}

type ValidateWorkflowDefinitionRequest struct {
	WorkspaceID string                     `json:"workspaceId"`
	Graph       orchestrator.WorkflowGraph `json:"graph"`
}

type ListWorkflowExecutionsRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	DefinitionID string `json:"definitionId"`
	Limit        int    `json:"limit"`
}

type ListWorkflowExecutionsResponse struct {
	Executions []orchestrator.WorkflowExecutionSummary `json:"executions"`
}

type StartWorkflowExecutionRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	DefinitionID string `json:"definitionId"`
	VersionID    string `json:"versionId"`
}

type CancelWorkflowExecutionRequest struct {
	WorkspaceID string `json:"workspaceId"`
	ExecutionID string `json:"executionId"`
}

type ReadWorkflowExecutionRequest struct {
	WorkspaceID string `json:"workspaceId"`
	ExecutionID string `json:"executionId"`
}

type ReadWorkflowGraphProjectionRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	DefinitionID string `json:"definitionId"`
	VersionID    string `json:"versionId"`
	ExecutionID  string `json:"executionId"`
}

type ReadWorkflowGraphProjectionResponse struct {
	Projection *orchestrator.WorkflowGraphProjection `json:"projection"`
}

type GetWorkflowExecutionEventsRequest struct {
	WorkspaceID   string `json:"workspaceId"`
	ExecutionID   string `json:"executionId"`
	BeforeOrdinal int    `json:"beforeOrdinal"`
	Limit         int    `json:"limit"`
}

type ReadWorkflowNodeTrajectoryRequest struct {
	WorkspaceID        string `json:"workspaceId"`
	ExecutionID        string `json:"executionId"`
	NodeExecutionID    string `json:"nodeExecutionId"`
	BeforeBlockOrdinal int    `json:"beforeBlockOrdinal"`
	TranscriptLimit    int    `json:"transcriptLimit"`
	OutputLimit        int    `json:"outputLimit"`
}

type StopWorkflowNodeRunRequest struct {
	WorkspaceID     string `json:"workspaceId"`
	ExecutionID     string `json:"executionId"`
	NodeExecutionID string `json:"nodeExecutionId"`
}

type SubmitWorkflowApprovalRequest struct {
	WorkspaceID     string                `json:"workspaceId"`
	ExecutionID     string                `json:"executionId"`
	NodeExecutionID string                `json:"nodeExecutionId"`
	ApprovalID      string                `json:"approvalId"`
	Approved        bool                  `json:"approved"`
	Response        string                `json:"response"`
	Answers         []chat.ApprovalAnswer `json:"answers"`
	Cancelled       bool                  `json:"cancelled"`
}

type ReadSemanticGraphRequest struct {
	WorkspaceID string `json:"workspaceId"`
}

type ReadSemanticNodeDetailRequest struct {
	WorkspaceID string `json:"workspaceId"`
	NodeID      string `json:"nodeId"`
}

type ReadSemanticNodeDetailResponse struct {
	Detail *semanticgraph.SemanticNodeDetail `json:"detail"`
}

type ListSemanticEvidenceRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	TargetEntityID string `json:"targetEntityId"`
}

type ListSemanticActivityRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	TargetEntityID string `json:"targetEntityId"`
	Limit          int    `json:"limit"`
}

type ListSemanticActivityPageRequest struct {
	WorkspaceID         string                                    `json:"workspaceId"`
	TargetEntityID      string                                    `json:"targetEntityId"`
	SourceKind          *semanticgraph.SemanticActivitySourceKind `json:"sourceKind"`
	SourceID            string                                    `json:"sourceId"`
	WorkflowExecutionID string                                    `json:"workflowExecutionId"`
	WorkflowNodeID      string                                    `json:"workflowNodeId"`
	ChatConversationID  string                                    `json:"chatConversationId"`
	ChatRunID           string                                    `json:"chatRunId"`
	ChatMessageID       string                                    `json:"chatMessageId"`
	ActorKind           *semanticgraph.SemanticActorKind          `json:"actorKind"`
	ActorID             string                                    `json:"actorId"`
	Offset              int                                       `json:"offset"`
	Limit               int                                       `json:"limit"`
}

type ReadSemanticActivitySummaryRequest struct {
	WorkspaceID string `json:"workspaceId"`
	RecentLimit int    `json:"recentLimit"`
}

type ReadSemanticSteeringStateRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	TargetEntityID string `json:"targetEntityId"`
}

type ReadSemanticEventHistoryRequest struct {
	WorkspaceID        string `json:"workspaceId"`
	TargetEntityID     string `json:"targetEntityId"`
	BeforeLogicalClock int    `json:"beforeLogicalClock"`
	Limit              int    `json:"limit"`
}

type ReadSemanticContextPackRequest struct {
	WorkspaceID string `json:"workspaceId"`
	PackID      string `json:"packId"`
}

type ListSemanticContextPacksRequest struct {
	WorkspaceID         string `json:"workspaceId"`
	TargetEntityID      string `json:"targetEntityId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Offset              int    `json:"offset"`
	Limit               int    `json:"limit"`
}

type BuildCartographerWindowRequest struct {
	WorkspaceID    string                                   `json:"workspaceId"`
	TriggerKind    semanticgraph.CartographerRunTriggerKind `json:"triggerKind"`
	TargetEntityID string                                   `json:"targetEntityId"`
	SourceRefs     semanticgraph.SemanticContextSourceRefs  `json:"sourceRefs"`
	RunStatus      string                                   `json:"runStatus"`
	TerminalReason string                                   `json:"terminalReason"`
	Summary        string                                   `json:"summary"`
}

type ProcessCartographerWindowRequest struct {
	WorkspaceID string `json:"workspaceId"`
	WindowID    string `json:"windowId"`
}

type ReadCartographerProcessingStateRequest struct{}

type ReadCartographerRunRequest struct {
	WorkspaceID string `json:"workspaceId"`
	RunID       string `json:"runId"`
}

type ListCartographerRunsRequest struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	TargetEntityID      string `json:"targetEntityId"`
	Limit               int    `json:"limit"`
}

type ListCartographerWindowsRequest struct {
	WorkspaceID         string                               `json:"workspaceId"`
	RunID               string                               `json:"runId"`
	SourceKind          semanticgraph.CartographerSourceKind `json:"sourceKind"`
	SourceID            string                               `json:"sourceId"`
	WorkflowExecutionID string                               `json:"workflowExecutionId"`
	ChatRunID           string                               `json:"chatRunId"`
	Limit               int                                  `json:"limit"`
}

type ListCartographerCursorsRequest struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Limit               int    `json:"limit"`
}

type ListCartographerPatchesRequest struct {
	WorkspaceID      string                                `json:"workspaceId"`
	RunID            string                                `json:"runId"`
	SemanticTargetID string                                `json:"semanticTargetId"`
	Status           semanticgraph.CartographerPatchStatus `json:"status"`
	Limit            int                                   `json:"limit"`
}

type ReviewCartographerPatchRequest struct {
	WorkspaceID string `json:"workspaceId"`
	PatchID     string `json:"patchId"`
}

type UpdateSemanticLayoutPositionsRequest struct {
	WorkspaceID string                                      `json:"workspaceId"`
	Positions   []semanticgraph.SemanticLayoutPositionInput `json:"positions"`
}

type AttachSemanticNodeToWorkflowExecutionRequest struct {
	WorkspaceID         string                             `json:"workspaceId"`
	NodeID              string                             `json:"nodeId"`
	WorkflowExecutionID string                             `json:"workflowExecutionId"`
	ActivityKind        semanticgraph.SemanticActivityKind `json:"activityKind"`
	Summary             string                             `json:"summary"`
	ActorKind           semanticgraph.SemanticActorKind    `json:"actorKind"`
	ActorID             string                             `json:"actorId"`
}

type AttachSemanticNodeToWorkflowNodeRequest struct {
	WorkspaceID             string                             `json:"workspaceId"`
	NodeID                  string                             `json:"nodeId"`
	WorkflowExecutionID     string                             `json:"workflowExecutionId"`
	WorkflowNodeID          string                             `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                             `json:"workflowNodeExecutionId"`
	WorkflowDefinitionID    string                             `json:"workflowDefinitionId"`
	ActivityKind            semanticgraph.SemanticActivityKind `json:"activityKind"`
	Summary                 string                             `json:"summary"`
	ActorKind               semanticgraph.SemanticActorKind    `json:"actorKind"`
	ActorID                 string                             `json:"actorId"`
}

type AttachSemanticNodeToChatRunRequest struct {
	WorkspaceID  string                             `json:"workspaceId"`
	NodeID       string                             `json:"nodeId"`
	ChatRunID    string                             `json:"chatRunId"`
	ActivityKind semanticgraph.SemanticActivityKind `json:"activityKind"`
	Summary      string                             `json:"summary"`
	ActorKind    semanticgraph.SemanticActorKind    `json:"actorKind"`
	ActorID      string                             `json:"actorId"`
}

type AttachSemanticNodeToChatMessageRequest struct {
	WorkspaceID        string                             `json:"workspaceId"`
	NodeID             string                             `json:"nodeId"`
	ChatConversationID string                             `json:"chatConversationId"`
	ChatMessageID      string                             `json:"chatMessageId"`
	ActivityKind       semanticgraph.SemanticActivityKind `json:"activityKind"`
	Summary            string                             `json:"summary"`
	ActorKind          semanticgraph.SemanticActorKind    `json:"actorKind"`
	ActorID            string                             `json:"actorId"`
}

type AttachSemanticNodeToRunItemRequest struct {
	WorkspaceID  string                             `json:"workspaceId"`
	NodeID       string                             `json:"nodeId"`
	ChatRunID    string                             `json:"chatRunId"`
	RunItemID    string                             `json:"runItemId"`
	ActivityKind semanticgraph.SemanticActivityKind `json:"activityKind"`
	Summary      string                             `json:"summary"`
	ActorKind    semanticgraph.SemanticActorKind    `json:"actorKind"`
	ActorID      string                             `json:"actorId"`
}

type AttachSemanticNodeToFileRangeRequest struct {
	WorkspaceID  string                             `json:"workspaceId"`
	NodeID       string                             `json:"nodeId"`
	Path         string                             `json:"path"`
	RangeStart   int                                `json:"rangeStart"`
	RangeEnd     int                                `json:"rangeEnd"`
	ActivityKind semanticgraph.SemanticActivityKind `json:"activityKind"`
	Summary      string                             `json:"summary"`
	ActorKind    semanticgraph.SemanticActorKind    `json:"actorKind"`
	ActorID      string                             `json:"actorId"`
}

type EndSemanticActivityRequest struct {
	WorkspaceID        string                          `json:"workspaceId"`
	ActivityIntervalID string                          `json:"activityIntervalId"`
	ActorKind          semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID            string                          `json:"actorId"`
}

type RenameSemanticNodeRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	NodeID      string                          `json:"nodeId"`
	Label       string                          `json:"label"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type UpdateSemanticNodeRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	NodeID      string                          `json:"nodeId"`
	Kind        *semanticgraph.SemanticNodeKind `json:"kind"`
	Summary     *string                         `json:"summary"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type SemanticNodeOperationRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	NodeID      string                          `json:"nodeId"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type SplitSemanticNodeRequest struct {
	WorkspaceID   string                                   `json:"workspaceId"`
	SourceNodeID  string                                   `json:"sourceNodeId"`
	Nodes         []semanticgraph.SemanticNodeSeedInput    `json:"nodes"`
	Reassignments semanticgraph.SemanticReassignmentInputs `json:"reassignments"`
	ActorKind     semanticgraph.SemanticActorKind          `json:"actorKind"`
	ActorID       string                                   `json:"actorId"`
}

type MergeSemanticNodesRequest struct {
	WorkspaceID   string                                   `json:"workspaceId"`
	SourceNodeIDs []string                                 `json:"sourceNodeIds"`
	TargetNode    semanticgraph.SemanticNodeSeedInput      `json:"targetNode"`
	Reassignments semanticgraph.SemanticReassignmentInputs `json:"reassignments"`
	ActorKind     semanticgraph.SemanticActorKind          `json:"actorKind"`
	ActorID       string                                   `json:"actorId"`
}

type CreateSemanticNodeRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	NodeID      string                          `json:"nodeId"`
	Kind        semanticgraph.SemanticNodeKind  `json:"kind"`
	Label       string                          `json:"label"`
	Summary     string                          `json:"summary"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type CreateSemanticEdgeRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	EdgeID      string                          `json:"edgeId"`
	Kind        semanticgraph.SemanticEdgeKind  `json:"kind"`
	FromNodeID  string                          `json:"fromNodeId"`
	ToNodeID    string                          `json:"toNodeId"`
	Label       string                          `json:"label"`
	Summary     string                          `json:"summary"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type UpdateSemanticEdgeRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	EdgeID      string                          `json:"edgeId"`
	Kind        *semanticgraph.SemanticEdgeKind `json:"kind"`
	Label       *string                         `json:"label"`
	Summary     *string                         `json:"summary"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type SemanticEdgeOperationRequest struct {
	WorkspaceID string                          `json:"workspaceId"`
	EdgeID      string                          `json:"edgeId"`
	ActorKind   semanticgraph.SemanticActorKind `json:"actorKind"`
	ActorID     string                          `json:"actorId"`
}

type CreateSemanticSteeringDirectiveRequest struct {
	WorkspaceID             string                              `json:"workspaceId"`
	TargetEntityID          string                              `json:"targetEntityId"`
	Kind                    semanticgraph.SemanticSteeringKind  `json:"kind"`
	Instruction             string                              `json:"instruction"`
	Scope                   semanticgraph.SemanticSteeringScope `json:"scope"`
	WorkflowDefinitionID    string                              `json:"workflowDefinitionId"`
	WorkflowExecutionID     string                              `json:"workflowExecutionId"`
	WorkflowNodeID          string                              `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                              `json:"workflowNodeExecutionId"`
	ChatConversationID      string                              `json:"chatConversationId"`
	ChatRunID               string                              `json:"chatRunId"`
	ChatMessageID           string                              `json:"chatMessageId"`
	RunItemID               string                              `json:"runItemId"`
	ActorKind               semanticgraph.SemanticActorKind     `json:"actorKind"`
	ActorID                 string                              `json:"actorId"`
}

type UpdateSemanticSteeringDirectiveRequest struct {
	WorkspaceID           string                                `json:"workspaceId"`
	DirectiveID           string                                `json:"directiveId"`
	Instruction           *string                               `json:"instruction"`
	Status                *semanticgraph.SemanticSteeringStatus `json:"status"`
	SupersedesDirectiveID string                                `json:"supersedesDirectiveId"`
	ActorKind             semanticgraph.SemanticActorKind       `json:"actorKind"`
	ActorID               string                                `json:"actorId"`
}

type CreateTerminalRequest struct {
	WorkspaceID string `json:"workspaceId"`
	PaneID      string `json:"paneId"`
	ProfileID   string `json:"profileId"`
	CWD         string `json:"cwd"`
	Cols        int    `json:"cols"`
	Rows        int    `json:"rows"`
}

type AttachTerminalRequest struct {
	WorkspaceID string `json:"workspaceId"`
	PaneID      string `json:"paneId"`
}

type TerminalSessionSummary struct {
	ID          string                 `json:"id"`
	WorkspaceID string                 `json:"workspaceId"`
	PaneID      string                 `json:"paneId"`
	ProfileID   string                 `json:"profileId"`
	CWD         string                 `json:"cwd"`
	Cols        int                    `json:"cols"`
	Rows        int                    `json:"rows"`
	Status      terminal.SessionStatus `json:"status"`
	CreatedAt   string                 `json:"createdAt"`
	UpdatedAt   string                 `json:"updatedAt"`
	ExitCode    int                    `json:"exitCode"`
	Message     string                 `json:"message"`
}

type TerminalSessionResponse struct {
	Session TerminalSessionSummary `json:"session"`
}

type TerminalInputRequest struct {
	SessionID  string `json:"sessionId"`
	DataBase64 string `json:"dataBase64"`
}

type TerminalInputResponse struct {
	AcceptedBytes int `json:"acceptedBytes"`
}

type ResizeTerminalRequest struct {
	SessionID string `json:"sessionId"`
	Cols      int    `json:"cols"`
	Rows      int    `json:"rows"`
}

type CloseTerminalRequest struct {
	SessionID string             `json:"sessionId"`
	Mode      terminal.CloseMode `json:"mode"`
}

type CreateTerminalProfileRequest struct {
	Profile terminal.TerminalProfileInput `json:"profile"`
}

type UpdateTerminalProfileRequest struct {
	ID      string                        `json:"id"`
	Profile terminal.TerminalProfileInput `json:"profile"`
}

type DeleteTerminalProfileRequest struct {
	ID string `json:"id"`
}

type SelectDefaultTerminalProfileRequest struct {
	ID string `json:"id"`
}

type APIError struct {
	Code            string                                 `json:"code"`
	Message         string                                 `json:"message"`
	ActiveExecution *orchestrator.WorkflowExecutionSummary `json:"activeExecution"`
}

type ErrorResponse struct {
	Error APIError `json:"error"`
}
