package agent

import (
	"errors"
	"fmt"
	"strings"
)

type PermissionMode string

const (
	PermissionModeReadOnly       PermissionMode = "read_only"
	PermissionModeWorkspaceWrite PermissionMode = "workspace_write"
	PermissionModeFullAccess     PermissionMode = "full_access"
)

type ApprovalMode string

const (
	ApprovalModeNever     ApprovalMode = "never"
	ApprovalModeOnRequest ApprovalMode = "on_request"
	ApprovalModeUntrusted ApprovalMode = "untrusted"
)

type Invocation struct {
	ModelSelectionProviderDefault bool           `json:"modelSelectionProviderDefault"`
	Model                         string         `json:"model,omitempty"`
	ReasoningEffort               string         `json:"reasoningEffort,omitempty"`
	ServiceTier                   *string        `json:"serviceTier,omitempty"`
	PermissionMode                PermissionMode `json:"permissionMode"`
	ApprovalMode                  ApprovalMode   `json:"approvalMode"`
}

type ResolvedInvocation struct {
	Requested       Invocation     `json:"requested"`
	Model           string         `json:"model"`
	ReasoningEffort string         `json:"reasoningEffort"`
	ServiceTier     *string        `json:"serviceTier,omitempty"`
	PermissionMode  PermissionMode `json:"permissionMode"`
	ApprovalMode    ApprovalMode   `json:"approvalMode"`
}

func (invocation Invocation) Validate() error {
	if invocation.ModelSelectionProviderDefault == (invocation.Model != "") {
		return errors.New("agent invocation requires exactly one of provider-default or exact model")
	}
	switch invocation.PermissionMode {
	case PermissionModeReadOnly, PermissionModeWorkspaceWrite, PermissionModeFullAccess:
	default:
		return fmt.Errorf("unsupported agent permission mode %q", invocation.PermissionMode)
	}
	switch invocation.ApprovalMode {
	case ApprovalModeNever, ApprovalModeOnRequest, ApprovalModeUntrusted:
	default:
		return fmt.Errorf("unsupported agent approval mode %q", invocation.ApprovalMode)
	}
	return nil
}

type Thread struct {
	ID             string       `json:"id"`
	SessionID      string       `json:"sessionId"`
	CWD            string       `json:"cwd"`
	Model          string       `json:"model"`
	ModelProvider  string       `json:"modelProvider"`
	Status         string       `json:"status"`
	Ephemeral      bool         `json:"ephemeral"`
	ForkedFromID   *string      `json:"forkedFromId,omitempty"`
	ParentThreadID *string      `json:"parentThreadId,omitempty"`
	TurnCount      int          `json:"turnCount"`
	Turns          []ThreadTurn `json:"turns,omitempty"`
	CreatedAt      int          `json:"createdAt"`
	UpdatedAt      int          `json:"updatedAt"`
}

type ThreadTurn struct {
	ID     string              `json:"id"`
	Status string              `json:"status"`
	Items  []ThreadItemSummary `json:"items"`
}

type ThreadUnsubscribeStatus string

const (
	ThreadUnsubscribeStatusNotLoaded     ThreadUnsubscribeStatus = "not_loaded"
	ThreadUnsubscribeStatusNotSubscribed ThreadUnsubscribeStatus = "not_subscribed"
	ThreadUnsubscribeStatusUnsubscribed  ThreadUnsubscribeStatus = "unsubscribed"
)

type ThreadItemSummary struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Text   string `json:"text,omitempty"`
	Status string `json:"status,omitempty"`
}

func (thread Thread) Validate() error {
	if strings.TrimSpace(thread.ID) == "" {
		return errors.New("agent thread id is required")
	}
	if strings.TrimSpace(thread.SessionID) == "" {
		return errors.New("agent thread session id is required")
	}
	if thread.TurnCount < 0 {
		return errors.New("agent thread turn count must be non-negative")
	}
	return nil
}

type ThreadPage struct {
	Data            []Thread `json:"data"`
	NextCursor      *string  `json:"nextCursor,omitempty"`
	BackwardsCursor *string  `json:"backwardsCursor,omitempty"`
}

type ThreadSearchResult struct {
	Thread  Thread `json:"thread"`
	Snippet string `json:"snippet"`
}

