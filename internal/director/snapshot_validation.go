package director

import (
	"fmt"
	"strings"
)

// Validate rejects a cursor that does not address the supplied stream.
func (cursor DirectorEventCursor) Validate(streamID string) error {
	if err := validateDirectorStreamID("director event cursor stream id", cursor.StreamID); err != nil {
		return err
	}
	if cursor.StreamID != streamID {
		return fmt.Errorf("director event cursor stream %q does not match %q", cursor.StreamID, streamID)
	}
	if cursor.Sequence < 0 {
		return fmt.Errorf("director event cursor sequence must be non-negative: %d", cursor.Sequence)
	}
	return nil
}

// validateDirectorStreamID keeps an app-scoped cursor from being confused with
// a conversation cursor, which would silently replay the wrong history.
func validateDirectorStreamID(label string, streamID string) error {
	if err := validateIdentifier(label, streamID); err != nil {
		return err
	}
	if !strings.HasPrefix(streamID, DirectorEventStreamPrefix) || len(streamID) == len(DirectorEventStreamPrefix) {
		return fmt.Errorf("%s must be a director stream id: %q", label, streamID)
	}
	return nil
}

// ValidateDirectorSnapshot rejects a snapshot that exceeds its bounds, orders
// detail levels inconsistently, or claims a selection it does not contain.
func ValidateDirectorSnapshot(snapshot DirectorSnapshot) error {
	if err := validateDirectorSnapshotEnvelope(snapshot); err != nil {
		return err
	}
	authority, err := validateSnapshotWorkstreams(snapshot)
	if err != nil {
		return err
	}
	for _, validate := range []func() error{
		func() error { return validateSnapshotGraphs(snapshot, authority) },
		func() error { return validateSnapshotRecords(snapshot, authority) },
		func() error { return validateAggregates(snapshot.Aggregates) },
		func() error { return validateSnapshotAggregateConsistency(snapshot) },
		func() error { return validateConnectionState(snapshot.Connection) },
		func() error {
			return validateDirectorStreamID("director snapshot cursor stream id", snapshot.EventCursor.StreamID)
		},
	} {
		if err := validate(); err != nil {
			return err
		}
	}
	return snapshot.EventCursor.Validate(snapshot.EventCursor.StreamID)
}

func validateDirectorSnapshotEnvelope(snapshot DirectorSnapshot) error {
	if snapshot.SchemaVersion != DirectorContractSchemaVersion {
		return fmt.Errorf(
			"director snapshot schema version %d does not match %d",
			snapshot.SchemaVersion,
			DirectorContractSchemaVersion,
		)
	}
	if len(snapshot.Workstreams) > MaxSnapshotWorkstreams {
		return fmt.Errorf("director snapshot holds %d workstreams, max %d", len(snapshot.Workstreams), MaxSnapshotWorkstreams)
	}
	if snapshot.Workstreams == nil ||
		snapshot.Graphs == nil ||
		snapshot.UnresolvedApprovals == nil ||
		snapshot.UnresolvedResourceRequests == nil ||
		snapshot.Artifacts == nil {
		return fmt.Errorf("director snapshot collection fields must be arrays, not null")
	}
	return nil
}

// validateSnapshotWorkstreams derives the id space a snapshot's graphs may
// reference. The Director lane is in it and has no row: it is the scope the
// Director's own conversation is drawn in, not work the registry lists.
func validateSnapshotWorkstreams(snapshot DirectorSnapshot) (GraphAuthority, error) {
	authority := GraphAuthority{WorkstreamParents: map[string]*string{DirectorLaneID: nil}}
	levelCounts := map[WorkstreamDetailLevel]int{}
	for _, entry := range snapshot.Workstreams {
		if err := validateSnapshotWorkstreamEntry(entry, snapshot.SelectedWorkstreamID, authority); err != nil {
			return GraphAuthority{}, err
		}
		authority.WorkstreamParents[entry.Workstream.ID] = entry.Workstream.ParentID
		levelCounts[entry.DetailLevel]++
	}
	if err := validateSnapshotDetailCounts(snapshot, levelCounts); err != nil {
		return GraphAuthority{}, err
	}
	return authority, nil
}

