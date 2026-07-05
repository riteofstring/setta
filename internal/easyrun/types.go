package easyrun

type EasyRunStatus string
type EasyRunNarratorStatus string
type EasyArtifactKind string
type EasyRunEventType string

const (
	EasyRunStatusWorking   EasyRunStatus = "working"
	EasyRunStatusCompleted EasyRunStatus = "completed"
	EasyRunStatusFailed    EasyRunStatus = "failed"
	EasyRunStatusStopped   EasyRunStatus = "stopped"

	EasyRunNarratorStatusOK       EasyRunNarratorStatus = "ok"
	EasyRunNarratorStatusDegraded EasyRunNarratorStatus = "degraded"

	EasyArtifactKindMarkdown EasyArtifactKind = "markdown"
	EasyArtifactKindTable    EasyArtifactKind = "table"
	EasyArtifactKindBarChart EasyArtifactKind = "bar_chart"
	EasyArtifactKindFile     EasyArtifactKind = "file"

	EasyRunEventTypeRunUpdated       EasyRunEventType = "easyrun.run.updated"
	EasyRunEventTypeHighlightCreated EasyRunEventType = "easyrun.highlight.created"
	EasyRunEventTypeArtifactCreated  EasyRunEventType = "easyrun.artifact.created"
	EasyRunEventTypeResyncRequired   EasyRunEventType = "easyrun.resync_required"
)

const SchemaVersion = 1

var easyRunStatusValues = []EasyRunStatus{
	EasyRunStatusWorking,
	EasyRunStatusCompleted,
	EasyRunStatusFailed,
	EasyRunStatusStopped,
}

var easyRunNarratorStatusValues = []EasyRunNarratorStatus{
	EasyRunNarratorStatusOK,
	EasyRunNarratorStatusDegraded,
}

var easyArtifactKindValues = []EasyArtifactKind{
	EasyArtifactKindMarkdown,
	EasyArtifactKindTable,
	EasyArtifactKindBarChart,
	EasyArtifactKindFile,
}

var easyRunEventTypeValues = []EasyRunEventType{
	EasyRunEventTypeRunUpdated,
	EasyRunEventTypeHighlightCreated,
	EasyRunEventTypeArtifactCreated,
	EasyRunEventTypeResyncRequired,
}

type EasyRun struct {
	ID               string                `json:"id"`
	WorkspaceID      string                `json:"workspaceId"`
	Status           EasyRunStatus         `json:"status"`
	RequestText      string                `json:"requestText"`
	ConversationID   string                `json:"conversationId"`
	StartedAt        string                `json:"startedAt"`
	EndedAt          *string               `json:"endedAt"`
	Summary          *string               `json:"summary"`
	Error            *string               `json:"error"`
	NarratorStatus   EasyRunNarratorStatus `json:"narratorStatus"`
	ActiveAgentCount int                   `json:"activeAgentCount"`
	ArtifactCount    int                   `json:"artifactCount"`
	HighlightCount   int                   `json:"highlightCount"`
}

type EasyHighlight struct {
	ID        string `json:"id"`
	EasyRunID string `json:"easyRunId"`
	Ordinal   int    `json:"ordinal"`
	Text      string `json:"text"`
	At        string `json:"at"`
}

type EasyArtifact struct {
	ID        string           `json:"id"`
	EasyRunID string           `json:"easyRunId"`
	Ordinal   int              `json:"ordinal"`
	Kind      EasyArtifactKind `json:"kind"`
	Title     string           `json:"title"`
	Kicker    *string          `json:"kicker"`
	CreatedAt string           `json:"createdAt"`

	Markdown *EasyMarkdownArtifactPayload `json:"markdown"`
	Table    *EasyTableArtifactPayload    `json:"table"`
	BarChart *EasyBarChartArtifactPayload `json:"barChart"`
	File     *EasyFileArtifactPayload     `json:"file"`
}

type EasyMarkdownArtifactPayload struct {
	Markdown string `json:"markdown"`
}

type EasyTableArtifactPayload struct {
	Columns []EasyArtifactTableColumn `json:"columns"`
	Rows    [][]string                `json:"rows"`
}

type EasyArtifactTableColumn struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type EasyBarChartArtifactPayload struct {
	Items []EasyArtifactBarChartItem `json:"items"`
}

type EasyArtifactBarChartItem struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Unit  *string `json:"unit"`
}

type EasyFileArtifactPayload struct {
	Path        string  `json:"path"`
	Description *string `json:"description"`
}

type EasyRunEventCursor struct {
	StreamID string `json:"streamId"`
	Sequence int    `json:"sequence"`
}

type EasyRunSnapshot struct {
	LatestRun         *EasyRun           `json:"latestRun"`
	Highlights        []EasyHighlight    `json:"highlights"`
	Artifacts         []EasyArtifact     `json:"artifacts"`
	EventStreamCursor EasyRunEventCursor `json:"eventStreamCursor"`
}

type EasyRunEvent struct {
	SchemaVersion int              `json:"schemaVersion"`
	StreamID      string           `json:"streamId"`
	Sequence      int              `json:"sequence"`
	EventID       string           `json:"eventId"`
	Type          EasyRunEventType `json:"type"`
	EmittedAt     string           `json:"emittedAt"`
	WorkspaceID   string           `json:"workspaceId"`
	EasyRunID     string           `json:"easyRunId"`

	RunUpdated       *EasyRunUpdatedPayload       `json:"runUpdated"`
	HighlightCreated *EasyHighlightCreatedPayload `json:"highlightCreated"`
	ArtifactCreated  *EasyArtifactCreatedPayload  `json:"artifactCreated"`
	ResyncRequired   *EasyRunResyncRequired       `json:"resyncRequired"`
}

type EasyRunUpdatedPayload struct {
	Run EasyRun `json:"run"`
}

type EasyHighlightCreatedPayload struct {
	Highlight EasyHighlight `json:"highlight"`
}

type EasyArtifactCreatedPayload struct {
	Artifact EasyArtifact `json:"artifact"`
}

type EasyRunResyncRequired struct {
	Reason            string `json:"reason"`
	RequestedStreamID string `json:"requestedStreamId"`
	RequestedSequence int    `json:"requestedSequence"`
	CurrentStreamID   string `json:"currentStreamId"`
	CurrentSequence   int    `json:"currentSequence"`
	EarliestSequence  int    `json:"earliestSequence"`
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "EasyRunStatus", Values: stringValues(easyRunStatusValues)},
		{Name: "EasyRunNarratorStatus", Values: stringValues(easyRunNarratorStatusValues)},
		{Name: "EasyArtifactKind", Values: stringValues(easyArtifactKindValues)},
		{Name: "EasyRunEventType", Values: stringValues(easyRunEventTypeValues)},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
