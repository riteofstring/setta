package director

import (
	"fmt"
	"strconv"
)

// The app-scoped Director subscription. The renderer loads one bounded snapshot
// with its durable cursor, subscribes from that cursor, and applies pushed
// events. There is no timer loop and no periodic refresh anywhere in this
// contract: when replay from a cursor cannot continue, the stream says so with
// a typed resync event instead of letting the renderer poll for the truth.

const (
	// MaxSnapshotWorkstreams bounds the app-wide registry window. Background
	// workstreams beyond it are still counted in the aggregates, so the user
	// never sees a silently truncated total.
	MaxSnapshotWorkstreams = 200
	// MaxSnapshotAdjacentGraphs bounds how many non-selected workstreams carry
	// a compact graph.
	MaxSnapshotAdjacentGraphs = 8
	// MaxSnapshotGraphNodes bounds the selected workstream's projected window.
	MaxSnapshotGraphNodes = 400
	// MaxSnapshotGraphEdges bounds edges within one workstream graph.
	MaxSnapshotGraphEdges = 800
	// MaxSnapshotApprovals bounds the app-wide unresolved approval list.
	MaxSnapshotApprovals = 50
	// MaxSnapshotResourceRequests bounds the app-wide unresolved resource
	// request list.
	MaxSnapshotResourceRequests = 50
	// MaxSnapshotArtifacts bounds the app-wide artifact window.
	MaxSnapshotArtifacts = 100
)

// DirectorEventStreamPrefix namespaces the app-scoped stream so a Director
// cursor can never be confused with a conversation cursor.
const DirectorEventStreamPrefix = "director:"

// DirectorEventCursor addresses a position in the app-scoped durable stream.
type DirectorEventCursor struct {
	StreamID string `json:"streamId"`
	Sequence int    `json:"sequence"`
}

// DirectorConnectionStatus is the renderer-visible transport state of the
// app-scoped subscription.
type DirectorConnectionStatus string

const (
	DirectorConnectionConnected    DirectorConnectionStatus = "connected"
	DirectorConnectionReconnecting DirectorConnectionStatus = "reconnecting"
	DirectorConnectionDisconnected DirectorConnectionStatus = "disconnected"
)

var directorConnectionStatuses = []DirectorConnectionStatus{
	DirectorConnectionConnected,
	DirectorConnectionReconnecting,
	DirectorConnectionDisconnected,
}

// DirectorConnectionState reports both transport health and replay position, so
// the shell can show a truthful "reconnecting" state without inventing one from
// a timeout.
type DirectorConnectionState struct {
	Status      DirectorConnectionStatus `json:"status"`
	LastEventAt *string                  `json:"lastEventAt"`
}

// DirectorAggregates is the app-wide actionable state that must be correct even
// for workstreams outside the snapshot window.
type DirectorAggregates struct {
	WorkstreamCount                int `json:"workstreamCount"`
	RunningCount                   int `json:"runningCount"`
	QueuedCount                    int `json:"queuedCount"`
	BlockedCount                   int `json:"blockedCount"`
	AwaitingApprovalCount          int `json:"awaitingApprovalCount"`
	AwaitingResourceCount          int `json:"awaitingResourceCount"`
	FailedCount                    int `json:"failedCount"`
	UnresolvedApprovalCount        int `json:"unresolvedApprovalCount"`
	UnresolvedResourceRequestCount int `json:"unresolvedResourceRequestCount"`
	ArtifactCount                  int `json:"artifactCount"`
}

// DirectorWorkstreamEntry is one registry row plus the detail level the
// registry assigned it.
type DirectorWorkstreamEntry struct {
	Workstream  Workstream            `json:"workstream"`
	DetailLevel WorkstreamDetailLevel `json:"detailLevel"`
}

// DirectorSnapshot is the bounded app-scoped cold-start projection. It is the
// only contract the renderer needs to draw the first frame of the command
// center.
type DirectorSnapshot struct {
	SchemaVersion int `json:"schemaVersion"`
	// SelectedWorkstreamID is persisted app state, not pane state. It is null
	// only before the user has ever started work.
	SelectedWorkstreamID *string                   `json:"selectedWorkstreamId"`
	Workstreams          []DirectorWorkstreamEntry `json:"workstreams"`
	// HasMoreWorkstreams reports that the registry holds more workstreams than
	// the window; the aggregates still count all of them.
	HasMoreWorkstreams         bool                    `json:"hasMoreWorkstreams"`
	Graphs                     []WorkstreamGraph       `json:"graphs"`
	UnresolvedApprovals        []ApprovalRequest       `json:"unresolvedApprovals"`
	UnresolvedResourceRequests []ResourceRequest       `json:"unresolvedResourceRequests"`
	Artifacts                  []WorkstreamArtifact    `json:"artifacts"`
	Aggregates                 DirectorAggregates      `json:"aggregates"`
	Connection                 DirectorConnectionState `json:"connection"`
	EventCursor                DirectorEventCursor     `json:"eventCursor"`
}