func validateSnapshotWorkstreamEntry(
	entry DirectorWorkstreamEntry,
	selectedWorkstreamID *string,
	authority GraphAuthority,
) error {
	if err := ValidateWorkstream(entry.Workstream); err != nil {
		return err
	}
	if !isWorkstreamDetailLevel(entry.DetailLevel) {
		return fmt.Errorf(
			"director snapshot workstream %s has unknown detail level %q",
			entry.Workstream.ID,
			entry.DetailLevel,
		)
	}
	if _, duplicate := authority.WorkstreamParents[entry.Workstream.ID]; duplicate {
		return fmt.Errorf("director snapshot repeats workstream %q", entry.Workstream.ID)
	}
	if entry.DetailLevel != WorkstreamDetailSelected {
		return nil
	}
	if selectedWorkstreamID == nil || *selectedWorkstreamID != entry.Workstream.ID {
		return fmt.Errorf(
			"director snapshot marks workstream %s selected but selection points elsewhere",
			entry.Workstream.ID,
		)
	}
	return nil
}

func validateSnapshotDetailCounts(snapshot DirectorSnapshot, levelCounts map[WorkstreamDetailLevel]int) error {
	selectedCount := levelCounts[WorkstreamDetailSelected]
	if selectedCount > 1 {
		return fmt.Errorf("director snapshot marks %d workstreams selected", selectedCount)
	}
	if snapshot.SelectedWorkstreamID != nil && selectedCount == 0 {
		return fmt.Errorf(
			"director snapshot selects workstream %q that is not in the window",
			*snapshot.SelectedWorkstreamID,
		)
	}
	if adjacentCount := levelCounts[WorkstreamDetailAdjacent]; adjacentCount > MaxSnapshotAdjacentGraphs {
		return fmt.Errorf(
			"director snapshot holds %d adjacent workstreams, max %d",
			adjacentCount,
			MaxSnapshotAdjacentGraphs,
		)
	}
	return nil
}

func validateSnapshotGraphs(snapshot DirectorSnapshot, authority GraphAuthority) error {
	// The Director lane is always drawn in full. It is where the user is
	// talking, so there is no state in which it is peripheral.
	detailLevels := map[string]WorkstreamDetailLevel{DirectorLaneID: WorkstreamDetailSelected}
	for _, entry := range snapshot.Workstreams {
		detailLevels[entry.Workstream.ID] = entry.DetailLevel
	}
	seen := map[string]bool{}
	for _, graph := range snapshot.Graphs {
		if err := validateSnapshotGraph(graph, detailLevels, seen, authority); err != nil {
			return err
		}
	}
	return validateSnapshotGraphCoverage(detailLevels, seen)
}

func validateSnapshotGraph(
	graph WorkstreamGraph,
	detailLevels map[string]WorkstreamDetailLevel,
	seen map[string]bool,
	authority GraphAuthority,
) error {
	if seen[graph.WorkstreamID] {
		return fmt.Errorf("director snapshot repeats a graph for workstream %q", graph.WorkstreamID)
	}
	seen[graph.WorkstreamID] = true
	level, known := detailLevels[graph.WorkstreamID]
	if !known {
		return fmt.Errorf("director snapshot holds a graph for workstream %q outside the window", graph.WorkstreamID)
	}
	if level != graph.DetailLevel {
		return fmt.Errorf(
			"director snapshot graph for workstream %q claims detail level %q while the registry says %q",
			graph.WorkstreamID,
			graph.DetailLevel,
			level,
		)
	}
	if err := validateSnapshotGraphBounds(graph); err != nil {
		return err
	}
	return ValidateWorkstreamGraph(graph, authority)
}

func validateSnapshotGraphBounds(graph WorkstreamGraph) error {
	maxNodes := MaxSnapshotGraphNodes
	if graph.DetailLevel == WorkstreamDetailAdjacent {
		maxNodes = MaxSnapshotAdjacentGraphNodes
	}
	if len(graph.Nodes) > maxNodes {
		return fmt.Errorf("workstream graph %s holds %d nodes, max %d", graph.WorkstreamID, len(graph.Nodes), maxNodes)
	}
	if len(graph.Edges) > MaxSnapshotGraphEdges {
		return fmt.Errorf("workstream graph %s holds %d edges, max %d", graph.WorkstreamID, len(graph.Edges), MaxSnapshotGraphEdges)
	}
	return nil
}

func validateSnapshotGraphCoverage(
	detailLevels map[string]WorkstreamDetailLevel,
	seen map[string]bool,
) error {
	for workstreamID, level := range detailLevels {
		switch level {
		case WorkstreamDetailSelected, WorkstreamDetailAdjacent:
			if !seen[workstreamID] {
				return fmt.Errorf("director snapshot is missing the %s graph for workstream %q", level, workstreamID)
			}
		case WorkstreamDetailBackground:
			if seen[workstreamID] {
				return fmt.Errorf("director snapshot includes a graph for background workstream %q", workstreamID)
			}
		}
	}
	return nil
}

