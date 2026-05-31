package chat

import "encoding/json"

type HarnessKind string
type MessageRole string
type MessageStatus string
type MessageDelivery string
type MessagePartType string
type TextFormat string
type HarnessRefStatus string
type RunStatus string
type ApprovalStatus string
type ApprovalKind string
type RunItemStatus string
type RunItemType string
type DiagnosticSeverity string
type DiagnosticSource string
type ChatCommandKind string
type GoalCommandAction string
type ModelCommandAction string
type ReasoningEffort string
type ChatCommandResultAction string

const (
	SchemaVersion = 1

	HarnessCodex HarnessKind = "codex"

	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
	RoleSystem    MessageRole = "system"
	RoleDeveloper MessageRole = "developer"
	RoleTool      MessageRole = "tool"
	RoleCommand   MessageRole = "command"

	MessageStatusPending   MessageStatus = "pending"
	MessageStatusStreaming MessageStatus = "streaming"
	MessageStatusComplete  MessageStatus = "complete"
	MessageStatusCancelled MessageStatus = "cancelled"
	MessageStatusError     MessageStatus = "error"

	MessageDeliveryNormal   MessageDelivery = "normal"
	MessageDeliveryQueued   MessageDelivery = "queued"
	MessageDeliverySteering MessageDelivery = "steering"

	MessagePartText MessagePartType = "text"

	TextFormatPlain    TextFormat = "plain"
	TextFormatMarkdown TextFormat = "markdown"

	RunStatusQueued    RunStatus = "queued"
	RunStatusRunning   RunStatus = "running"
	RunStatusCompleted RunStatus = "completed"
	RunStatusCancelled RunStatus = "cancelled"
	RunStatusFailed    RunStatus = "failed"

	HarnessRefLinked      HarnessRefStatus = "linked"
	HarnessRefMissing     HarnessRefStatus = "missing"
	HarnessRefStale       HarnessRefStatus = "stale"
	HarnessRefUnsupported HarnessRefStatus = "unsupported"

	ApprovalStatusPending   ApprovalStatus = "pending"
	ApprovalStatusApproved  ApprovalStatus = "approved"
	ApprovalStatusDenied    ApprovalStatus = "denied"
	ApprovalStatusAnswered  ApprovalStatus = "answered"
	ApprovalStatusCancelled ApprovalStatus = "cancelled"

	ApprovalKindCommand    ApprovalKind = "command"
	ApprovalKindFileChange ApprovalKind = "file_change"
	ApprovalKindPermission ApprovalKind = "permission"
	ApprovalKindStructured ApprovalKind = "structured_input"
	ApprovalKindUserInput  ApprovalKind = "user_input"

	RunItemStatusPending   RunItemStatus = "pending"
	RunItemStatusRunning   RunItemStatus = "running"
	RunItemStatusCompleted RunItemStatus = "completed"
	RunItemStatusFailed    RunItemStatus = "failed"
	RunItemStatusCancelled RunItemStatus = "cancelled"

	RunItemTypeAgentMessage        RunItemType = "agent_message"
	RunItemTypePlan                RunItemType = "plan"
	RunItemTypeReasoning           RunItemType = "reasoning"
	RunItemTypeCommandExecution    RunItemType = "command_execution"
	RunItemTypeFileChange          RunItemType = "file_change"
	RunItemTypeMCPToolCall         RunItemType = "mcp_tool_call"
	RunItemTypeDynamicToolCall     RunItemType = "dynamic_tool_call"
	RunItemTypeCollabAgentToolCall RunItemType = "collab_agent_tool_call"
	RunItemTypeWebSearch           RunItemType = "web_search"
	RunItemTypeImageView           RunItemType = "image_view"
	RunItemTypeImageGeneration     RunItemType = "image_generation"
	RunItemTypeTerminalInteraction RunItemType = "terminal_interaction"
	RunItemTypeDiff                RunItemType = "diff"
	RunItemTypeNotice              RunItemType = "notice"
	RunItemTypeApprovalReview      RunItemType = "approval_review"
	RunItemTypeHook                RunItemType = "hook"
	RunItemTypeStructuredInput     RunItemType = "structured_input"

	DiagnosticSeverityInfo     DiagnosticSeverity = "info"
	DiagnosticSeverityWarning  DiagnosticSeverity = "warning"
	DiagnosticSeverityError    DiagnosticSeverity = "error"
	DiagnosticSeverityCritical DiagnosticSeverity = "critical"

	DiagnosticSourceBackend     DiagnosticSource = "backend"
	DiagnosticSourceEventStream DiagnosticSource = "event_stream"
	DiagnosticSourceChat        DiagnosticSource = "chat"
	DiagnosticSourceWorkspace   DiagnosticSource = "workspace"
	DiagnosticSourceProvider    DiagnosticSource = "provider"

	ChatCommandGoal  ChatCommandKind = "goal"
	ChatCommandModel ChatCommandKind = "model"

	GoalCommandShow   GoalCommandAction = "show"
	GoalCommandSet    GoalCommandAction = "set"
	GoalCommandClear  GoalCommandAction = "clear"
	GoalCommandPause  GoalCommandAction = "pause"
	GoalCommandResume GoalCommandAction = "resume"

	ModelCommandShowPicker ModelCommandAction = "show_picker"
	ModelCommandSet        ModelCommandAction = "set"
	ModelCommandSetEffort  ModelCommandAction = "set_reasoning_effort"

	ReasoningEffortNone    ReasoningEffort = "none"
	ReasoningEffortMinimal ReasoningEffort = "minimal"
	ReasoningEffortLow     ReasoningEffort = "low"
	ReasoningEffortMedium  ReasoningEffort = "medium"
	ReasoningEffortHigh    ReasoningEffort = "high"
	ReasoningEffortXHigh   ReasoningEffort = "xhigh"

	ChatCommandResultDisplay     ChatCommandResultAction = "display"
	ChatCommandResultModelPicker ChatCommandResultAction = "model_picker"
)

