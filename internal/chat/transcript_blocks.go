package chat

import "encoding/json"

// TranscriptBlock is the Go-owned, generated contract for a single ordered
// transcript block. Chronology is owned by the backend: every visible run block
// receives the next run-local transcript ordinal when it is first created, and
// later updates mutate the existing block instead of allocating a new ordinal.
//
// The block kind is authoritative. Exactly one branch payload is populated for a
// given kind; the others are null. The renderer switches exhaustively on Kind
// and never infers transcript UI from raw run-item protocol.
type TranscriptBlockKind string
type TranscriptBlockStatus string
type ReasoningBlockMode string
type RunStatusBlockMode string

const (
	TranscriptBlockKindUserMessage   TranscriptBlockKind = "user_message"
	TranscriptBlockKindAssistantText TranscriptBlockKind = "assistant_text"
	TranscriptBlockKindReasoning     TranscriptBlockKind = "reasoning"
	TranscriptBlockKindActivityItem  TranscriptBlockKind = "activity_item"
	TranscriptBlockKindRunStatus     TranscriptBlockKind = "run_status"

	TranscriptBlockStatusStreaming TranscriptBlockStatus = "streaming"
	TranscriptBlockStatusComplete  TranscriptBlockStatus = "complete"
	TranscriptBlockStatusCancelled TranscriptBlockStatus = "cancelled"
	TranscriptBlockStatusFailed    TranscriptBlockStatus = "failed"

	ReasoningBlockModeThinking ReasoningBlockMode = "thinking"
	ReasoningBlockModeSummary  ReasoningBlockMode = "summary"

	RunStatusBlockModeWorking   RunStatusBlockMode = "working"
	RunStatusBlockModeCompleted RunStatusBlockMode = "completed"
	RunStatusBlockModeCancelled RunStatusBlockMode = "cancelled"
	RunStatusBlockModeFailed    RunStatusBlockMode = "failed"
)

var (
	transcriptBlockKindValues = []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindReasoning,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindRunStatus,
	}
	transcriptBlockStatusValues = []TranscriptBlockStatus{
		TranscriptBlockStatusStreaming,
		TranscriptBlockStatusComplete,
		TranscriptBlockStatusCancelled,
		TranscriptBlockStatusFailed,
	}
	reasoningBlockModeValues = []ReasoningBlockMode{
		ReasoningBlockModeThinking,
		ReasoningBlockModeSummary,
	}
	runStatusBlockModeValues = []RunStatusBlockMode{
		RunStatusBlockModeWorking,
		RunStatusBlockModeCompleted,
		RunStatusBlockModeCancelled,
		RunStatusBlockModeFailed,
	}
)

// TranscriptBlock is a first-class persisted record, not derived from renderer
// state. Blocks are stored per run and ordered by Ordinal.
type TranscriptBlock struct {
	SchemaVersion  int                 `json:"schemaVersion"`
	ID             string              `json:"id"`
	ConversationID string              `json:"conversationId"`
	RunID          string              `json:"runId"`
	Kind           TranscriptBlockKind `json:"kind"`
	Ordinal        int                 `json:"ordinal"`
	// RunAnchorOrdinal is the run's anchor in conversation order: the conversation
	// ordinal of the run's trigger message, stamped on every block of the run. The
	// renderer interleaves run-less standalone messages by comparing their
	// conversation ordinal to each run's anchor, and reads it from any block so a
	// page that starts mid-run (without the trigger user_message block) still
	// anchors the run correctly.
	RunAnchorOrdinal int                   `json:"runAnchorOrdinal"`
	Status           TranscriptBlockStatus `json:"status"`
	CreatedAt        string                `json:"createdAt"`
	UpdatedAt        string                `json:"updatedAt"`

	UserMessage   *TranscriptMessageProjection  `json:"userMessage"`
	AssistantText *AssistantTextBlockProjection `json:"assistantText"`
	Reasoning     *ReasoningBlockProjection     `json:"reasoning"`
	Activity      *ActivityItemBlockProjection  `json:"activity"`
	RunStatus     *RunStatusBlockProjection     `json:"runStatus"`
}

// TranscriptMessageProjection renders a user-side message block (normal trigger,
// steering, queued, command, or other system-visible user message).
type TranscriptMessageProjection struct {
	MessageID string          `json:"messageId"`
	Role      MessageRole     `json:"role"`
	Delivery  MessageDelivery `json:"delivery"`
	Status    MessageStatus   `json:"status"`
	Parts     []MessagePart   `json:"parts"`
}

// AssistantTextBlockProjection renders one contiguous assistant text segment.
// Text appends inside the block; the block never moves once a later block exists
// beneath it.
type AssistantTextBlockProjection struct {
	Text   string     `json:"text"`
	Format TextFormat `json:"format"`
}

// ReasoningBlockProjection renders active thinking and public reasoning summary
// content. Mode distinguishes the presentation; the block ID and kind stay
// stable when the mode changes from thinking to summary. Headline is the derived
// public one-line title shown in both modes. Summary is the full public summary
// revealed on expand in summary mode. Hidden/private reasoning text is never
// exposed here.
type ReasoningBlockProjection struct {
	SourceRunItemID string             `json:"sourceRunItemId"`
	Mode            ReasoningBlockMode `json:"mode"`
	Headline        string             `json:"headline"`
	Summary         string             `json:"summary"`
}

// ActivityItemBlockProjection renders one command, tool call, file change,
// approval, web search, image operation, terminal interaction, diff, hook,
// notice, or structured input row. SourceRunItemID links the block to its run
// item so output pagination keys off the source run item ID.
type ActivityItemBlockProjection struct {
	SourceRunItemID string                       `json:"sourceRunItemId"`
	Type            RunItemType                  `json:"type"`
	Title           string                       `json:"title"`
	Status          RunItemStatus                `json:"status"`
	Details         RunActivityDetailsProjection `json:"details"`
	HasDetails      bool                         `json:"hasDetails"`
	HasOutput       bool                         `json:"hasOutput"`
}

// RunStatusBlockProjection has two lifetimes by mode. A live-only working
// indicator is shown at the tail while a run is active and is never persisted as
// history. Terminal modes (completed, cancelled, failed) are permanent
// transcript-visible rows.
type RunStatusBlockProjection struct {
	Mode  RunStatusBlockMode `json:"mode"`
	Label string             `json:"label"`
	Error string             `json:"error"`
}

func (projection TranscriptMessageProjection) MarshalJSON() ([]byte, error) {
	type projectionAlias TranscriptMessageProjection
	if projection.Parts == nil {
		projection.Parts = []MessagePart{}
	}
	return json.Marshal(projectionAlias(projection))
}