func validateSnapshotRecords(snapshot DirectorSnapshot, authority GraphAuthority) error {
	if err := validateSnapshotApprovals(snapshot.UnresolvedApprovals, authority); err != nil {
		return err
	}
	if err := validateSnapshotResourceRequests(snapshot.UnresolvedResourceRequests, authority); err != nil {
		return err
	}
	return validateSnapshotArtifacts(snapshot.Artifacts, authority)
}

func validateSnapshotApprovals(approvals []ApprovalRequest, authority GraphAuthority) error {
	if len(approvals) > MaxSnapshotApprovals {
		return fmt.Errorf("director snapshot holds %d unresolved approvals, max %d", len(approvals), MaxSnapshotApprovals)
	}
	seen := make(map[string]bool, len(approvals))
	for _, approval := range approvals {
		if err := ValidateApprovalRequest(approval); err != nil {
			return err
		}
		if seen[approval.ID] {
			return fmt.Errorf("director snapshot repeats approval %q", approval.ID)
		}
		seen[approval.ID] = true
		if approval.Status != ApprovalStatusPending {
			return fmt.Errorf("director snapshot lists resolved approval %s as unresolved", approval.ID)
		}
		if !authority.knowsWorkstream(approval.WorkstreamID) {
			return fmt.Errorf("approval %s references workstream %q outside the window", approval.ID, approval.WorkstreamID)
		}
	}
	return nil
}

func validateSnapshotResourceRequests(requests []ResourceRequest, authority GraphAuthority) error {
	if len(requests) > MaxSnapshotResourceRequests {
		return fmt.Errorf(
			"director snapshot holds %d unresolved resource requests, max %d",
			len(requests),
			MaxSnapshotResourceRequests,
		)
	}
	seen := make(map[string]bool, len(requests))
	for _, request := range requests {
		if err := ValidateResourceRequest(request); err != nil {
			return err
		}
		if seen[request.ID] {
			return fmt.Errorf("director snapshot repeats resource request %q", request.ID)
		}
		seen[request.ID] = true
		if request.Status != ResourceRequestStatusRequested {
			return fmt.Errorf("director snapshot lists resolved resource request %s as unresolved", request.ID)
		}
		if !authority.knowsWorkstream(request.WorkstreamID) {
			return fmt.Errorf("resource request %s references workstream %q outside the window", request.ID, request.WorkstreamID)
		}
	}
	return nil
}

func validateSnapshotArtifacts(artifacts []WorkstreamArtifact, authority GraphAuthority) error {
	if len(artifacts) > MaxSnapshotArtifacts {
		return fmt.Errorf("director snapshot holds %d artifacts, max %d", len(artifacts), MaxSnapshotArtifacts)
	}
	seen := make(map[string]bool, len(artifacts))
	for _, artifact := range artifacts {
		if err := ValidateWorkstreamArtifact(artifact); err != nil {
			return err
		}
		if seen[artifact.ID] {
			return fmt.Errorf("director snapshot repeats artifact %q", artifact.ID)
		}
		seen[artifact.ID] = true
		if !authority.knowsWorkstream(artifact.WorkstreamID) {
			return fmt.Errorf("artifact %s references workstream %q outside the window", artifact.ID, artifact.WorkstreamID)
		}
	}
	return nil
}

func validateAggregates(aggregates DirectorAggregates) error {
	counts := map[string]int{
		"director aggregate workstream count":                  aggregates.WorkstreamCount,
		"director aggregate running count":                     aggregates.RunningCount,
		"director aggregate queued count":                      aggregates.QueuedCount,
		"director aggregate blocked count":                     aggregates.BlockedCount,
		"director aggregate awaiting approval count":           aggregates.AwaitingApprovalCount,
		"director aggregate awaiting resource count":           aggregates.AwaitingResourceCount,
		"director aggregate failed count":                      aggregates.FailedCount,
		"director aggregate unresolved approval count":         aggregates.UnresolvedApprovalCount,
		"director aggregate unresolved resource request count": aggregates.UnresolvedResourceRequestCount,
		"director aggregate artifact count":                    aggregates.ArtifactCount,
	}
	for label, count := range counts {
		if err := validateCount(label, count); err != nil {
			return err
		}
	}
	for label, count := range map[string]int{
		"running":           aggregates.RunningCount,
		"queued":            aggregates.QueuedCount,
		"blocked":           aggregates.BlockedCount,
		"awaiting approval": aggregates.AwaitingApprovalCount,
		"awaiting resource": aggregates.AwaitingResourceCount,
		"failed":            aggregates.FailedCount,
	} {
		if count > aggregates.WorkstreamCount {
			return fmt.Errorf(
				"director aggregate %s count %d is above workstream count %d",
				label,
				count,
				aggregates.WorkstreamCount,
			)
		}
	}
	return nil
}

