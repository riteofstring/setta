package frontendbindings

type AIRuntimeSupport struct{}

type EngineConfigDefaults struct {
	Thinking *bool `json:"thinking,omitempty"`
}

type EngineConfig struct {
	ID                    string               `json:"id"`
	Name                  string               `json:"name"`
	EngineType            string               `json:"engineType"`
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

const aiRuntimeFrontendSupportRawTS = `
export const EngineTypeEnum = {
  setta_llm: "setta_llm",
  external_agent: "external_agent",
} as const;
export type EngineType = ObjectValues<typeof EngineTypeEnum>;

export const TranscriptionTransportModeEnum = {
  auto: "auto",
  file: "file",
  realtime: "realtime",
} as const;
export type TranscriptionTransportMode = ObjectValues<
  typeof TranscriptionTransportModeEnum
>;

export const AgentRunStatusEnum = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;
export type AgentRunStatus = ObjectValues<typeof AgentRunStatusEnum>;

export type AgentRunList = Array<AgentRun>;

export const StreamingEventTypeEnum = {
  MESSAGE_START: "message_start",
  DELTA: "delta",
  TOOL_CALL_DELTA: "tool_call_delta",
  TOOL_ARGUMENT_PREVIEW_DELTA: "tool_argument_preview_delta",
  TOOL_RESULT: "tool_result",
  MESSAGE_STOP: "message_stop",
  MESSAGE_FINALIZED: "message_finalized",
} as const;
export type StreamingEventType = ObjectValues<typeof StreamingEventTypeEnum>;

export type MessageTextDelta = {
  type: "text_delta";
  index: number;
  text: string;
};

export type MessageThinkingDelta = {
  type: "thinking_delta";
  index: number;
  thinking: string;
  summary?: string | null;
  signature?: string | null;
};

export type MessageContentDelta = MessageTextDelta | MessageThinkingDelta;

export type MessageStartEvent = {
  type: typeof StreamingEventTypeEnum.MESSAGE_START;
  message: BaseChatMessageUnion;
};

export type MessageDeltaEvent = {
  type: typeof StreamingEventTypeEnum.DELTA;
  message_id: string;
  content?: Array<MessageContentDelta> | null;
};

export type ToolCallDeltaEvent = {
  type: typeof StreamingEventTypeEnum.TOOL_CALL_DELTA;
  message_id: string;
  tool_call_id: string;
  arguments_delta: string;
  tool_name?: string | null;
};

export type ToolResultEvent = {
  type: typeof StreamingEventTypeEnum.TOOL_RESULT;
  result: ToolChatMessage;
};

export type ToolArgumentPreviewDeltaEvent = {
  type: typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA;
  message_id: string;
  tool_call_id: string;
  tool_name: string;
  arguments_delta: string;
  preview_kind: string;
  target_ids_by_type: Record<string, Array<string>>;
  preview_value_delta: string;
};

export type MessageStopEvent = {
  type: typeof StreamingEventTypeEnum.MESSAGE_STOP;
  message_id: string;
};

export type MessageFinalizedEvent = {
  type: typeof StreamingEventTypeEnum.MESSAGE_FINALIZED;
  message: BaseChatMessageUnion;
};

export type LLMStreamingResponseChunk =
  | MessageStartEvent
  | MessageDeltaEvent
  | ToolCallDeltaEvent
  | ToolResultEvent
  | ToolArgumentPreviewDeltaEvent
  | MessageStopEvent
  | MessageFinalizedEvent;

export type LLMStreamingResponse = {
  chatId: string;
  chunk: LLMStreamingResponseChunk;
  sectionId?: string | null;
  projectConfigId?: string | null;
};
`