// DirectorEventKind is the app-scoped pushed-event catalog.
type DirectorEventKind string

const (
	DirectorEventWorkstreamUpdated      DirectorEventKind = "director.workstream.updated"
	DirectorEventWorkstreamRemoved      DirectorEventKind = "director.workstream.removed"
	DirectorEventSelectionChanged       DirectorEventKind = "director.selection.changed"
	DirectorEventGraphUpdated           DirectorEventKind = "director.graph.updated"
	DirectorEventApprovalUpdated        DirectorEventKind = "director.approval.updated"
	DirectorEventResourceRequestUpdated DirectorEventKind = "director.resource_request.updated"
	DirectorEventArtifactUpdated        DirectorEventKind = "director.artifact.updated"
	DirectorEventAggregatesUpdated      DirectorEventKind = "director.aggregates.updated"
	DirectorEventTextDelta              DirectorEventKind = "director.text.delta"
	DirectorEventResyncRequired         DirectorEventKind = "director.resync_required"
)

var directorEventKinds = []DirectorEventKind{
	DirectorEventWorkstreamUpdated,
	DirectorEventWorkstreamRemoved,
	DirectorEventSelectionChanged,
	DirectorEventGraphUpdated,
	DirectorEventApprovalUpdated,
	DirectorEventResourceRequestUpdated,
	DirectorEventArtifactUpdated,
	DirectorEventAggregatesUpdated,
	DirectorEventTextDelta,
	DirectorEventResyncRequired,
}

// DirectorEventDelivery is the backpressure class of one event kind. Semantic
// events are lossless because dropping one would leave the graph claiming
// something untrue. Only non-semantic text and process output may be dropped
// under load.
type DirectorEventDelivery string

const (
	DirectorEventDeliveryLossless   DirectorEventDelivery = "lossless"
	DirectorEventDeliveryBestEffort DirectorEventDelivery = "best_effort"
)

// DirectorResyncReason is the typed reason cursor replay cannot continue.
type DirectorResyncReason string

const (
	DirectorResyncCollectionWindowOverflow DirectorResyncReason = "collection_window_overflow"
	DirectorResyncEventBeforeSnapshot      DirectorResyncReason = "event_before_snapshot"
	DirectorResyncEventSchemaChanged       DirectorResyncReason = "event_schema_changed"
	DirectorResyncEventSequenceGap         DirectorResyncReason = "event_sequence_gap"
	DirectorResyncEventStreamChanged       DirectorResyncReason = "event_stream_changed"
	DirectorResyncServerRequired           DirectorResyncReason = "server_required"
)

var directorResyncReasons = []DirectorResyncReason{
	DirectorResyncCollectionWindowOverflow,
	DirectorResyncEventBeforeSnapshot,
	DirectorResyncEventSchemaChanged,
	DirectorResyncEventSequenceGap,
	DirectorResyncEventStreamChanged,
	DirectorResyncServerRequired,
}

// DirectorTextSurface names which non-semantic surface a text delta belongs to.
type DirectorTextSurface string

const (
	DirectorTextSurfaceAssistantMessage DirectorTextSurface = "assistant_message"
	DirectorTextSurfaceReasoningSummary DirectorTextSurface = "reasoning_summary"
	DirectorTextSurfaceProcessOutput    DirectorTextSurface = "process_output"
)

var directorTextSurfaces = []DirectorTextSurface{
	DirectorTextSurfaceAssistantMessage,
	DirectorTextSurfaceReasoningSummary,
	DirectorTextSurfaceProcessOutput,
}

type DirectorWorkstreamUpdatedPayload struct {
	Entry DirectorWorkstreamEntry `json:"entry"`
}

type DirectorWorkstreamRemovedPayload struct {
	WorkstreamID string `json:"workstreamId"`
}

type DirectorSelectionChangedPayload struct {
	SelectedWorkstreamID *string `json:"selectedWorkstreamId"`
}

// DirectorGraphUpdatedPayload carries content deltas for one workstream graph.
// Sending changed nodes and edges rather than a replacement graph is what keeps
// a burst of provider events from rebuilding an entire scene.
type DirectorGraphUpdatedPayload struct {
	WorkstreamID string                `json:"workstreamId"`
	DetailLevel  WorkstreamDetailLevel `json:"detailLevel"`
	Nodes        []SemanticNode        `json:"nodes"`
	Edges        []SemanticEdge        `json:"edges"`
	// RemovedNodeIDs are nodes compacted out of the live window. They are not
	// deletions of durable history.
	RemovedNodeIDs []string `json:"removedNodeIds"`
}

