package director

import (
	"fmt"

	"setta/internal/conversation"
)

// The bounded app-scoped snapshot.
//
// One snapshot is everything the command center needs to draw its first frame,
// and its bounds are what keep that cost independent of how much history the app
// holds. Detail level is assigned here rather than persisted, because it is a
// consequence of what the user selected, not a property of a workstream.

// registrySnapshot assembles the cold-start projection at the supplied cursor.
func (state *registryState) registrySnapshot(
	connection DirectorConnectionState,
	cursor DirectorEventCursor,
) (DirectorSnapshot, error) {
	selected := state.activeSelection()
	window := state.snapshotWindow()
	entries, levels, err := state.snapshotEntries(window, selected)
	if err != nil {
		return DirectorSnapshot{}, err
	}
	graphs, err := state.snapshotGraphs(entries)
	if err != nil {
		return DirectorSnapshot{}, err
	}
	snapshot := DirectorSnapshot{
		SchemaVersion:              DirectorContractSchemaVersion,
		SelectedWorkstreamID:       selected,
		Workstreams:                entries,
		HasMoreWorkstreams:         state.aggregates.WorkstreamCount > len(entries),
		Graphs:                     graphs,
		UnresolvedApprovals:        state.snapshotApprovals(levels),
		UnresolvedResourceRequests: state.snapshotResourceRequests(levels),
		Artifacts:                  state.snapshotArtifacts(levels),
		Aggregates:                 state.aggregates,
		Connection:                 connection,
		EventCursor:                cursor,
	}
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		return DirectorSnapshot{}, err
	}
	return snapshot, nil
}

// snapshotWindow orders the registry by recency and bounds it. The selected
// workstream is always inside the window, because a snapshot that selects a
// workstream it does not carry cannot be drawn.
func (state *registryState) snapshotWindow() []*registryWorkstream {
	return boundWorkstreamWindow(
		state.activeRecencyOrdered(),
		MaxSnapshotWorkstreams,
		state.activeSelection(),
	)
}

// snapshotEntries assigns detail levels. The selected workstream renders its
// trajectory, the most recent others render enough to answer whether they need
// the user, and the rest render aggregate status only.
func (state *registryState) snapshotEntries(
	window []*registryWorkstream,
	selected *string,
) ([]DirectorWorkstreamEntry, map[string]WorkstreamDetailLevel, error) {
	entries := make([]DirectorWorkstreamEntry, 0, len(window))
	levels := make(map[string]WorkstreamDetailLevel, len(window))
	adjacent := 0
	selectedFound := false
	for _, workstream := range window {
		level := WorkstreamDetailBackground
		switch {
		case selected != nil && *selected == workstream.record.ID:
			level = WorkstreamDetailSelected
			selectedFound = true
		case adjacent < MaxSnapshotAdjacentGraphs:
			level = WorkstreamDetailAdjacent
			adjacent++
		}
		levels[workstream.record.ID] = level
		entries = append(entries, DirectorWorkstreamEntry{
			Workstream:  cloneWorkstream(workstream.record),
			DetailLevel: level,
		})
	}
	if selected != nil && !selectedFound {
		return nil, nil, fmt.Errorf("selected workstream %s is not in the active registry", *selected)
	}
	return entries, levels, nil
}

// snapshotGraphs carries the Director lane first. The lane is the conversation
// the user is having with the app, so a cold start draws what was said before it
// draws the work that was asked for.
func (state *registryState) snapshotGraphs(entries []DirectorWorkstreamEntry) ([]WorkstreamGraph, error) {
	windowed := make(map[string]bool, len(entries)+1)
	windowed[DirectorLaneID] = true
	for _, entry := range entries {
		windowed[entry.Workstream.ID] = true
	}
	graphs := make([]WorkstreamGraph, 0, len(entries)+1)
	lane, err := state.projector.GraphFor(DirectorLaneID, WorkstreamDetailSelected)
	if err != nil {
		return nil, err
	}
	graphs = append(graphs, graphWithinWorkstreamWindow(lane, windowed))
	for _, entry := range entries {
		if entry.DetailLevel == WorkstreamDetailBackground {
			continue
		}
		graph, err := state.workstreamGraph(entry.Workstream.ID, entry.DetailLevel)
		if err != nil {
			return nil, err
		}
		graphs = append(graphs, graphWithinWorkstreamWindow(graph, windowed))
	}
	return graphs, nil
}

// graphWithinWorkstreamWindow drops only cross-workstream edges whose target
// row is outside this snapshot. The full projector keeps the relationship, but
// a bounded snapshot cannot authorize or draw an endpoint it does not carry.
func graphWithinWorkstreamWindow(
	graph WorkstreamGraph,
	windowed map[string]bool,
) WorkstreamGraph {
	edges := make([]SemanticEdge, 0, len(graph.Edges))
	for _, edge := range graph.Edges {
		if edge.ToWorkstreamID != graph.WorkstreamID && !windowed[edge.ToWorkstreamID] {
			continue
		}
		edges = append(edges, edge)
	}
	graph.Edges = edges
	return graph
}

// workstreamGraph answers with the projection of a registry row. Every
// registered workstream has one, because registration itself is the anchor a
// workstream with no trajectory yet is drawn as.
func (state *registryState) workstreamGraph(
	workstreamID string,
	level WorkstreamDetailLevel,
) (WorkstreamGraph, error) {
	if _, known := state.workstreams[workstreamID]; !known {
		return WorkstreamGraph{}, fmt.Errorf("workstream %s is not in the registry", workstreamID)
	}
	return state.projector.GraphFor(workstreamID, level)
}