func validateSnapshotAggregateConsistency(snapshot DirectorSnapshot) error {
	hasMore, err := validateSnapshotAggregateBounds(snapshot)
	if err != nil {
		return err
	}
	visible := collectVisibleSnapshotAggregates(snapshot.Workstreams)
	if err := validateVisibleSnapshotCollections(snapshot, visible); err != nil {
		return err
	}
	return validateVisibleSnapshotAggregateCounts(snapshot.Aggregates, visible, hasMore)
}

func validateSnapshotAggregateBounds(snapshot DirectorSnapshot) (bool, error) {
	visibleWorkstreams := len(snapshot.Workstreams)
	if snapshot.Aggregates.WorkstreamCount < visibleWorkstreams {
		return false, fmt.Errorf(
			"director aggregate workstream count %d is below the %d workstreams in the snapshot",
			snapshot.Aggregates.WorkstreamCount,
			visibleWorkstreams,
		)
	}
	hasMore := snapshot.Aggregates.WorkstreamCount > visibleWorkstreams
	if snapshot.HasMoreWorkstreams != hasMore {
		return false, fmt.Errorf(
			"director snapshot hasMoreWorkstreams is %t with %d visible of %d aggregate workstreams",
			snapshot.HasMoreWorkstreams,
			visibleWorkstreams,
			snapshot.Aggregates.WorkstreamCount,
		)
	}
	for _, collection := range []struct {
		aggregate    int
		label        string
		visible      int
		visibleLabel string
	}{
		{
			aggregate:    snapshot.Aggregates.UnresolvedApprovalCount,
			label:        "unresolved approval",
			visible:      len(snapshot.UnresolvedApprovals),
			visibleLabel: "approvals",
		},
		{
			aggregate:    snapshot.Aggregates.UnresolvedResourceRequestCount,
			label:        "unresolved resource request",
			visible:      len(snapshot.UnresolvedResourceRequests),
			visibleLabel: "requests",
		},
		{
			aggregate:    snapshot.Aggregates.ArtifactCount,
			label:        "artifact",
			visible:      len(snapshot.Artifacts),
			visibleLabel: "artifacts",
		},
	} {
		if collection.aggregate < collection.visible {
			return false, fmt.Errorf(
				"director aggregate %s count %d is below the %d visible %s",
				collection.label,
				collection.aggregate,
				collection.visible,
				collection.visibleLabel,
			)
		}
	}
	return hasMore, nil
}

type visibleSnapshotAggregates struct {
	artifacts                  int
	awaitingApproval           int
	awaitingResource           int
	blocked                    int
	failed                     int
	queued                     int
	running                    int
	unresolvedApprovals        int
	unresolvedResourceRequests int
	approvalCountsByWorkstream map[string]int
	artifactCountsByWorkstream map[string]int
	resourceCountsByWorkstream map[string]int
}

func collectVisibleSnapshotAggregates(
	entries []DirectorWorkstreamEntry,
) visibleSnapshotAggregates {
	result := visibleSnapshotAggregates{
		approvalCountsByWorkstream: map[string]int{},
		artifactCountsByWorkstream: map[string]int{},
		resourceCountsByWorkstream: map[string]int{},
	}
	for _, entry := range entries {
		workstream := entry.Workstream
		if workstream.ActiveRunID != nil {
			result.running++
		}
		if workstream.QueuedRunCount > 0 {
			result.queued++
		}
		if workstream.Status == WorkstreamStatusBlocked {
			result.blocked++
		}
		if workstream.UnresolvedApprovalCount > 0 {
			result.awaitingApproval++
		}
		if workstream.UnresolvedResourceRequestCount > 0 {
			result.awaitingResource++
		}
		if workstream.Status == WorkstreamStatusFailed {
			result.failed++
		}
		result.unresolvedApprovals += workstream.UnresolvedApprovalCount
		result.unresolvedResourceRequests += workstream.UnresolvedResourceRequestCount
		result.artifacts += workstream.ArtifactCount
		result.approvalCountsByWorkstream[workstream.ID] = workstream.UnresolvedApprovalCount
		result.resourceCountsByWorkstream[workstream.ID] = workstream.UnresolvedResourceRequestCount
		result.artifactCountsByWorkstream[workstream.ID] = workstream.ArtifactCount
	}
	return result
}