type ContractValueSet struct {
	Name   string
	Values []string
}

var (
	harnessKindValues = []HarnessKind{HarnessCodex}
	messageRoleValues = []MessageRole{
		RoleUser,
		RoleAssistant,
		RoleSystem,
		RoleDeveloper,
		RoleTool,
		RoleCommand,
	}
	messageStatusValues = []MessageStatus{
		MessageStatusPending,
		MessageStatusStreaming,
		MessageStatusComplete,
		MessageStatusCancelled,
		MessageStatusError,
	}
	messageDeliveryValues = []MessageDelivery{
		MessageDeliveryNormal,
		MessageDeliveryQueued,
		MessageDeliverySteering,
	}
	messagePartTypeValues = []MessagePartType{MessagePartText}
	textFormatValues      = []TextFormat{TextFormatPlain, TextFormatMarkdown}
	runStatusValues       = []RunStatus{
		RunStatusQueued,
		RunStatusRunning,
		RunStatusCompleted,
		RunStatusCancelled,
		RunStatusFailed,
	}
	harnessRefStatusValues = []HarnessRefStatus{
		HarnessRefLinked,
		HarnessRefMissing,
		HarnessRefStale,
		HarnessRefUnsupported,
	}
	approvalStatusValues = []ApprovalStatus{
		ApprovalStatusPending,
		ApprovalStatusApproved,
		ApprovalStatusDenied,
		ApprovalStatusAnswered,
		ApprovalStatusCancelled,
	}
	approvalKindValues = []ApprovalKind{
		ApprovalKindCommand,
		ApprovalKindFileChange,
		ApprovalKindPermission,
		ApprovalKindStructured,
		ApprovalKindUserInput,
	}
	runItemStatusValues = []RunItemStatus{
		RunItemStatusPending,
		RunItemStatusRunning,
		RunItemStatusCompleted,
		RunItemStatusFailed,
		RunItemStatusCancelled,
	}
	runItemTypeValues = []RunItemType{
		RunItemTypeAgentMessage,
		RunItemTypePlan,
		RunItemTypeReasoning,
		RunItemTypeCommandExecution,
		RunItemTypeFileChange,
		RunItemTypeMCPToolCall,
		RunItemTypeDynamicToolCall,
		RunItemTypeCollabAgentToolCall,
		RunItemTypeWebSearch,
		RunItemTypeImageView,
		RunItemTypeImageGeneration,
		RunItemTypeTerminalInteraction,
		RunItemTypeDiff,
		RunItemTypeNotice,
		RunItemTypeApprovalReview,
		RunItemTypeHook,
		RunItemTypeStructuredInput,
	}
	diagnosticSeverityValues = []DiagnosticSeverity{
		DiagnosticSeverityInfo,
		DiagnosticSeverityWarning,
		DiagnosticSeverityError,
		DiagnosticSeverityCritical,
	}
	diagnosticSourceValues = []DiagnosticSource{
		DiagnosticSourceBackend,
		DiagnosticSourceEventStream,
		DiagnosticSourceChat,
		DiagnosticSourceWorkspace,
		DiagnosticSourceProvider,
	}
	chatCommandKindValues = []ChatCommandKind{
		ChatCommandGoal,
		ChatCommandModel,
	}
	goalCommandActionValues = []GoalCommandAction{
		GoalCommandShow,
		GoalCommandSet,
		GoalCommandClear,
		GoalCommandPause,
		GoalCommandResume,
	}
	modelCommandActionValues = []ModelCommandAction{
		ModelCommandShowPicker,
		ModelCommandSet,
		ModelCommandSetEffort,
	}
	reasoningEffortValues = []ReasoningEffort{
		ReasoningEffortNone,
		ReasoningEffortMinimal,
		ReasoningEffortLow,
		ReasoningEffortMedium,
		ReasoningEffortHigh,
		ReasoningEffortXHigh,
	}
	chatCommandResultActionValues = []ChatCommandResultAction{
		ChatCommandResultDisplay,
		ChatCommandResultModelPicker,
	}
	structuredInputModeValues = []StructuredInputMode{
		StructuredInputModeForm,
		StructuredInputModeURL,
	}
)

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "HarnessKind", Values: stringValues(harnessKindValues)},
		{Name: "MessageRole", Values: stringValues(messageRoleValues)},
		{Name: "MessageStatus", Values: stringValues(messageStatusValues)},
		{Name: "MessageDelivery", Values: stringValues(messageDeliveryValues)},
		{Name: "MessagePartType", Values: stringValues(messagePartTypeValues)},
		{Name: "TextFormat", Values: stringValues(textFormatValues)},
		{Name: "HarnessRefStatus", Values: stringValues(harnessRefStatusValues)},
		{Name: "RunStatus", Values: stringValues(runStatusValues)},
		{Name: "ApprovalStatus", Values: stringValues(approvalStatusValues)},
		{Name: "ApprovalKind", Values: stringValues(approvalKindValues)},
		{Name: "RunItemStatus", Values: stringValues(runItemStatusValues)},
		{Name: "RunItemType", Values: stringValues(runItemTypeValues)},
		{Name: "DiagnosticSeverity", Values: stringValues(diagnosticSeverityValues)},
		{Name: "DiagnosticSource", Values: stringValues(diagnosticSourceValues)},
		{Name: "StructuredInputMode", Values: stringValues(structuredInputModeValues)},
		{Name: "ChatCommandKind", Values: stringValues(chatCommandKindValues)},
		{Name: "GoalCommandAction", Values: stringValues(goalCommandActionValues)},
		{Name: "ModelCommandAction", Values: stringValues(modelCommandActionValues)},
		{Name: "ReasoningEffort", Values: stringValues(reasoningEffortValues)},
		{Name: "ChatCommandResultAction", Values: stringValues(chatCommandResultActionValues)},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

