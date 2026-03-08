package frontendbindings

type EngineType string

const (
	EngineTypeSettaLLM      EngineType = "setta_llm"
	EngineTypeExternalAgent EngineType = "external_agent"
)

type EngineConfigDefaults struct {
	Thinking *bool `json:"thinking,omitempty"`
}

type EngineConfig struct {
	ID                    string               `json:"id"`
	Name                  string               `json:"name"`
	EngineType            EngineType           `json:"engineType"`
	SettaLlmConfigID      *string              `json:"settaLlmConfigId,omitempty"`
	ExternalAgentConfigID *string              `json:"externalAgentConfigId,omitempty"`
	Defaults              EngineConfigDefaults `json:"defaults"`
}

type AgentProfile struct {
	ID                          string   `json:"id"`
	Name                        string   `json:"name"`
	Description                 string   `json:"description"`
	SystemPrompt                string   `json:"systemPrompt"`
	EnableBackgroundSummaryFill bool     `json:"enableBackgroundSummaryFill"`
	EnableLlmChatTitles         bool     `json:"enableLlmChatTitles"`
	EngineConfigID              *string  `json:"engineConfigId,omitempty"`
	ToolAllowlist               []string `json:"toolAllowlist"`
	MemoryScope                 *string  `json:"memoryScope,omitempty"`
}

type TranscriptionTransportMode string

const (
	TranscriptionTransportModeAuto     TranscriptionTransportMode = "auto"
	TranscriptionTransportModeFile     TranscriptionTransportMode = "file"
	TranscriptionTransportModeRealtime TranscriptionTransportMode = "realtime"
)

type TranscriptionProfile struct {
	ID                            string                     `json:"id"`
	Name                          string                     `json:"name"`
	TranscriptionLlmConfigID      string                     `json:"transcriptionLlmConfigId"`
	TransportMode                 TranscriptionTransportMode `json:"transportMode"`
	ChunkMS                       int                        `json:"chunkMs"`
	SupportsRealtimeTranscription bool                       `json:"supportsRealtimeTranscription"`
	Language                      *string                    `json:"language,omitempty"`
}

type AgentRunStatus string

const (
	AgentRunStatusQueued    AgentRunStatus = "queued"
	AgentRunStatusRunning   AgentRunStatus = "running"
	AgentRunStatusCompleted AgentRunStatus = "completed"
	AgentRunStatusFailed    AgentRunStatus = "failed"
	AgentRunStatusCancelled AgentRunStatus = "cancelled"
)

type RunEvent struct {
	ID        string         `json:"id"`
	Timestamp string         `json:"timestamp"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload,omitempty"`
}

type AgentRun struct {
	ID         string           `json:"id"`
	ProfileID  *string          `json:"profileId,omitempty"`
	Status     AgentRunStatus   `json:"status"`
	StartedAt  *string          `json:"startedAt,omitempty"`
	FinishedAt *string          `json:"finishedAt,omitempty"`
	Inputs     map[string]any   `json:"inputs,omitempty"`
	Outputs    map[string]any   `json:"outputs,omitempty"`
	ToolCalls  []map[string]any `json:"toolCalls"`
	Cost       *float64         `json:"cost,omitempty"`
	Events     []RunEvent       `json:"events"`
}

type AgentRunList []AgentRun

type StreamingEventType string

const (
	StreamingEventTypeMessageStart        StreamingEventType = "message_start"
	StreamingEventTypeDelta               StreamingEventType = "delta"
	StreamingEventTypeToolCallDelta       StreamingEventType = "tool_call_delta"
	StreamingEventTypeToolArgumentPreview StreamingEventType = "tool_argument_preview_delta"
	StreamingEventTypeToolResult          StreamingEventType = "tool_result"
	StreamingEventTypeMessageStop         StreamingEventType = "message_stop"
	StreamingEventTypeMessageFinalized    StreamingEventType = "message_finalized"
)

type MessageTextDelta struct {
	Type  string `json:"type"`
	Index int    `json:"index"`
	Text  string `json:"text"`
}

func (MessageTextDelta) isMessageContentDelta() {}

type MessageThinkingDelta struct {
	Type      string  `json:"type"`
	Index     int     `json:"index"`
	Thinking  string  `json:"thinking"`
	Summary   *string `json:"summary,omitempty"`
	Signature *string `json:"signature,omitempty"`
}

func (MessageThinkingDelta) isMessageContentDelta() {}

type MessageContentDelta interface {
	isMessageContentDelta()
}

type MessageStartEvent struct {
	Type    StreamingEventType   `json:"type"`
	Message BaseChatMessageUnion `json:"message"`
}

func (MessageStartEvent) isLLMStreamingResponseChunk() {}

type MessageDeltaEvent struct {
	Type      StreamingEventType    `json:"type"`
	MessageID string                `json:"message_id"`
	Content   []MessageContentDelta `json:"content,omitempty"`
}

func (MessageDeltaEvent) isLLMStreamingResponseChunk() {}

type ToolCallDeltaEvent struct {
	Type           StreamingEventType `json:"type"`
	MessageID      string             `json:"message_id"`
	ToolCallID     string             `json:"tool_call_id"`
	ArgumentsDelta string             `json:"arguments_delta"`
	ToolName       *string            `json:"tool_name,omitempty"`
}

func (ToolCallDeltaEvent) isLLMStreamingResponseChunk() {}

type ToolResultEvent struct {
	Type   StreamingEventType `json:"type"`
	Result ToolChatMessage    `json:"result"`
}

func (ToolResultEvent) isLLMStreamingResponseChunk() {}

type ToolArgumentPreviewDeltaEvent struct {
	Type              StreamingEventType  `json:"type"`
	MessageID         string              `json:"message_id"`
	ToolCallID        string              `json:"tool_call_id"`
	ToolName          string              `json:"tool_name"`
	ArgumentsDelta    string              `json:"arguments_delta"`
	PreviewKind       string              `json:"preview_kind"`
	TargetIDsByType   map[string][]string `json:"target_ids_by_type"`
	PreviewValueDelta string              `json:"preview_value_delta"`
}

func (ToolArgumentPreviewDeltaEvent) isLLMStreamingResponseChunk() {}

type MessageStopEvent struct {
	Type      StreamingEventType `json:"type"`
	MessageID string             `json:"message_id"`
}

func (MessageStopEvent) isLLMStreamingResponseChunk() {}

type MessageFinalizedEvent struct {
	Type    StreamingEventType   `json:"type"`
	Message BaseChatMessageUnion `json:"message"`
}

func (MessageFinalizedEvent) isLLMStreamingResponseChunk() {}

type LLMStreamingResponseChunk interface {
	isLLMStreamingResponseChunk()
}

type LLMStreamingResponse struct {
	ChatID          string                    `json:"chatId"`
	Chunk           LLMStreamingResponseChunk `json:"chunk"`
	SectionID       *string                   `json:"sectionId,omitempty"`
	ProjectConfigID *string                   `json:"projectConfigId,omitempty"`
}