type DirectorApprovalUpdatedPayload struct {
	Approval ApprovalRequest `json:"approval"`
}

type DirectorResourceRequestUpdatedPayload struct {
	ResourceRequest ResourceRequest `json:"resourceRequest"`
}

type DirectorArtifactUpdatedPayload struct {
	Artifact WorkstreamArtifact `json:"artifact"`
}

type DirectorAggregatesUpdatedPayload struct {
	Aggregates DirectorAggregates `json:"aggregates"`
}

type DirectorTextDeltaPayload struct {
	WorkstreamID string              `json:"workstreamId"`
	RunID        *string             `json:"runId"`
	Surface      DirectorTextSurface `json:"surface"`
	Text         string              `json:"text"`
}

type DirectorResyncRequiredPayload struct {
	Reason            DirectorResyncReason `json:"reason"`
	RequestedStreamID string               `json:"requestedStreamId"`
	RequestedSequence int                  `json:"requestedSequence"`
	CurrentStreamID   string               `json:"currentStreamId"`
	CurrentSequence   int                  `json:"currentSequence"`
}

// DirectorEvent is one pushed app-scoped change. Kind selects exactly one
// populated branch, so a renderer switch is exhaustive and a malformed event
// fails at the decode boundary instead of rendering a half-applied change.
type DirectorEvent struct {
	SchemaVersion          int                                    `json:"schemaVersion"`
	StreamID               string                                 `json:"streamId"`
	Sequence               int                                    `json:"sequence"`
	EventID                string                                 `json:"eventId"`
	EmittedAt              string                                 `json:"emittedAt"`
	Kind                   DirectorEventKind                      `json:"kind"`
	WorkstreamUpdated      *DirectorWorkstreamUpdatedPayload      `json:"workstreamUpdated"`
	WorkstreamRemoved      *DirectorWorkstreamRemovedPayload      `json:"workstreamRemoved"`
	SelectionChanged       *DirectorSelectionChangedPayload       `json:"selectionChanged"`
	GraphUpdated           *DirectorGraphUpdatedPayload           `json:"graphUpdated"`
	ApprovalUpdated        *DirectorApprovalUpdatedPayload        `json:"approvalUpdated"`
	ResourceRequestUpdated *DirectorResourceRequestUpdatedPayload `json:"resourceRequestUpdated"`
	ArtifactUpdated        *DirectorArtifactUpdatedPayload        `json:"artifactUpdated"`
	AggregatesUpdated      *DirectorAggregatesUpdatedPayload      `json:"aggregatesUpdated"`
	TextDelta              *DirectorTextDeltaPayload              `json:"textDelta"`
	ResyncRequired         *DirectorResyncRequiredPayload         `json:"resyncRequired"`
}

// DirectorEventSubscription is the push-driven app-scoped stream. Waiting on
// this channel is an event-driven sleep, not a poll.
type DirectorEventSubscription interface {
	Events() <-chan DirectorEvent
	Unsubscribe()
}

// DirectorStreamID builds the app-scoped stream id for one durable stream
// epoch. The epoch changes when durable state is rebuilt, which is what lets a
// stale cursor be recognized as event_stream_changed instead of silently
// replaying the wrong history.
func DirectorStreamID(epoch string) (string, error) {
	if err := validateIdentifier("director event stream epoch", epoch); err != nil {
		return "", err
	}
	return DirectorEventStreamPrefix + epoch, nil
}

// DirectorEventID builds the durable event id for one stream position.
func DirectorEventID(streamID string, sequence int) (string, error) {
	if err := validateIdentifier("director event stream id", streamID); err != nil {
		return "", err
	}
	if err := validateSequence("director event sequence", sequence); err != nil {
		return "", err
	}
	return streamID + ":" + strconv.Itoa(sequence), nil
}

// DirectorEventDeliveryFor returns the backpressure class of one event kind.
func DirectorEventDeliveryFor(kind DirectorEventKind) (DirectorEventDelivery, error) {
	switch kind {
	case DirectorEventWorkstreamUpdated,
		DirectorEventWorkstreamRemoved,
		DirectorEventSelectionChanged,
		DirectorEventGraphUpdated,
		DirectorEventApprovalUpdated,
		DirectorEventResourceRequestUpdated,
		DirectorEventArtifactUpdated,
		DirectorEventAggregatesUpdated,
		DirectorEventResyncRequired:
		return DirectorEventDeliveryLossless, nil
	case DirectorEventTextDelta:
		return DirectorEventDeliveryBestEffort, nil
	default:
		return "", fmt.Errorf("unknown director event kind %q", kind)
	}
}

// DirectorEventKinds returns the ordered event catalog.
func DirectorEventKinds() []DirectorEventKind {
	return append([]DirectorEventKind(nil), directorEventKinds...)
}