type Conversation struct {
	SchemaVersion int                `json:"schemaVersion"`
	ID            string             `json:"id"`
	WorkspaceID   string             `json:"workspaceId"`
	Title         string             `json:"title"`
	CreatedAt     string             `json:"createdAt"`
	UpdatedAt     string             `json:"updatedAt"`
	ArchivedAt    string             `json:"archivedAt"`
	CodexSettings *ChatCodexSettings `json:"codexSettings"`
	HarnessRefs   []HarnessThreadRef `json:"harnessRefs"`
}

type ChatCodexSettings struct {
	Model           string           `json:"model"`
	ReasoningEffort *ReasoningEffort `json:"reasoningEffort"`
}

type ChatMessage struct {
	SchemaVersion  int             `json:"schemaVersion"`
	ID             string          `json:"id"`
	ConversationID string          `json:"conversationId"`
	RunID          string          `json:"runId"`
	Role           MessageRole     `json:"role"`
	Delivery       MessageDelivery `json:"delivery"`
	Ordinal        int             `json:"ordinal"`
	CreatedAt      string          `json:"createdAt"`
	UpdatedAt      string          `json:"updatedAt"`
	Status         MessageStatus   `json:"status"`
	Parts          []MessagePart   `json:"parts"`
}

type MessagePart struct {
	ID     string          `json:"id"`
	Type   MessagePartType `json:"type"`
	Text   string          `json:"text"`
	Format TextFormat      `json:"format"`
}