type ThreadSearchPage struct {
	Data            []ThreadSearchResult `json:"data"`
	NextCursor      *string              `json:"nextCursor,omitempty"`
	BackwardsCursor *string              `json:"backwardsCursor,omitempty"`
}

type Model struct {
	ID                        string   `json:"id"`
	DisplayName               string   `json:"displayName"`
	Description               string   `json:"description"`
	DefaultReasoningEffort    string   `json:"defaultReasoningEffort"`
	SupportedReasoningEfforts []string `json:"supportedReasoningEfforts"`
	ServiceTiers              []string `json:"serviceTiers"`
	DefaultServiceTier        *string  `json:"defaultServiceTier,omitempty"`
	IsDefault                 bool     `json:"isDefault"`
	Hidden                    bool     `json:"hidden"`
}

type ModelPage struct {
	Data       []Model `json:"data"`
	NextCursor *string `json:"nextCursor,omitempty"`
}

type StartThreadRequest struct {
	WorkspaceRoot         string        `json:"workspaceRoot"`
	Invocation            Invocation    `json:"invocation"`
	Ephemeral             bool          `json:"ephemeral"`
	DeveloperInstructions string        `json:"developerInstructions,omitempty"`
	DynamicTools          []DynamicTool `json:"-"`
}

type ForkThreadRequest struct {
	ParentThreadID        string        `json:"parentThreadId"`
	LastTurnID            *string       `json:"lastTurnId,omitempty"`
	WorkspaceRoot         string        `json:"workspaceRoot"`
	Invocation            Invocation    `json:"invocation"`
	Ephemeral             bool          `json:"ephemeral"`
	DeveloperInstructions string        `json:"developerInstructions,omitempty"`
	DynamicTools          []DynamicTool `json:"-"`
}

type ListThreadsRequest struct {
	Cursor     *string `json:"cursor,omitempty"`
	Limit      int     `json:"limit"`
	SearchTerm *string `json:"searchTerm,omitempty"`
	Archived   bool    `json:"archived"`
}

type SearchThreadsRequest struct {
	Cursor     *string `json:"cursor,omitempty"`
	Limit      int     `json:"limit"`
	SearchTerm string  `json:"searchTerm"`
	Archived   bool    `json:"archived"`
}

type InjectedTextItem struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type TurnRequest struct {
	ConversationID        string                `json:"conversationId"`
	TurnID                string                `json:"turnId"`
	ProviderThreadID      string                `json:"providerThreadId"`
	ClientInputID         string                `json:"clientInputId"`
	Text                  string                `json:"text"`
	WorkspaceRoot         string                `json:"workspaceRoot"`
	Invocation            Invocation            `json:"invocation"`
	TokenUsageAttribution TokenUsageAttribution `json:"-"`
	OutputSchema          []byte                `json:"outputSchema,omitempty"`
	DynamicTools          []DynamicTool         `json:"-"`
}

type TurnResult struct {
	ProviderThreadID string      `json:"providerThreadId"`
	ProviderTurnID   string      `json:"providerTurnId"`
	Outcome          TurnOutcome `json:"outcome"`
	Error            *string     `json:"error,omitempty"`
}

type TurnOutcome string

const (
	TurnOutcomeCompleted   TurnOutcome = "completed"
	TurnOutcomeInterrupted TurnOutcome = "interrupted"
	TurnOutcomeFailed      TurnOutcome = "failed"
)

type TurnControlRequest struct {
	ConversationID   string `json:"conversationId"`
	ProviderThreadID string `json:"providerThreadId"`
	ProviderTurnID   string `json:"providerTurnId"`
	ClientInputID    string `json:"clientInputId,omitempty"`
	Text             string `json:"text,omitempty"`
}

type ApprovalDecision string

const (
	ApprovalDecisionAccept  ApprovalDecision = "accept"
	ApprovalDecisionDecline ApprovalDecision = "decline"
	ApprovalDecisionCancel  ApprovalDecision = "cancel"
)

type ApprovalAnswer struct {
	QuestionID string   `json:"questionId"`
	Answers    []string `json:"answers,omitempty"`
}

type ApprovalResponse struct {
	RequestID string           `json:"requestId"`
	Decision  ApprovalDecision `json:"decision"`
	Answers   []ApprovalAnswer `json:"answers,omitempty"`
}
