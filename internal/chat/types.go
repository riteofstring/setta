package chat

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
	ID         string   `json:"id"`
	RunID      string   `json:"runId"`
	Kind       string   `json:"kind"`
	Title      string   `json:"title"`
	Body       string   `json:"body"`
	Command    string   `json:"command"`
	FilePath   string   `json:"filePath"`
	Permission string   `json:"permission"`
	Question   string   `json:"question"`
	Options    []string `json:"options"`
	Status     string   `json:"status"`
	CreatedAt  string   `json:"createdAt"`
	ResolvedAt string   `json:"resolvedAt"`
	Response   string   `json:"response"`
	Approved   bool     `json:"approved"`
}

type TraceEvent struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	RunID         string `json:"runId"`
	Type          string `json:"type"`
	CreatedAt     string `json:"createdAt"`
	Message       string `json:"message"`
}

type ConversationListItem struct {
	Conversation Conversation `json:"conversation"`
	MessageCount int          `json:"messageCount"`
	ActiveRunID  string       `json:"activeRunId"`
}

type MessagePage struct {
	Conversation       Conversation  `json:"conversation"`
	Messages           []ChatMessage `json:"messages"`
	HasMoreOlder       bool          `json:"hasMoreOlder"`
	OlderBeforeOrdinal int           `json:"olderBeforeOrdinal"`
}
