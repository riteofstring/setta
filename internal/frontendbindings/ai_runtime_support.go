package frontendbindings

type AIRuntimeSupport struct{}

const aiRuntimeFrontendSupportRawTS = `
export const EngineTypeEnum = {
  setta_llm: "setta_llm",
  external_agent: "external_agent",
} as const;
export type EngineType = ObjectValues<typeof EngineTypeEnum>;

export type EngineConfigDefaults = {
  thinking?: boolean | null;
};
export function createEngineConfigDefaults(
  options: Partial<EngineConfigDefaults> = {},
): EngineConfigDefaults {
  return mergeGeneratedOptions(
    {
      thinking: null,
    },
    options,
  );
}

export type EngineConfig = {
  id: string;
  name: string;
  engineType: EngineType;
  settaLlmConfigId?: string | null;
  externalAgentConfigId?: string | null;
  defaults: EngineConfigDefaults;
};
export function createEngineConfig(
  options: Partial<EngineConfig> = {},
): EngineConfig {
  const defaults = createEngineConfigDefaults();
  return {
    ...mergeGeneratedOptions(
      {
        id: "",
        name: "",
        engineType: EngineTypeEnum.setta_llm,
        settaLlmConfigId: null,
        externalAgentConfigId: null,
        defaults,
      },
      options,
    ),
    defaults: mergeGeneratedOptions(defaults, options.defaults ?? {}),
  };
}

export type AgentProfile = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  enableBackgroundSummaryFill: boolean;
  enableLlmChatTitles: boolean;
  engineConfigId?: string | null;
  toolAllowlist: Array<string>;
  memoryScope?: string | null;
};

export const TranscriptionTransportModeEnum = {
  auto: "auto",
  file: "file",
  realtime: "realtime",
} as const;
export type TranscriptionTransportMode = ObjectValues<
  typeof TranscriptionTransportModeEnum
>;

export type TranscriptionProfile = {
  id: string;
  name: string;
  transcriptionLlmConfigId: string;
  transportMode: TranscriptionTransportMode;
  chunkMs: number;
  supportsRealtimeTranscription: boolean;
  language?: string | null;
};

export const AgentRunStatusEnum = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;
export type AgentRunStatus = ObjectValues<typeof AgentRunStatusEnum>;

export type RunEvent = {
  id: string;
  timestamp: string;
  type: string;
  payload?: Record<string, unknown>;
};
export function createRunEvent(options: Partial<RunEvent> = {}): RunEvent {
  return mergeGeneratedOptions(
    {
      id: "",
      timestamp: "",
      type: "",
      payload: {},
    },
    options,
  );
}

export type AgentRun = {
  id: string;
  profileId?: string | null;
  status: AgentRunStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
  toolCalls: Array<Record<string, unknown>>;
  cost?: number | null;
  events: Array<RunEvent>;
};
export function createAgentRun(options: Partial<AgentRun> = {}): AgentRun {
  return mergeGeneratedOptions(
    {
      id: "",
      profileId: null,
      status: AgentRunStatusEnum.queued,
      startedAt: null,
      finishedAt: null,
      inputs: null,
      outputs: null,
      toolCalls: [],
      cost: null,
      events: [],
    },
    options,
  );
}

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
