package httpapi

import (
	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
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
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	BeforeOrdinal  int    `json:"beforeOrdinal"`
	Limit          int    `json:"limit"`
}

type SendChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
}

type QueueChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
}

type EditQueuedChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
	Prompt         string `json:"prompt"`
}

type RemoveQueuedChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
}

type SteerChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
}

type SendSteeringImmediatelyRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt,omitempty"`
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

type SetChatCodexReasoningEffortRequest struct {
	WorkspaceID     string               `json:"workspaceId"`
	ConversationID  string               `json:"conversationId"`
	ReasoningEffort chat.ReasoningEffort `json:"reasoningEffort"`
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
	HasActiveRun bool      `json:"hasActiveRun"`
	Run          *chat.Run `json:"run"`
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

type UpdateSemanticLayoutPositionsRequest struct {
	WorkspaceID string                                      `json:"workspaceId"`
	Positions   []semanticgraph.SemanticLayoutPositionInput `json:"positions"`
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
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	Error APIError `json:"error"`
}
