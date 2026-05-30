package chat

import "encoding/json"

const (
	SchemaVersion = 1

	HarnessCodex = "codex"

	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleSystem    = "system"
	RoleDeveloper = "developer"
	RoleTool      = "tool"

	MessageStatusPending   = "pending"
	MessageStatusStreaming = "streaming"
	MessageStatusComplete  = "complete"
	MessageStatusCancelled = "cancelled"
	MessageStatusError     = "error"

	MessageDeliveryNormal   = "normal"
	MessageDeliveryQueued   = "queued"
	MessageDeliverySteering = "steering"

	MessagePartText = "text"

	TextFormatPlain    = "plain"
	TextFormatMarkdown = "markdown"

	RunStatusQueued    = "queued"
	RunStatusRunning   = "running"
	RunStatusCompleted = "completed"
	RunStatusCancelled = "cancelled"
	RunStatusFailed    = "failed"

	HarnessRefLinked      = "linked"
	HarnessRefMissing     = "missing"
	HarnessRefStale       = "stale"
	HarnessRefUnsupported = "unsupported"

	ApprovalStatusPending   = "pending"
	ApprovalStatusApproved  = "approved"
	ApprovalStatusDenied    = "denied"
	ApprovalStatusAnswered  = "answered"
	ApprovalStatusCancelled = "cancelled"

	ApprovalKindCommand    = "command"
	ApprovalKindFileChange = "file_change"
	ApprovalKindPermission = "permission"
	ApprovalKindUserInput  = "user_input"

	RunItemStatusPending   = "pending"
	RunItemStatusRunning   = "running"
	RunItemStatusCompleted = "completed"
	RunItemStatusFailed    = "failed"
	RunItemStatusCancelled = "cancelled"

	RunItemTypeAgentMessage        = "agent_message"
	RunItemTypePlan                = "plan"
	RunItemTypeReasoning           = "reasoning"
	RunItemTypeCommandExecution    = "command_execution"
	RunItemTypeFileChange          = "file_change"
	RunItemTypeMCPToolCall         = "mcp_tool_call"
	RunItemTypeDynamicToolCall     = "dynamic_tool_call"
	RunItemTypeCollabAgentToolCall = "collab_agent_tool_call"
	RunItemTypeWebSearch           = "web_search"
	RunItemTypeImageView           = "image_view"
	RunItemTypeImageGeneration     = "image_generation"
	RunItemTypeTerminalInteraction = "terminal_interaction"
	RunItemTypeDiff                = "diff"
	RunItemTypeNotice              = "notice"
)

type Conversation struct {
	SchemaVersion int                `json:"schemaVersion"`
	ID            string             `json:"id"`
	WorkspaceID   string             `json:"workspaceId"`
	Title         string             `json:"title"`
	CreatedAt     string             `json:"createdAt"`
	UpdatedAt     string             `json:"updatedAt"`
	ArchivedAt    string             `json:"archivedAt"`
	HarnessRefs   []HarnessThreadRef `json:"harnessRefs"`
}

type ChatMessage struct {
	SchemaVersion  int           `json:"schemaVersion"`
	ID             string        `json:"id"`
	ConversationID string        `json:"conversationId"`
	RunID          string        `json:"runId"`
	Role           string        `json:"role"`
	Delivery       string        `json:"delivery"`
	Ordinal        int           `json:"ordinal"`
	CreatedAt      string        `json:"createdAt"`
	UpdatedAt      string        `json:"updatedAt"`
	Status         string        `json:"status"`
	Parts          []MessagePart `json:"parts"`
}

type MessagePart struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Text   string `json:"text"`
	Format string `json:"format"`
}

type HarnessThreadRef struct {
	Harness        string `json:"harness"`
	ThreadID       string `json:"threadId"`
	SessionID      string `json:"sessionId"`
	LastTurnID     string `json:"lastTurnId"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt"`
	LastResumedAt  string `json:"lastResumedAt"`
	UnavailableMsg string `json:"unavailableMessage"`
}

type Run struct {
	SchemaVersion      int             `json:"schemaVersion"`
	ID                 string          `json:"id"`
	WorkspaceID        string          `json:"workspaceId"`
	ConversationID     string          `json:"conversationId"`
	TriggerMessageID   string          `json:"triggerMessageId"`
	Harness            string          `json:"harness"`
	Status             string          `json:"status"`
	StartedAt          string          `json:"startedAt"`
	CompletedAt        string          `json:"completedAt"`
	PromptSummary      string          `json:"promptSummary"`
	Error              string          `json:"error"`
	HasPendingApproval bool            `json:"hasPendingApproval"`
	PendingApproval    ApprovalRequest `json:"pendingApproval"`
}

type ApprovalRequest struct {
	ID             string             `json:"id"`
	RunID          string             `json:"runId"`
	RunItemID      string             `json:"runItemId"`
	ProviderItemID string             `json:"providerItemId"`
	Kind           string             `json:"kind"`
	Title          string             `json:"title"`
	Body           string             `json:"body"`
	Command        string             `json:"command"`
	FilePath       string             `json:"filePath"`
	Permission     string             `json:"permission"`
	Question       string             `json:"question"`
	Options        []string           `json:"options"`
	Questions      []ApprovalQuestion `json:"questions"`
	Status         string             `json:"status"`
	CreatedAt      string             `json:"createdAt"`
	ResolvedAt     string             `json:"resolvedAt"`
	Response       string             `json:"response"`
	Approved       bool               `json:"approved"`
}

