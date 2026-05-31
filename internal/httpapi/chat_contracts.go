package httpapi

import "setta/internal/chat"

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
