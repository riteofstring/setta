package frontendbindings

import (
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/detachedruns"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
)

type EngineType agentruns.EngineType

type EngineConfigDefaults agentruns.EngineConfigDefaults

type EngineRuntimeSupport agentruns.EngineRuntimeSupport

type EngineConfig agentruns.EngineConfig

type AgentProfile agentprofiles.Profile

type AgentProfileList []AgentProfile

type TranscriptionTransportMode transcriptionprofiles.TransportMode

type TranscriptionProfile transcriptionprofiles.Profile

type TranscriptionProfileList []TranscriptionProfile

type AgentRunStatus agentruns.RunStatus

type RunEvent agentruns.RunEvent

type AgentRun agentruns.Run

type AgentRunList []AgentRun

type EngineConfigList []EngineConfig

type DetachedRunStatus detachedruns.Status

type DetachedRun detachedruns.Run

type StreamingEventType = realtime.StreamingEventType

type MessageTextDelta = realtime.MessageTextDelta

type MessageThinkingDelta = realtime.MessageThinkingDelta

type MessageContentDelta interface{}

type MessageStartEvent = realtime.MessageStartEvent

type MessageDeltaEvent = realtime.MessageDeltaEvent

type ToolCallDeltaEvent = realtime.ToolCallDeltaEvent

type ToolResultEvent = realtime.ToolResultEvent

type ToolArgumentPreviewDeltaEvent = realtime.ToolArgumentPreviewDeltaEvent

type MessageStopEvent = realtime.MessageStopEvent

type MessageFinalizedEvent = realtime.MessageFinalizedEvent

type LLMStreamingResponseChunk interface{}

type LLMStreamingResponse = realtime.LLMStreamingResponseContent
