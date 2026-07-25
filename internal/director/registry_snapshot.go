package director

import "fmt"

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
	window := state.snapshotWindow()
	entries, levels, err := state.snapshotEntries(window)
	if err != nil {
		return DirectorSnapshot{}, err
	}
	graphs, err := state.snapshotGraphs(entries)
	if err != nil {
		return DirectorSnapshot{}, err
	}
	snapshot := DirectorSnapshot{
		SchemaVersion:              DirectorContractSchemaVersion,
		SelectedWorkstreamID:       copyOptionalString(state.selected),
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
	return boundWorkstreamWindow(state.recencyOrdered(), MaxSnapshotWorkstreams, state.selected)
}

// snapshotEntries assigns detail levels. The selected workstream renders its
// trajectory, the most recent others render enough to answer whether they need
// the user, and the rest render aggregate status only.
func (state *registryState) snapshotEntries(
	window []*registryWorkstream,
) ([]DirectorWorkstreamEntry, map[string]WorkstreamDetailLevel, error) {
	entries := make([]DirectorWorkstreamEntry, 0, len(window))
	levels := make(map[string]WorkstreamDetailLevel, len(window))
	adjacent := 0
	selectedFound := false
	for _, workstream := range window {
		level := WorkstreamDetailBackground
		switch {
		case state.selected != nil && *state.selected == workstream.record.ID:
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
	if state.selected != nil && !selectedFound {
		return nil, nil, fmt.Errorf("selected workstream %s is not in the registry", *state.selected)
	}
	return entries, levels, nil
}

func (state *registryState) snapshotGraphs(entries []DirectorWorkstreamEntry) ([]WorkstreamGraph, error) {
	graphs := make([]WorkstreamGraph, 0, len(entries))
	for _, entry := range entries {
		if entry.DetailLevel == WorkstreamDetailBackground {
			continue
		}
		graph, err := state.workstreamGraph(entry.Workstream.ID, entry.DetailLevel)
		if err != nil {
			return nil, err
		}
		graphs = append(graphs, graph)
	}
	return graphs, nil
}

// workstreamGraph answers for a workstream that has produced no graph fact yet
// with an empty graph rather than an error: a registered workstream with no
// trajectory is a real product state, and it is what a new conversation looks
// like before its first turn.
func (state *registryState) workstreamGraph(
	workstreamID string,
	level WorkstreamDetailLevel,
) (WorkstreamGraph, error) {
	workstream, known := state.workstreams[workstreamID]
	if !known {
		return WorkstreamGraph{}, fmt.Errorf("workstream %s is not in the registry", workstreamID)
	}
	if !workstream.projected {
		return WorkstreamGraph{
			WorkstreamID: workstreamID,
			DetailLevel:  level,
			Nodes:        []SemanticNode{},
			Edges:        []SemanticEdge{},
		}, nil
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