type ApprovalQuestion struct {
	ID       string   `json:"id"`
	Header   string   `json:"header"`
	Question string   `json:"question"`
	Options  []string `json:"options"`
	IsOther  bool     `json:"isOther"`
	IsSecret bool     `json:"isSecret"`
}

type ApprovalAnswer struct {
	QuestionID string   `json:"questionId"`
	Answers    []string `json:"answers"`
}

type TraceEvent struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	RunID         string `json:"runId"`
	Type          string `json:"type"`
	CreatedAt     string `json:"createdAt"`
	Message       string `json:"message"`
}

type RunItem struct {
	SchemaVersion  int      `json:"schemaVersion"`
	ID             string   `json:"id"`
	WorkspaceID    string   `json:"workspaceId"`
	ConversationID string   `json:"conversationId"`
	RunID          string   `json:"runId"`
	ProviderItemID string   `json:"providerItemId"`
	Type           string   `json:"type"`
	Status         string   `json:"status"`
	CreatedAt      string   `json:"createdAt"`
	StartedAt      string   `json:"startedAt"`
	CompletedAt    string   `json:"completedAt"`
	Title          string   `json:"title"`
	Summary        string   `json:"summary"`
	Command        string   `json:"command"`
	Cwd            string   `json:"cwd"`
	ExitCode       int      `json:"exitCode"`
	DurationMs     int      `json:"durationMs"`
	FilePaths      []string `json:"filePaths"`
	PatchStatus    string   `json:"patchStatus"`
	ServerName     string   `json:"serverName"`
	ToolName       string   `json:"toolName"`
	Progress       string   `json:"progress"`
	Result         string   `json:"result"`
	Error          string   `json:"error"`
	NoticeKind     string   `json:"noticeKind"`
	NoticeMessage  string   `json:"noticeMessage"`
	DiffSummary    string   `json:"diffSummary"`
}

type RunItemOutput struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	RunItemID     string `json:"runItemId"`
	Stream        string `json:"stream"`
	Ordinal       int    `json:"ordinal"`
	Text          string `json:"text"`
	CreatedAt     string `json:"createdAt"`
}

type QueueState struct {
	Messages []ChatMessage `json:"messages"`
	Runs     []Run         `json:"runs"`
}

type ConversationListItem struct {
	Conversation Conversation `json:"conversation"`
	MessageCount int          `json:"messageCount"`
	ActiveRunID  string       `json:"activeRunId"`
}

type MessagePage struct {
	Conversation       Conversation    `json:"conversation"`
	Messages           []ChatMessage   `json:"messages"`
	RunItems           []RunItem       `json:"runItems"`
	RunItemOutputs     []RunItemOutput `json:"runItemOutputs"`
	Queue              QueueState      `json:"queue"`
	HasMoreOlder       bool            `json:"hasMoreOlder"`
	OlderBeforeOrdinal int             `json:"olderBeforeOrdinal"`
}

type RunActivityPage struct {
	RunID       string          `json:"runId"`
	Items       []RunItem       `json:"items"`
	Output      []RunItemOutput `json:"output"`
	HasMore     bool            `json:"hasMore"`
	NextOrdinal int             `json:"nextOrdinal"`
}

type QueueMessageResult struct {
	Conversation Conversation `json:"conversation"`
	UserMessage  ChatMessage  `json:"userMessage"`
	Run          Run          `json:"run"`
	Queue        QueueState   `json:"queue"`
	Page         MessagePage  `json:"page"`
}

type SteerMessageResult struct {
	Conversation Conversation `json:"conversation"`
	UserMessage  ChatMessage  `json:"userMessage"`
	Run          Run          `json:"run"`
	Page         MessagePage  `json:"page"`
}

func (approval ApprovalRequest) MarshalJSON() ([]byte, error) {
	type approvalAlias ApprovalRequest
	if approval.Options == nil {
		approval.Options = []string{}
	}
	if approval.Questions == nil {
		approval.Questions = []ApprovalQuestion{}
	}
	return json.Marshal(approvalAlias(approval))
}

func (question ApprovalQuestion) MarshalJSON() ([]byte, error) {
	type questionAlias ApprovalQuestion
	if question.Options == nil {
		question.Options = []string{}
	}
	return json.Marshal(questionAlias(question))
}

func (answer ApprovalAnswer) MarshalJSON() ([]byte, error) {
	type answerAlias ApprovalAnswer
	if answer.Answers == nil {
		answer.Answers = []string{}
	}
	return json.Marshal(answerAlias(answer))
}

func (item RunItem) MarshalJSON() ([]byte, error) {
	type itemAlias RunItem
	if item.FilePaths == nil {
		item.FilePaths = []string{}
	}
	return json.Marshal(itemAlias(item))
}

func (state QueueState) MarshalJSON() ([]byte, error) {
	type stateAlias QueueState
	if state.Messages == nil {
		state.Messages = []ChatMessage{}
	}
	if state.Runs == nil {
		state.Runs = []Run{}
	}
	return json.Marshal(stateAlias(state))
}

func (page MessagePage) MarshalJSON() ([]byte, error) {
	type pageAlias MessagePage
	if page.Messages == nil {
		page.Messages = []ChatMessage{}
	}
	if page.RunItems == nil {
		page.RunItems = []RunItem{}
	}
	if page.RunItemOutputs == nil {
		page.RunItemOutputs = []RunItemOutput{}
	}
	return json.Marshal(pageAlias(page))
}

func (page RunActivityPage) MarshalJSON() ([]byte, error) {
	type pageAlias RunActivityPage
	if page.Items == nil {
		page.Items = []RunItem{}
	}
	if page.Output == nil {
		page.Output = []RunItemOutput{}
	}
	return json.Marshal(pageAlias(page))
}
