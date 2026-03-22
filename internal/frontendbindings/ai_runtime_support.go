package frontendbindings

import "setta/internal/realtime"

type EngineType string

const (
	EngineTypeSettaLLM      EngineType = "setta_llm"
	EngineTypeExternalAgent EngineType = "external_agent"
)

type EngineConfigDefaults struct {
	Thinking *bool `json:"thinking,omitempty"`
}

type EngineRuntimeSupport struct {
	Thinking bool `json:"thinking"`
}

type EngineConfig struct {
	ID                    string                `json:"id"`
	Name                  string                `json:"name"`
	EngineType            EngineType            `json:"engineType"`
	SettaLlmConfigID      *string               `json:"settaLlmConfigId,omitempty"`
	ExternalAgentConfigID *string               `json:"externalAgentConfigId,omitempty"`
	Defaults              EngineConfigDefaults  `json:"defaults"`
	RuntimeSupport        *EngineRuntimeSupport `json:"runtimeSupport,omitempty"`
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

type DetachedRunStatus string

const (
	DetachedRunStatusQueued   DetachedRunStatus = "queued"
	DetachedRunStatusRunning  DetachedRunStatus = "running"
	DetachedRunStatusExited   DetachedRunStatus = "exited"
	DetachedRunStatusFailed   DetachedRunStatus = "failed"
	DetachedRunStatusCanceled DetachedRunStatus = "canceled"
	DetachedRunStatusLost     DetachedRunStatus = "lost"
)

type DetachedRun struct {
	RunID           string            `json:"runId"`
	Status          DetachedRunStatus `json:"status"`
	CreatedAtMS     int64             `json:"createdAtMs"`
	StartedAtMS     *int64            `json:"startedAtMs,omitempty"`
	ExitedAtMS      *int64            `json:"exitedAtMs,omitempty"`
	ExitCode        *int              `json:"exitCode,omitempty"`
	PID             *int              `json:"pid,omitempty"`
	Command         string            `json:"command"`
	SnapshotPath    string            `json:"snapshotPath"`
	ProjectConfigID string            `json:"projectConfigId"`
	EntrySectionID  *string           `json:"entrySectionId,omitempty"`
	Tags            map[string]string `json:"tags"`
}

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