func validateVisibleSnapshotCollections(
	snapshot DirectorSnapshot,
	visible visibleSnapshotAggregates,
) error {
	listedApprovals := map[string]int{}
	for _, approval := range snapshot.UnresolvedApprovals {
		listedApprovals[approval.WorkstreamID]++
	}
	listedResources := map[string]int{}
	for _, request := range snapshot.UnresolvedResourceRequests {
		listedResources[request.WorkstreamID]++
	}
	listedArtifacts := map[string]int{}
	for _, artifact := range snapshot.Artifacts {
		listedArtifacts[artifact.WorkstreamID]++
	}
	for _, collection := range []snapshotCollectionCounts{
		{
			label:            "unresolved approval",
			listed:           len(snapshot.UnresolvedApprovals),
			visible:          visible.unresolvedApprovals,
			maximum:          MaxSnapshotApprovals,
			listedByOwner:    listedApprovals,
			availableByOwner: visible.approvalCountsByWorkstream,
		},
		{
			label:            "unresolved resource request",
			listed:           len(snapshot.UnresolvedResourceRequests),
			visible:          visible.unresolvedResourceRequests,
			maximum:          MaxSnapshotResourceRequests,
			listedByOwner:    listedResources,
			availableByOwner: visible.resourceCountsByWorkstream,
		},
		{
			label:            "artifact",
			listed:           len(snapshot.Artifacts),
			visible:          visible.artifacts,
			maximum:          MaxSnapshotArtifacts,
			listedByOwner:    listedArtifacts,
			availableByOwner: visible.artifactCountsByWorkstream,
		},
	} {
		if err := validateVisibleSnapshotCollection(collection); err != nil {
			return err
		}
	}
	return nil
}

type snapshotCollectionCounts struct {
	label            string
	listed           int
	visible          int
	maximum          int
	listedByOwner    map[string]int
	availableByOwner map[string]int
}

func validateVisibleSnapshotCollection(collection snapshotCollectionCounts) error {
	expected := collection.visible
	if expected > collection.maximum {
		expected = collection.maximum
	}
	if collection.listed != expected {
		return fmt.Errorf(
			"director snapshot lists %d %ss, want %d for the visible bounded window",
			collection.listed,
			collection.label,
			expected,
		)
	}
	for workstreamID, listed := range collection.listedByOwner {
		if available := collection.availableByOwner[workstreamID]; listed > available {
			return fmt.Errorf(
				"director snapshot lists %d %ss for workstream %s, which reports %d",
				listed,
				collection.label,
				workstreamID,
				available,
			)
		}
	}
	return nil
}

func validateVisibleSnapshotAggregateCounts(
	aggregates DirectorAggregates,
	visible visibleSnapshotAggregates,
	hasMore bool,
) error {
	for _, count := range []struct {
		label     string
		aggregate int
		visible   int
	}{
		{"running", aggregates.RunningCount, visible.running},
		{"queued", aggregates.QueuedCount, visible.queued},
		{"blocked", aggregates.BlockedCount, visible.blocked},
		{"awaiting approval", aggregates.AwaitingApprovalCount, visible.awaitingApproval},
		{"awaiting resource", aggregates.AwaitingResourceCount, visible.awaitingResource},
		{"failed", aggregates.FailedCount, visible.failed},
		{"unresolved approval", aggregates.UnresolvedApprovalCount, visible.unresolvedApprovals},
		{"unresolved resource request", aggregates.UnresolvedResourceRequestCount, visible.unresolvedResourceRequests},
		{"artifact", aggregates.ArtifactCount, visible.artifacts},
	} {
		if count.aggregate < count.visible {
			return fmt.Errorf(
				"director aggregate %s count %d is below the visible count %d",
				count.label,
				count.aggregate,
				count.visible,
			)
		}
		if !hasMore && count.aggregate != count.visible {
			return fmt.Errorf(
				"director aggregate %s count %d differs from the complete visible count %d",
				count.label,
				count.aggregate,
				count.visible,
			)
		}
	}
	return nil
}