// snapshotApprovals lists the oldest unresolved approvals of the windowed
// workstreams. Oldest first, because the one waiting longest is the one holding
// work up.
func (state *registryState) snapshotApprovals(levels map[string]WorkstreamDetailLevel) []ApprovalRequest {
	approvals := make([]ApprovalRequest, 0, MaxSnapshotApprovals)
	for _, approvalID := range state.approvalOrder {
		record, known := state.approvals[approvalID]
		if !known || record.Status != ApprovalStatusPending {
			continue
		}
		if _, windowed := levels[record.WorkstreamID]; !windowed {
			continue
		}
		if len(approvals) == MaxSnapshotApprovals {
			break
		}
		approvals = append(approvals, cloneApprovalRequest(*record))
	}
	return approvals
}

func (state *registryState) snapshotResourceRequests(levels map[string]WorkstreamDetailLevel) []ResourceRequest {
	requests := make([]ResourceRequest, 0, MaxSnapshotResourceRequests)
	for _, requestID := range state.resourceOrder {
		record, known := state.resources[requestID]
		if !known || record.Status != ResourceRequestStatusRequested {
			continue
		}
		if _, windowed := levels[record.WorkstreamID]; !windowed {
			continue
		}
		if len(requests) == MaxSnapshotResourceRequests {
			break
		}
		requests = append(requests, cloneResourceRequest(*record))
	}
	return requests
}

// snapshotArtifacts lists the most recent artifacts of the windowed
// workstreams. Newest first, because the Artifacts rail is about what the work
// just produced.
func (state *registryState) snapshotArtifacts(levels map[string]WorkstreamDetailLevel) []WorkstreamArtifact {
	artifacts := make([]WorkstreamArtifact, 0, MaxSnapshotArtifacts)
	for index := len(state.artifactOrder) - 1; index >= 0; index-- {
		record, known := state.artifacts[state.artifactOrder[index]]
		if !known {
			continue
		}
		if _, windowed := levels[record.WorkstreamID]; !windowed {
			continue
		}
		if len(artifacts) == MaxSnapshotArtifacts {
			break
		}
		artifacts = append(artifacts, cloneWorkstreamArtifact(*record))
	}
	return artifacts
}

func containsWorkstream(window []*registryWorkstream, workstreamID string) bool {
	for _, workstream := range window {
		if workstream.record.ID == workstreamID {
			return true
		}
	}
	return false
}

func cloneApprovalRequest(record ApprovalRequest) ApprovalRequest {
	cloned := record
	cloned.RunID = copyOptionalString(record.RunID)
	cloned.ResolvedAt = copyOptionalString(record.ResolvedAt)
	cloned.Questions = cloneApprovalQuestions(record.Questions)
	cloned.SourceEventIDs = append([]string{}, record.SourceEventIDs...)
	return cloned
}

func cloneResourceRequest(record ResourceRequest) ResourceRequest {
	cloned := record
	cloned.RunID = copyOptionalString(record.RunID)
	cloned.ResolvedAt = copyOptionalString(record.ResolvedAt)
	cloned.SourceEventIDs = append([]string{}, record.SourceEventIDs...)
	if record.ResolvedBinding != nil {
		binding := *record.ResolvedBinding
		cloned.ResolvedBinding = &binding
	}
	return cloned
}

func cloneWorkstreamArtifact(record WorkstreamArtifact) WorkstreamArtifact {
	cloned := record
	cloned.RunID = copyOptionalString(record.RunID)
	cloned.SourceEventIDs = append([]string{}, record.SourceEventIDs...)
	return cloned
}

func cloneApprovalQuestions(
	questions []conversation.TrajectoryApprovalQuestion,
) []conversation.TrajectoryApprovalQuestion {
	cloned := make([]conversation.TrajectoryApprovalQuestion, 0, len(questions))
	for _, question := range questions {
		next := question
		next.Options = append([]string{}, question.Options...)
		cloned = append(cloned, next)
	}
	return cloned
}

func cloneWorkstream(record Workstream) Workstream {
	cloned := record
	cloned.ParentID = copyOptionalString(record.ParentID)
	cloned.ActiveRunID = copyOptionalString(record.ActiveRunID)
	cloned.ResourceScope = cloneResourceScope(record.ResourceScope)
	cloned.ResourceBindings = make([]WorkstreamResourceBinding, 0, len(record.ResourceBindings))
	for _, binding := range record.ResourceBindings {
		cloned.ResourceBindings = append(cloned.ResourceBindings, cloneResourceBinding(binding))
	}
	if record.LastMilestone != nil {
		milestone := *record.LastMilestone
		cloned.LastMilestone = &milestone
	}
	return cloned
}

func cloneResourceScope(scope WorkstreamResourceScope) WorkstreamResourceScope {
	cloned := scope
	if scope.Folder != nil {
		folder := *scope.Folder
		cloned.Folder = &folder
	}
	return cloned
}

func cloneResourceBinding(binding WorkstreamResourceBinding) WorkstreamResourceBinding {
	cloned := binding
	if binding.Folder != nil {
		folder := *binding.Folder
		cloned.Folder = &folder
	}
	return cloned
}