type HarnessThreadRef struct {
	Harness        HarnessKind      `json:"harness"`
	ThreadID       string           `json:"threadId"`
	SessionID      string           `json:"sessionId"`
	LastTurnID     string           `json:"lastTurnId"`
	Status         HarnessRefStatus `json:"status"`
	CreatedAt      string           `json:"createdAt"`
	LastResumedAt  string           `json:"lastResumedAt"`
	UnavailableMsg string           `json:"unavailableMessage"`
}

type Run struct {
	SchemaVersion      int              `json:"schemaVersion"`
	ID                 string           `json:"id"`
	WorkspaceID        string           `json:"workspaceId"`
	ConversationID     string           `json:"conversationId"`
	TriggerMessageID   string           `json:"triggerMessageId"`
	AssistantMessageID string           `json:"assistantMessageId"`
	Harness            HarnessKind      `json:"harness"`
	Status             RunStatus        `json:"status"`
	StartedAt          string           `json:"startedAt"`
	CompletedAt        string           `json:"completedAt"`
	PromptSummary      string           `json:"promptSummary"`
	Error              string           `json:"error"`
	PendingApproval    *ApprovalRequest `json:"pendingApproval"`
}

type ApprovalRequest struct {
	ID              string                  `json:"id"`
	RunID           string                  `json:"runId"`
	RunItemID       string                  `json:"runItemId"`
	ProviderItemID  string                  `json:"providerItemId"`
	Kind            ApprovalKind            `json:"kind"`
	Title           string                  `json:"title"`
	Body            string                  `json:"body"`
	Command         string                  `json:"command"`
	FilePath        string                  `json:"filePath"`
	Permission      string                  `json:"permission"`
	Question        string                  `json:"question"`
	Options         []string                `json:"options"`
	Questions       []ApprovalQuestion      `json:"questions"`
	StructuredInput *StructuredInputRequest `json:"structuredInput"`
	Status          ApprovalStatus          `json:"status"`
	CreatedAt       string                  `json:"createdAt"`
	ResolvedAt      string                  `json:"resolvedAt"`
	Response        string                  `json:"response"`
	Approved        bool                    `json:"approved"`
}

type StructuredInputMode string

const (
	StructuredInputModeForm StructuredInputMode = "form"
	StructuredInputModeURL  StructuredInputMode = "url"
)

type StructuredInputRequest struct {
	ProviderRequestID string              `json:"providerRequestId"`
	ThreadID          string              `json:"threadId"`
	TurnID            string              `json:"turnId"`
	ServerName        string              `json:"serverName"`
	Mode              StructuredInputMode `json:"mode"`
	Message           string              `json:"message"`
	Schema            json.RawMessage     `json:"schema"`
	URL               string              `json:"url"`
	ElicitationID     string              `json:"elicitationId"`
	Meta              json.RawMessage     `json:"meta"`
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
	QuestionID string           `json:"questionId"`
	Answers    []string         `json:"answers"`
	Value      *json.RawMessage `json:"value"`
}

type TraceEvent struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	RunID         string `json:"runId"`
	Type          string `json:"type"`
	CreatedAt     string `json:"createdAt"`
	Message       string `json:"message"`
}

type Diagnostic struct {
	SchemaVersion  int                `json:"schemaVersion"`
	ID             string             `json:"id"`
	Source         DiagnosticSource   `json:"source"`
	Severity       DiagnosticSeverity `json:"severity"`
	Code           string             `json:"code"`
	Message        string             `json:"message"`
	WorkspaceID    string             `json:"workspaceId"`
	ConversationID string             `json:"conversationId"`
	RunID          string             `json:"runId"`
	OccurredAt     string             `json:"occurredAt"`
	Context        map[string]string  `json:"context"`
}

func (diagnostic Diagnostic) MarshalJSON() ([]byte, error) {
	type diagnosticAlias Diagnostic
	if diagnostic.Context == nil {
		diagnostic.Context = map[string]string{}
	}
	return json.Marshal(diagnosticAlias(diagnostic))
}