func validateConnectionState(state DirectorConnectionState) error {
	for _, candidate := range directorConnectionStatuses {
		if candidate == state.Status {
			return validateOptionalTimestamp("director connection last event at", state.LastEventAt)
		}
	}
	return fmt.Errorf("unknown director connection status %q", state.Status)
}

// ValidateDirectorEvent rejects an envelope whose kind does not select exactly
// one populated payload branch, or whose payload is not internally valid.
func ValidateDirectorEvent(event DirectorEvent) error {
	if event.SchemaVersion != DirectorContractSchemaVersion {
		return fmt.Errorf("director event schema version %d does not match %d", event.SchemaVersion, DirectorContractSchemaVersion)
	}
	if err := validateDirectorStreamID("director event stream id", event.StreamID); err != nil {
		return err
	}
	if err := validateSequence("director event sequence", event.Sequence); err != nil {
		return err
	}
	expectedID, err := DirectorEventID(event.StreamID, event.Sequence)
	if err != nil {
		return err
	}
	if event.EventID != expectedID {
		return fmt.Errorf("director event id %q does not match stream position %q", event.EventID, expectedID)
	}
	if err := validateTimestamp("director event emitted at", event.EmittedAt); err != nil {
		return err
	}
	if _, err := DirectorEventDeliveryFor(event.Kind); err != nil {
		return err
	}
	return validateDirectorEventBranches(event)
}

func validateDirectorEventBranches(event DirectorEvent) error {
	populated := map[DirectorEventKind]bool{
		DirectorEventWorkstreamUpdated:      event.WorkstreamUpdated != nil,
		DirectorEventWorkstreamRemoved:      event.WorkstreamRemoved != nil,
		DirectorEventSelectionChanged:       event.SelectionChanged != nil,
		DirectorEventGraphUpdated:           event.GraphUpdated != nil,
		DirectorEventApprovalUpdated:        event.ApprovalUpdated != nil,
		DirectorEventResourceRequestUpdated: event.ResourceRequestUpdated != nil,
		DirectorEventArtifactUpdated:        event.ArtifactUpdated != nil,
		DirectorEventAggregatesUpdated:      event.AggregatesUpdated != nil,
		DirectorEventTextDelta:              event.TextDelta != nil,
		DirectorEventResyncRequired:         event.ResyncRequired != nil,
	}
	for kind, isPopulated := range populated {
		if isPopulated != (kind == event.Kind) {
			return fmt.Errorf("director event of kind %q must populate exactly its own payload branch", event.Kind)
		}
	}
	return validateDirectorEventPayload(event)
}

// directorEventPayloadValidators keeps one validator per event kind so adding a
// kind without validating its payload is a missing-entry failure rather than a
// silently accepted event.
var directorEventPayloadValidators = map[DirectorEventKind]func(DirectorEvent) error{
	DirectorEventWorkstreamUpdated: func(event DirectorEvent) error {
		return validateWorkstreamEntryPayload(event.WorkstreamUpdated.Entry)
	},
	DirectorEventWorkstreamRemoved: func(event DirectorEvent) error {
		return validateIdentifier("director workstream removed id", event.WorkstreamRemoved.WorkstreamID)
	},
	DirectorEventSelectionChanged: func(event DirectorEvent) error {
		if event.SelectionChanged.SelectedWorkstreamID == nil {
			return nil
		}
		return validateIdentifier("director selected workstream id", *event.SelectionChanged.SelectedWorkstreamID)
	},
	DirectorEventGraphUpdated: func(event DirectorEvent) error {
		return validateGraphUpdatedPayload(*event.GraphUpdated)
	},
	DirectorEventApprovalUpdated: func(event DirectorEvent) error {
		return ValidateApprovalRequest(event.ApprovalUpdated.Approval)
	},
	DirectorEventResourceRequestUpdated: func(event DirectorEvent) error {
		return ValidateResourceRequest(event.ResourceRequestUpdated.ResourceRequest)
	},
	DirectorEventArtifactUpdated: func(event DirectorEvent) error {
		return ValidateWorkstreamArtifact(event.ArtifactUpdated.Artifact)
	},
	DirectorEventAggregatesUpdated: func(event DirectorEvent) error {
		return validateAggregates(event.AggregatesUpdated.Aggregates)
	},
	DirectorEventTextDelta: func(event DirectorEvent) error {
		return validateTextDeltaPayload(*event.TextDelta)
	},
	DirectorEventResyncRequired: func(event DirectorEvent) error {
		return validateResyncPayload(*event.ResyncRequired)
	},
}

func validateDirectorEventPayload(event DirectorEvent) error {
	validate, known := directorEventPayloadValidators[event.Kind]
	if !known {
		return fmt.Errorf("director event kind %q has no payload validator", event.Kind)
	}
	return validate(event)
}

func validateWorkstreamEntryPayload(entry DirectorWorkstreamEntry) error {
	if !isWorkstreamDetailLevel(entry.DetailLevel) {
		return fmt.Errorf("director workstream event has unknown detail level %q", entry.DetailLevel)
	}
	return ValidateWorkstream(entry.Workstream)
}

func validateGraphUpdatedPayload(payload DirectorGraphUpdatedPayload) error {
	if err := validateIdentifier("director graph workstream id", payload.WorkstreamID); err != nil {
		return err
	}
	if !isWorkstreamDetailLevel(payload.DetailLevel) {
		return fmt.Errorf("director graph event has unknown detail level %q", payload.DetailLevel)
	}
	if err := validateGraphUpdateCollections(payload); err != nil {
		return err
	}
	if err := validateGraphUpdateDetailLevel(payload); err != nil {
		return err
	}
	if err := validateGraphUpdateBounds(payload); err != nil {
		return err
	}
	return validateGraphDelta(payload)
}

func validateGraphUpdateCollections(payload DirectorGraphUpdatedPayload) error {
	if payload.Nodes == nil || payload.Edges == nil || payload.RemovedNodeIDs == nil {
		return fmt.Errorf("director graph event collections must be arrays, not null")
	}
	if payload.DetailLevel != WorkstreamDetailBackground &&
		graphChangeIsEmpty(payload.Nodes, payload.Edges, payload.RemovedNodeIDs) {
		return fmt.Errorf("director graph event for workstream %s changes nothing", payload.WorkstreamID)
	}
	return nil
}

func validateGraphUpdateDetailLevel(payload DirectorGraphUpdatedPayload) error {
	if payload.DetailLevel != WorkstreamDetailBackground {
		return nil
	}
	if len(payload.Nodes) > 0 || len(payload.Edges) > 0 {
		return fmt.Errorf("background workstream %s must not receive graph additions", payload.WorkstreamID)
	}
	if len(payload.RemovedNodeIDs) == 0 {
		return fmt.Errorf(
			"background workstream %s must receive graph removals or aggregate updates",
			payload.WorkstreamID,
		)
	}
	return nil
}

func validateGraphUpdateBounds(payload DirectorGraphUpdatedPayload) error {
	maxNodes := MaxSnapshotGraphNodes
	if payload.DetailLevel == WorkstreamDetailAdjacent {
		maxNodes = MaxSnapshotAdjacentGraphNodes
	}
	if len(payload.Nodes) > maxNodes {
		return fmt.Errorf("director graph event for workstream %s holds %d nodes, max %d", payload.WorkstreamID, len(payload.Nodes), maxNodes)
	}
	if len(payload.RemovedNodeIDs) > maxNodes {
		return fmt.Errorf(
			"director graph event for workstream %s removes %d nodes, max %d",
			payload.WorkstreamID,
			len(payload.RemovedNodeIDs),
			maxNodes,
		)
	}
	if len(payload.Edges) > MaxSnapshotGraphEdges {
		return fmt.Errorf(
			"director graph event for workstream %s holds %d edges, max %d",
			payload.WorkstreamID,
			len(payload.Edges),
			MaxSnapshotGraphEdges,
		)
	}
	return nil
}

func validateGraphDelta(payload DirectorGraphUpdatedPayload) error {
	authority := GraphAuthority{WorkstreamParents: map[string]*string{payload.WorkstreamID: nil}}
	nodeIDs, err := validateGraphDeltaNodes(payload, authority)
	if err != nil {
		return err
	}
	if err := validateGraphDeltaEdges(payload, authority); err != nil {
		return err
	}
	removed, err := validateGraphDeltaRemovals(payload, nodeIDs)
	if err != nil {
		return err
	}
	return validateGraphDeltaRemovedReferences(payload, removed)
}