type RunItem struct {
	SchemaVersion  int             `json:"schemaVersion"`
	ID             string          `json:"id"`
	WorkspaceID    string          `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	RunID          string          `json:"runId"`
	ProviderItemID string          `json:"providerItemId"`
	Type           RunItemType     `json:"type"`
	Status         RunItemStatus   `json:"status"`
	CreatedAt      string          `json:"createdAt"`
	StartedAt      string          `json:"startedAt"`
	CompletedAt    string          `json:"completedAt"`
	Title          string          `json:"title"`
	Summary        string          `json:"summary"`
	Command        string          `json:"command"`
	Cwd            string          `json:"cwd"`
	ExitCode       int             `json:"exitCode"`
	DurationMs     int             `json:"durationMs"`
	FilePaths      []string        `json:"filePaths"`
	PatchStatus    string          `json:"patchStatus"`
	ServerName     string          `json:"serverName"`
	ToolName       string          `json:"toolName"`
	Progress       string          `json:"progress"`
	Result         string          `json:"result"`
	Error          string          `json:"error"`
	NoticeKind     string          `json:"noticeKind"`
	NoticeMessage  string          `json:"noticeMessage"`
	DiffSummary    string          `json:"diffSummary"`
	Namespace      string          `json:"namespace"`
	ProcessID      string          `json:"processId"`
	RequestID      string          `json:"requestId"`
	ReviewID       string          `json:"reviewId"`
	Details        json.RawMessage `json:"details"`
	HiddenText     string          `json:"hiddenText"`
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

type TranscriptTurn struct {
	Run              Run           `json:"run"`
	TriggerMessage   ChatMessage   `json:"triggerMessage"`
	AssistantMessage *ChatMessage  `json:"assistantMessage"`
	SteeringMessages []ChatMessage `json:"steeringMessages"`
}

type ConversationListItem struct {
	Conversation Conversation `json:"conversation"`
	MessageCount int          `json:"messageCount"`
	ActiveRunID  string       `json:"activeRunId"`
}

type CorruptStateFinding struct {
	Code           string             `json:"code"`
	Severity       DiagnosticSeverity `json:"severity"`
	Path           string             `json:"path"`
	WorkspaceID    string             `json:"workspaceId"`
	ConversationID string             `json:"conversationId"`
	RunID          string             `json:"runId"`
	RecordKind     string             `json:"recordKind"`
	Error          string             `json:"error"`
	RecoveryAction string             `json:"recoveryAction"`
}

type CorruptionCount struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

type CorruptionSummary struct {
	HasCorruption bool              `json:"hasCorruption"`
	Total         int               `json:"total"`
	ByKind        []CorruptionCount `json:"byKind"`
	BySeverity    []CorruptionCount `json:"bySeverity"`
}

type ConversationListResult struct {
	Conversations []ConversationListItem `json:"conversations"`
	Corruption    CorruptionSummary      `json:"corruption"`
	Diagnostics   []Diagnostic           `json:"diagnostics"`
}

type ChatCommand struct {
	Kind  ChatCommandKind `json:"kind"`
	Raw   string          `json:"raw"`
	Args  string          `json:"args"`
	Goal  *GoalCommand    `json:"goal"`
	Model *ModelCommand   `json:"model"`
}

type GoalCommand struct {
	Action    GoalCommandAction `json:"action"`
	Objective string            `json:"objective"`
	Status    string            `json:"status"`
}

type ModelCommand struct {
	Action          ModelCommandAction `json:"action"`
	ModelID         string             `json:"modelId"`
	ReasoningEffort *ReasoningEffort   `json:"reasoningEffort"`
}

type ChatGoalState struct {
	ThreadID  string `json:"threadId"`
	Objective string `json:"objective"`
	Status    string `json:"status"`
}

type ChatModelOption struct {
	ID                        string                      `json:"id"`
	Model                     string                      `json:"model"`
	DisplayName               string                      `json:"displayName"`
	Description               string                      `json:"description"`
	Hidden                    bool                        `json:"hidden"`
	IsDefault                 bool                        `json:"isDefault"`
	DefaultReasoningEffort    ReasoningEffort             `json:"defaultReasoningEffort"`
	SupportedReasoningEfforts []ChatReasoningEffortOption `json:"supportedReasoningEfforts"`
}

type ChatReasoningEffortOption struct {
	Effort      ReasoningEffort `json:"effort"`
	DisplayName string          `json:"displayName"`
	Description string          `json:"description"`
	IsDefault   bool            `json:"isDefault"`
}

type ChatCommandCapability struct {
	Kind              ChatCommandKind `json:"kind"`
	Name              string          `json:"name"`
	Usage             string          `json:"usage"`
	Description       string          `json:"description"`
	Available         bool            `json:"available"`
	UnavailableReason string          `json:"unavailableReason"`
}

type ChatCommandListResult struct {
	Commands []ChatCommandCapability `json:"commands"`
}

type ChatCommandResult struct {
	Action                  ChatCommandResultAction     `json:"action"`
	Kind                    ChatCommandKind             `json:"kind"`
	Raw                     string                      `json:"raw"`
	Title                   string                      `json:"title"`
	Message                 string                      `json:"message"`
	Goal                    *ChatGoalState              `json:"goal"`
	Models                  []ChatModelOption           `json:"models"`
	SelectedModel           string                      `json:"selectedModel"`
	ReasoningEfforts        []ChatReasoningEffortOption `json:"reasoningEfforts"`
	SelectedReasoningEffort *ReasoningEffort            `json:"selectedReasoningEffort"`
}

type ChatCommandExecuteResult struct {
	Conversation Conversation      `json:"conversation"`
	Message      *ChatMessage      `json:"message"`
	Page         MessagePage       `json:"page"`
	Result       ChatCommandResult `json:"result"`
}

type MessagePage struct {
	Conversation       Conversation     `json:"conversation"`
	Messages           []ChatMessage    `json:"messages"`
	RunItems           []RunItem        `json:"runItems"`
	RunItemOutputs     []RunItemOutput  `json:"runItemOutputs"`
	Queue              QueueState       `json:"queue"`
	Transcript         []TranscriptTurn `json:"transcript"`
	HasMoreOlder       bool             `json:"hasMoreOlder"`
	OlderBeforeOrdinal int              `json:"olderBeforeOrdinal"`
}

type RunActivityPage struct {
	RunID  string          `json:"runId"`
	Items  []RunItem       `json:"items"`
	Output []RunItemOutput `json:"output"`
}

type RunItemOutputPage struct {
	RunID       string          `json:"runId"`
	RunItemID   string          `json:"runItemId"`
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

func (result ChatCommandListResult) MarshalJSON() ([]byte, error) {
	type resultAlias ChatCommandListResult
	if result.Commands == nil {
		result.Commands = []ChatCommandCapability{}
	}
	return json.Marshal(resultAlias(result))
}

func (result ChatCommandResult) MarshalJSON() ([]byte, error) {
	type resultAlias ChatCommandResult
	if result.Models == nil {
		result.Models = []ChatModelOption{}
	}
	if result.ReasoningEfforts == nil {
		result.ReasoningEfforts = []ChatReasoningEffortOption{}
	}
	return json.Marshal(resultAlias(result))
}

func (model ChatModelOption) MarshalJSON() ([]byte, error) {
	type modelAlias ChatModelOption
	if model.SupportedReasoningEfforts == nil {
		model.SupportedReasoningEfforts = []ChatReasoningEffortOption{}
	}
	return json.Marshal(modelAlias(model))
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

func (turn TranscriptTurn) MarshalJSON() ([]byte, error) {
	type turnAlias TranscriptTurn
	if turn.SteeringMessages == nil {
		turn.SteeringMessages = []ChatMessage{}
	}
	return json.Marshal(turnAlias(turn))
}

func (summary CorruptionSummary) MarshalJSON() ([]byte, error) {
	type summaryAlias CorruptionSummary
	if summary.ByKind == nil {
		summary.ByKind = []CorruptionCount{}
	}
	if summary.BySeverity == nil {
		summary.BySeverity = []CorruptionCount{}
	}
	return json.Marshal(summaryAlias(summary))
}

func (result ConversationListResult) MarshalJSON() ([]byte, error) {
	type resultAlias ConversationListResult
	if result.Conversations == nil {
		result.Conversations = []ConversationListItem{}
	}
	if result.Diagnostics == nil {
		result.Diagnostics = []Diagnostic{}
	}
	return json.Marshal(resultAlias(result))
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
	if page.Transcript == nil {
		page.Transcript = []TranscriptTurn{}
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

func (page RunItemOutputPage) MarshalJSON() ([]byte, error) {
	type pageAlias RunItemOutputPage
	if page.Output == nil {
		page.Output = []RunItemOutput{}
	}
	return json.Marshal(pageAlias(page))
}