func validateGraphDeltaNodes(
	payload DirectorGraphUpdatedPayload,
	authority GraphAuthority,
) (map[string]bool, error) {
	nodeIDs := make(map[string]bool, len(payload.Nodes))
	for _, node := range payload.Nodes {
		if node.WorkstreamID != payload.WorkstreamID {
			return nil, fmt.Errorf(
				"director graph event for workstream %s carries node %s owned by %q",
				payload.WorkstreamID,
				node.ID,
				node.WorkstreamID,
			)
		}
		if nodeIDs[node.ID] {
			return nil, fmt.Errorf("director graph event for workstream %s repeats node %q", payload.WorkstreamID, node.ID)
		}
		nodeIDs[node.ID] = true
		if err := ValidateSemanticNode(node, authority); err != nil {
			return nil, err
		}
	}
	return nodeIDs, nil
}

func validateGraphDeltaEdges(payload DirectorGraphUpdatedPayload, authority GraphAuthority) error {
	edgeIDs := make(map[string]bool, len(payload.Edges))
	for _, edge := range payload.Edges {
		if edge.FromWorkstreamID != payload.WorkstreamID {
			return fmt.Errorf(
				"director graph event for workstream %s carries edge %s owned by %q",
				payload.WorkstreamID,
				edge.ID,
				edge.FromWorkstreamID,
			)
		}
		if edgeIDs[edge.ID] {
			return fmt.Errorf("director graph event for workstream %s repeats edge %q", payload.WorkstreamID, edge.ID)
		}
		edgeIDs[edge.ID] = true
		edgeAuthority := authority
		if edge.ToWorkstreamID != payload.WorkstreamID {
			parent := payload.WorkstreamID
			edgeAuthority.WorkstreamParents = map[string]*string{
				payload.WorkstreamID: nil,
				edge.ToWorkstreamID:  &parent,
			}
		}
		if err := ValidateSemanticEdge(edge, edgeAuthority); err != nil {
			return err
		}
	}
	return nil
}

func validateGraphDeltaRemovals(
	payload DirectorGraphUpdatedPayload,
	nodeIDs map[string]bool,
) (map[string]bool, error) {
	removed := make(map[string]bool, len(payload.RemovedNodeIDs))
	for index, nodeID := range payload.RemovedNodeIDs {
		if err := validateIdentifier(fmt.Sprintf("director graph removed node id %d", index), nodeID); err != nil {
			return nil, err
		}
		if removed[nodeID] {
			return nil, fmt.Errorf("director graph event for workstream %s repeats removed node %q", payload.WorkstreamID, nodeID)
		}
		if nodeIDs[nodeID] {
			return nil, fmt.Errorf("director graph event for workstream %s both updates and removes node %q", payload.WorkstreamID, nodeID)
		}
		removed[nodeID] = true
	}
	return removed, nil
}

func validateGraphDeltaRemovedReferences(
	payload DirectorGraphUpdatedPayload,
	removed map[string]bool,
) error {
	for _, edge := range payload.Edges {
		if removed[edge.FromNodeID] ||
			(edge.ToWorkstreamID == payload.WorkstreamID && removed[edge.ToNodeID]) {
			return fmt.Errorf("director graph event edge %s references a node removed by the same event", edge.ID)
		}
	}
	return nil
}

func validateTextDeltaPayload(payload DirectorTextDeltaPayload) error {
	if err := validateIdentifier("director text delta workstream id", payload.WorkstreamID); err != nil {
		return err
	}
	if err := validateOptionalRunID("director text delta run id", payload.RunID); err != nil {
		return err
	}
	for _, candidate := range directorTextSurfaces {
		if candidate == payload.Surface {
			if payload.Text == "" {
				return fmt.Errorf("director text delta for workstream %s is empty", payload.WorkstreamID)
			}
			return nil
		}
	}
	return fmt.Errorf("unknown director text surface %q", payload.Surface)
}

func validateResyncPayload(payload DirectorResyncRequiredPayload) error {
	known := false
	for _, candidate := range directorResyncReasons {
		if candidate == payload.Reason {
			known = true
			break
		}
	}
	if !known {
		return fmt.Errorf("unknown director resync reason %q", payload.Reason)
	}
	if err := validateDirectorStreamID("director resync requested stream id", payload.RequestedStreamID); err != nil {
		return err
	}
	if err := validateDirectorStreamID("director resync current stream id", payload.CurrentStreamID); err != nil {
		return err
	}
	if payload.RequestedSequence < 0 {
		return fmt.Errorf("director resync requested sequence must be non-negative: %d", payload.RequestedSequence)
	}
	if payload.CurrentSequence < 0 {
		return fmt.Errorf("director resync current sequence must be non-negative: %d", payload.CurrentSequence)
	}
	return nil
}
