package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

const (
	defaultSemanticWorkingSetLimit = 40
	maxSemanticWorkingSetLimit     = 120
)

type SemanticWorkingSetFilter struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Limit               int    `json:"limit"`
}

type SemanticWorkingSet struct {
	WorkspaceID               string                                 `json:"workspaceId"`
	WorkflowExecutionID       string                                 `json:"workflowExecutionId"`
	ChatRunID                 string                                 `json:"chatRunId"`
	ActiveWorkflowNodeIDs     []string                               `json:"activeWorkflowNodeIds"`
	ActiveRunItemIDs          []string                               `json:"activeRunItemIds"`
	ActiveCartographerWindows []SemanticWorkingSetCartographerWindow `json:"activeCartographerWindows"`
	ActiveCartographerRuns    []SemanticWorkingSetCartographerRun    `json:"activeCartographerRuns"`
	RecentCartographerRuns    []SemanticWorkingSetCartographerRun    `json:"recentCartographerRuns"`
	RecentSemanticChanges     []SemanticWorkingSetSemanticChange     `json:"recentSemanticChanges"`
	CandidateTargets          []SemanticWorkingSetCandidateTarget    `json:"candidateTargets"`
	PendingPatchPreviews      []SemanticWorkingSetPatchPreview       `json:"pendingPatchPreviews"`
	LiveSourceRefs            []SemanticWorkingSetLiveSourceRef      `json:"liveSourceRefs"`
	Pulses                    []SemanticWorkingSetPulse              `json:"pulses"`
	LastUpdatedAt             string                                 `json:"lastUpdatedAt"`
}

type SemanticWorkingSetCartographerWindow struct {
	ID                     string                       `json:"id"`
	RunID                  string                       `json:"runId"`
	Status                 SemanticWorkingSetStatus     `json:"status"`
	TriggerKind            CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs             SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID         string                       `json:"targetEntityId"`
	InputItemCounts        CartographerInputItemCounts  `json:"inputItemCounts"`
	ChangedSemanticNodeIDs []string                     `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs []string                     `json:"changedSemanticEdgeIds"`
	PatchOperationNames    []CartographerPatchOperation `json:"patchOperationNames"`
	PublicSummary          string                       `json:"publicSummary"`
	Diagnostics            []CartographerDiagnostic     `json:"diagnostics"`
	OpenedAt               string                       `json:"openedAt"`
	ClosedAt               string                       `json:"closedAt"`
	UpdatedAt              string                       `json:"updatedAt"`
}

type SemanticWorkingSetCartographerRun struct {
	ID                      string                       `json:"id"`
	WindowID                string                       `json:"windowId"`
	Status                  SemanticWorkingSetStatus     `json:"status"`
	TriggerKind             CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs              SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID          string                       `json:"targetEntityId"`
	InputItemCounts         CartographerInputItemCounts  `json:"inputItemCounts"`
	ChangedSemanticNodeIDs  []string                     `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs  []string                     `json:"changedSemanticEdgeIds"`
	PatchOperationNames     []CartographerPatchOperation `json:"patchOperationNames"`
	PublicSummary           string                       `json:"publicSummary"`
	Diagnostics             []CartographerDiagnostic     `json:"diagnostics"`
	CreatedSemanticEventIDs []string                     `json:"createdSemanticEventIds"`
	CreatedAt               string                       `json:"createdAt"`
	StartedAt               string                       `json:"startedAt"`
	CompletedAt             string                       `json:"completedAt"`
	UpdatedAt               string                       `json:"updatedAt"`
}

type SemanticWorkingSetSemanticChange struct {
	ID                      string                       `json:"id"`
	RunID                   string                       `json:"runId"`
	WindowID                string                       `json:"windowId"`
	PatchID                 string                       `json:"patchId"`
	Status                  SemanticWorkingSetStatus     `json:"status"`
	TriggerKind             CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs              SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID          string                       `json:"targetEntityId"`
	ChangedSemanticNodeIDs  []string                     `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs  []string                     `json:"changedSemanticEdgeIds"`
	PatchOperationNames     []CartographerPatchOperation `json:"patchOperationNames"`
	PublicSummary           string                       `json:"publicSummary"`
	Diagnostics             []CartographerDiagnostic     `json:"diagnostics"`
	CreatedSemanticEventIDs []string                     `json:"createdSemanticEventIds"`
	OccurredAt              string                       `json:"occurredAt"`
}

type SemanticWorkingSetCandidateTarget struct {
	TargetEntityID         string                       `json:"targetEntityId"`
	Status                 SemanticWorkingSetStatus     `json:"status"`
	TriggerKind            CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs             SemanticContextSourceRefs    `json:"sourceRefs"`
	RunIDs                 []string                     `json:"runIds"`
	WindowIDs              []string                     `json:"windowIds"`
	PatchIDs               []string                     `json:"patchIds"`
	ChangedSemanticNodeIDs []string                     `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs []string                     `json:"changedSemanticEdgeIds"`
	PatchOperationNames    []CartographerPatchOperation `json:"patchOperationNames"`
	PublicSummaries        []string                     `json:"publicSummaries"`
	Diagnostics            []CartographerDiagnostic     `json:"diagnostics"`
	UpdatedAt              string                       `json:"updatedAt"`
}

type SemanticWorkingSetPatchPreview struct {
	ID                     string                          `json:"id"`
	PatchID                string                          `json:"patchId"`
	RunID                  string                          `json:"runId"`
	WindowID               string                          `json:"windowId"`
	Status                 SemanticWorkingSetStatus        `json:"status"`
	TriggerKind            CartographerRunTriggerKind      `json:"triggerKind"`
	SourceRefs             SemanticContextSourceRefs       `json:"sourceRefs"`
	TargetEntityID         string                          `json:"targetEntityId"`
	Operation              CartographerPatchOperation      `json:"operation"`
	PatchOperationNames    []CartographerPatchOperation    `json:"patchOperationNames"`
	NewNodes               []SemanticWorkingSetPreviewNode `json:"newNodes"`
	ChangedSemanticNodeIDs []string                        `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs []string                        `json:"changedSemanticEdgeIds"`
	PublicSummary          string                          `json:"publicSummary"`
	Diagnostics            []CartographerDiagnostic        `json:"diagnostics"`
	CreatedAt              string                          `json:"createdAt"`
	UpdatedAt              string                          `json:"updatedAt"`
}

type SemanticWorkingSetPreviewNode struct {
	SemanticNodeID string                     `json:"semanticNodeId"`
	Kind           SemanticNodeKind           `json:"kind"`
	Label          string                     `json:"label"`
	Summary        string                     `json:"summary"`
	Scope          CartographerPatchNodeScope `json:"scope"`
}

type SemanticWorkingSetLiveSourceRef struct {
	ID                     string                       `json:"id"`
	Status                 SemanticWorkingSetStatus     `json:"status"`
	TriggerKind            CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs             SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID         string                       `json:"targetEntityId"`
	RunID                  string                       `json:"runId"`
	WindowID               string                       `json:"windowId"`
	PatchID                string                       `json:"patchId"`
	ChangedSemanticNodeIDs []string                     `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs []string                     `json:"changedSemanticEdgeIds"`
	PatchOperationNames    []CartographerPatchOperation `json:"patchOperationNames"`
	PublicSummary          string                       `json:"publicSummary"`
	Diagnostics            []CartographerDiagnostic     `json:"diagnostics"`
	UpdatedAt              string                       `json:"updatedAt"`
}

type semanticWorkingSetRecords struct {
	runs    []CartographerRun
	windows []CartographerWindow
	patches []CartographerPatchRecord
	graph   SemanticGraph
}

//lint:ignore U1000 ReadWorkingSet is reached through httpapi.SemanticGraphService interface dispatch.
func (service *Service) ReadWorkingSet(ctx context.Context, filter SemanticWorkingSetFilter) (SemanticWorkingSet, error) {
	if err := validateSemanticWorkingSetFilter(ctx, filter); err != nil {
		return SemanticWorkingSet{}, err
	}
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return SemanticWorkingSet{}, err
	}
	filter.Limit = normalizedSemanticWorkingSetLimit(filter.Limit)
	records, err := service.loadSemanticWorkingSetRecords(ctx, filter)
	if err != nil {
		return SemanticWorkingSet{}, err
	}
	return service.buildSemanticWorkingSet(filter, records)
}

func (service *Service) loadSemanticWorkingSetRecords(ctx context.Context, filter SemanticWorkingSetFilter) (semanticWorkingSetRecords, error) {
	runs, err := service.store.ListCartographerRuns(ctx, CartographerRunFilter{
		WorkspaceID:         filter.WorkspaceID,
		WorkflowExecutionID: filter.WorkflowExecutionID,
		ChatRunID:           filter.ChatRunID,
		Limit:               filter.Limit,
	})
	if err != nil {
		return semanticWorkingSetRecords{}, err
	}
	windows, err := service.store.ListCartographerWindows(ctx, CartographerWindowFilter{
		WorkspaceID:         filter.WorkspaceID,
		WorkflowExecutionID: filter.WorkflowExecutionID,
		ChatRunID:           filter.ChatRunID,
		Limit:               filter.Limit,
	})
	if err != nil {
		return semanticWorkingSetRecords{}, err
	}
	graph, err := service.store.ReadGraph(ctx, filter.WorkspaceID)
	if err != nil {
		return semanticWorkingSetRecords{}, err
	}
	patches, err := service.semanticWorkingSetPatches(ctx, filter, runs.Runs)
	if err != nil {
		return semanticWorkingSetRecords{}, err
	}
	return semanticWorkingSetRecords{
		runs:    runs.Runs,
		windows: windows.Windows,
		patches: patches,
		graph:   graph,
	}, nil
}

func (service *Service) buildSemanticWorkingSet(filter SemanticWorkingSetFilter, records semanticWorkingSetRecords) (SemanticWorkingSet, error) {
	runByID := semanticWorkingSetRunsByID(records.runs)
	patchesByRunID := semanticWorkingSetPatchesByRunID(records.patches)
	committedNodeIDs := semanticWorkingSetCommittedNodeIDs(records.graph)
	builder := newSemanticWorkingSetBuilder(filter, timestamp(service.now()))
	for _, window := range records.windows {
		run := runByID[window.RunID]
		if err := builder.addWindow(window, run); err != nil {
			return SemanticWorkingSet{}, err
		}
	}
	for _, run := range records.runs {
		if err := builder.addRun(run, patchesByRunID[run.ID]); err != nil {
			return SemanticWorkingSet{}, err
		}
	}
	for _, patch := range records.patches {
		run := runByID[patch.RunID]
		if err := builder.addPatch(patch, run, committedNodeIDs); err != nil {
			return SemanticWorkingSet{}, err
		}
	}
	builder.addGraphRecencyPulses(records.graph)
	return builder.finish(), nil
}

func (service *Service) semanticWorkingSetPatches(ctx context.Context, filter SemanticWorkingSetFilter, runs []CartographerRun) ([]CartographerPatchRecord, error) {
	seen := map[string]bool{}
	patches := []CartographerPatchRecord{}
	for _, run := range runs {
		page, err := service.store.ListCartographerPatches(ctx, CartographerPatchFilter{
			WorkspaceID: filter.WorkspaceID,
			RunID:       run.ID,
			Limit:       filter.Limit,
		})
		if err != nil {
			return nil, err
		}
		for _, patch := range page.Patches {
			if seen[patch.ID] {
				continue
			}
			seen[patch.ID] = true
			patches = append(patches, patch)
			if len(patches) >= filter.Limit {
				return patches, nil
			}
		}
	}
	return patches, nil
}

type semanticWorkingSetBuilder struct {
	filter               SemanticWorkingSetFilter
	fallbackUpdatedAt    string
	lastUpdatedAt        string
	activeWorkflowNodes  map[string]bool
	activeRunItems       map[string]bool
	liveSourceRefsByID   map[string]SemanticWorkingSetLiveSourceRef
	candidateTargetsByID map[string]*SemanticWorkingSetCandidateTarget
	pulsesByID           map[string]SemanticWorkingSetPulse
	workingSet           SemanticWorkingSet
}

func newSemanticWorkingSetBuilder(filter SemanticWorkingSetFilter, fallbackUpdatedAt string) *semanticWorkingSetBuilder {
	return &semanticWorkingSetBuilder{
		filter:               filter,
		fallbackUpdatedAt:    fallbackUpdatedAt,
		activeWorkflowNodes:  map[string]bool{},
		activeRunItems:       map[string]bool{},
		liveSourceRefsByID:   map[string]SemanticWorkingSetLiveSourceRef{},
		candidateTargetsByID: map[string]*SemanticWorkingSetCandidateTarget{},
		pulsesByID:           map[string]SemanticWorkingSetPulse{},
		workingSet: SemanticWorkingSet{
			WorkspaceID:               filter.WorkspaceID,
			WorkflowExecutionID:       filter.WorkflowExecutionID,
			ChatRunID:                 filter.ChatRunID,
			ActiveWorkflowNodeIDs:     []string{},
			ActiveRunItemIDs:          []string{},
			ActiveCartographerWindows: []SemanticWorkingSetCartographerWindow{},
			ActiveCartographerRuns:    []SemanticWorkingSetCartographerRun{},
			RecentCartographerRuns:    []SemanticWorkingSetCartographerRun{},
			RecentSemanticChanges:     []SemanticWorkingSetSemanticChange{},
			CandidateTargets:          []SemanticWorkingSetCandidateTarget{},
			PendingPatchPreviews:      []SemanticWorkingSetPatchPreview{},
			LiveSourceRefs:            []SemanticWorkingSetLiveSourceRef{},
			Pulses:                    []SemanticWorkingSetPulse{},
		},
	}
}

func (builder *semanticWorkingSetBuilder) addWindow(window CartographerWindow, run CartographerRun) error {
	status, err := semanticWorkingSetStatusFromWindow(window.Status)
	if err != nil {
		return err
	}
	if status != WorkingSetStatusWindowOpen {
		return nil
	}
	trigger := run.TriggerKind
	if trigger == "" {
		trigger = window.InputBundle.TriggerKind
	}
	changedNodeIDs, changedEdgeIDs, operations := semanticWorkingSetPatchSummary(nil)
	item := SemanticWorkingSetCartographerWindow{
		ID:                     window.ID,
		RunID:                  window.RunID,
		Status:                 status,
		TriggerKind:            trigger,
		SourceRefs:             window.InputBundle.SourceRefs,
		TargetEntityID:         firstNonEmpty(window.InputBundle.TargetEntityID, run.TargetEntityID),
		InputItemCounts:        cartographerInputItemCounts(window.InputBundle),
		ChangedSemanticNodeIDs: changedNodeIDs,
		ChangedSemanticEdgeIDs: changedEdgeIDs,
		PatchOperationNames:    operations,
		PublicSummary:          semanticWorkingSetWindowSummary(window),
		Diagnostics:            []CartographerDiagnostic{},
		OpenedAt:               window.OpenedAt,
		ClosedAt:               window.ClosedAt,
		UpdatedAt:              window.UpdatedAt,
	}
	builder.workingSet.ActiveCartographerWindows = append(builder.workingSet.ActiveCartographerWindows, item)
	builder.recordLiveSourceRef("window", window.ID, item.Status, item.TriggerKind, item.SourceRefs, item.TargetEntityID, item.RunID, item.ID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.UpdatedAt)
	builder.recordCandidateTarget(item.TargetEntityID, item.Status, item.TriggerKind, item.SourceRefs, item.RunID, item.ID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.UpdatedAt)
	builder.recordActiveWorkflowSourcePulse("window", window.ID, item.Status, item.TriggerKind, item.SourceRefs, item.TargetEntityID, item.RunID, item.ID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.OpenedAt, item.UpdatedAt)
	builder.recordPulse(WorkingSetPulseCartographerObserving, "window:"+window.ID, item.Status, ActivityKindExploring, item.TriggerKind, item.SourceRefs, item.TargetEntityID, item.RunID, item.ID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, nil, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.OpenedAt, item.UpdatedAt)
	builder.recordLastUpdatedAt(window.UpdatedAt)
	return nil
}

func (builder *semanticWorkingSetBuilder) addRun(run CartographerRun, patches []CartographerPatchRecord) error {
	status, err := semanticWorkingSetStatusFromRun(run.Status)
	if err != nil {
		return err
	}
	changedNodeIDs, changedEdgeIDs, operations := semanticWorkingSetPatchSummary(patches)
	item := SemanticWorkingSetCartographerRun{
		ID:                      run.ID,
		WindowID:                run.WindowID,
		Status:                  status,
		TriggerKind:             run.TriggerKind,
		SourceRefs:              run.SourceRefs,
		TargetEntityID:          run.TargetEntityID,
		InputItemCounts:         run.InputItemCounts,
		ChangedSemanticNodeIDs:  changedNodeIDs,
		ChangedSemanticEdgeIDs:  changedEdgeIDs,
		PatchOperationNames:     operations,
		PublicSummary:           run.TrajectorySummary,
		Diagnostics:             nonNilSlice(run.Diagnostics),
		CreatedSemanticEventIDs: nonNilSlice(run.CreatedSemanticEventIDs),
		CreatedAt:               run.CreatedAt,
		StartedAt:               run.StartedAt,
		CompletedAt:             run.CompletedAt,
		UpdatedAt:               run.UpdatedAt,
	}
	if semanticWorkingSetStatusIsActive(status) {
		builder.workingSet.ActiveCartographerRuns = append(builder.workingSet.ActiveCartographerRuns, item)
		builder.recordLiveSourceRef("run", run.ID, item.Status, item.TriggerKind, item.SourceRefs, item.TargetEntityID, item.ID, item.WindowID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.UpdatedAt)
		builder.recordActiveWorkflowSourcePulse("run", run.ID, item.Status, item.TriggerKind, item.SourceRefs, item.TargetEntityID, item.ID, item.WindowID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.StartedAt, item.UpdatedAt)
		if status == WorkingSetStatusRunning {
			builder.recordPulse(WorkingSetPulseCartographerRunning, "run:"+run.ID, item.Status, ActivityKindExploring, item.TriggerKind, item.SourceRefs, item.TargetEntityID, item.ID, item.WindowID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, nil, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.StartedAt, item.UpdatedAt)
		}
	} else {
		builder.workingSet.RecentCartographerRuns = append(builder.workingSet.RecentCartographerRuns, item)
	}
	builder.recordCandidateTarget(item.TargetEntityID, item.Status, item.TriggerKind, item.SourceRefs, item.ID, item.WindowID, "", item.ChangedSemanticNodeIDs, item.ChangedSemanticEdgeIDs, item.PatchOperationNames, item.PublicSummary, item.Diagnostics, item.UpdatedAt)
	builder.recordLastUpdatedAt(run.UpdatedAt)
	return nil
}

func (builder *semanticWorkingSetBuilder) addPatch(patch CartographerPatchRecord, run CartographerRun, committedNodeIDs map[string]bool) error {
	status, err := semanticWorkingSetStatusFromPatch(patch.Status)
	if err != nil {
		return err
	}
	changedNodeIDs, changedEdgeIDs, operations := semanticWorkingSetPatchSummary([]CartographerPatchRecord{patch})
	diagnostics := semanticWorkingSetPatchDiagnostics(patch)
	targetEntityID := semanticWorkingSetPatchTargetEntityID(patch.Patch)
	updatedAt := firstNonEmpty(patch.AppliedAt, patch.ValidatedAt, patch.CreatedAt)
	change := SemanticWorkingSetSemanticChange{
		ID:                      "semantic-working-set-change:" + patch.ID,
		RunID:                   patch.RunID,
		WindowID:                patch.WindowID,
		PatchID:                 patch.ID,
		Status:                  status,
		TriggerKind:             run.TriggerKind,
		SourceRefs:              patch.Patch.SourceRefs,
		TargetEntityID:          targetEntityID,
		ChangedSemanticNodeIDs:  changedNodeIDs,
		ChangedSemanticEdgeIDs:  changedEdgeIDs,
		PatchOperationNames:     operations,
		PublicSummary:           patch.Patch.PublicSummary,
		Diagnostics:             diagnostics,
		CreatedSemanticEventIDs: nonNilSlice(patch.CreatedSemanticEventIDs),
		OccurredAt:              updatedAt,
	}
	builder.workingSet.RecentSemanticChanges = append(builder.workingSet.RecentSemanticChanges, change)
	builder.recordCandidateTarget(targetEntityID, status, run.TriggerKind, patch.Patch.SourceRefs, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, operations, patch.Patch.PublicSummary, diagnostics, updatedAt)
	if semanticWorkingSetStatusIsActive(status) {
		builder.recordLiveSourceRef("patch", patch.ID, status, run.TriggerKind, patch.Patch.SourceRefs, targetEntityID, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, operations, patch.Patch.PublicSummary, diagnostics, updatedAt)
		builder.recordActiveWorkflowSourcePulse("patch", patch.ID, status, run.TriggerKind, patch.Patch.SourceRefs, targetEntityID, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, operations, patch.Patch.PublicSummary, diagnostics, patch.CreatedAt, updatedAt)
	}
	if semanticWorkingSetPatchPreviewIsPending(status) {
		builder.recordPulse(WorkingSetPulsePatchProposed, "patch:"+patch.ID, status, ActivityKindEditing, run.TriggerKind, patch.Patch.SourceRefs, targetEntityID, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, semanticWorkingSetPatchEvidenceAnchorIDs(patch.Patch), operations, patch.Patch.PublicSummary, diagnostics, patch.CreatedAt, updatedAt)
		preview := semanticWorkingSetPatchPreview(patch, run.TriggerKind, status, changedNodeIDs, changedEdgeIDs, operations, diagnostics, committedNodeIDs)
		if len(preview.NewNodes) > 0 {
			builder.workingSet.PendingPatchPreviews = append(builder.workingSet.PendingPatchPreviews, preview)
		}
	}
	if status == WorkingSetStatusApplied {
		builder.recordAppliedPatchPulses(patch, run, targetEntityID, changedNodeIDs, changedEdgeIDs, operations, diagnostics, updatedAt)
	}
	builder.recordLastUpdatedAt(updatedAt)
	return nil
}

func (builder *semanticWorkingSetBuilder) recordLiveSourceRef(prefix string, id string, status SemanticWorkingSetStatus, trigger CartographerRunTriggerKind, refs SemanticContextSourceRefs, targetEntityID string, runID string, windowID string, patchID string, changedNodeIDs []string, changedEdgeIDs []string, operations []CartographerPatchOperation, summary string, diagnostics []CartographerDiagnostic, updatedAt string) {
	if semanticWorkingSetSourceRefsEmpty(refs) && targetEntityID == "" {
		return
	}
	sourceID := fmt.Sprintf("semantic-working-set-source:%s:%s", prefix, id)
	builder.liveSourceRefsByID[sourceID] = SemanticWorkingSetLiveSourceRef{
		ID:                     sourceID,
		Status:                 status,
		TriggerKind:            trigger,
		SourceRefs:             refs,
		TargetEntityID:         targetEntityID,
		RunID:                  runID,
		WindowID:               windowID,
		PatchID:                patchID,
		ChangedSemanticNodeIDs: uniqueSortedStrings(changedNodeIDs),
		ChangedSemanticEdgeIDs: uniqueSortedStrings(changedEdgeIDs),
		PatchOperationNames:    uniqueCartographerPatchOperations(operations),
		PublicSummary:          summary,
		Diagnostics:            nonNilSlice(diagnostics),
		UpdatedAt:              updatedAt,
	}
	if semanticWorkingSetStatusIsActive(status) {
		if refs.WorkflowNodeID != "" {
			builder.activeWorkflowNodes[refs.WorkflowNodeID] = true
		}
		if refs.RunItemID != "" {
			builder.activeRunItems[refs.RunItemID] = true
		}
	}
}

func (builder *semanticWorkingSetBuilder) recordCandidateTarget(targetEntityID string, status SemanticWorkingSetStatus, trigger CartographerRunTriggerKind, refs SemanticContextSourceRefs, runID string, windowID string, patchID string, changedNodeIDs []string, changedEdgeIDs []string, operations []CartographerPatchOperation, summary string, diagnostics []CartographerDiagnostic, updatedAt string) {
	if targetEntityID == "" {
		return
	}
	target := builder.candidateTargetsByID[targetEntityID]
	if target == nil {
		target = &SemanticWorkingSetCandidateTarget{
			TargetEntityID:         targetEntityID,
			Status:                 status,
			TriggerKind:            trigger,
			SourceRefs:             refs,
			RunIDs:                 []string{},
			WindowIDs:              []string{},
			PatchIDs:               []string{},
			ChangedSemanticNodeIDs: []string{},
			ChangedSemanticEdgeIDs: []string{},
			PatchOperationNames:    []CartographerPatchOperation{},
			PublicSummaries:        []string{},
			Diagnostics:            []CartographerDiagnostic{},
			UpdatedAt:              updatedAt,
		}
		builder.candidateTargetsByID[targetEntityID] = target
	}
	if semanticWorkingSetStatusRank(status) > semanticWorkingSetStatusRank(target.Status) {
		target.Status = status
		target.TriggerKind = trigger
		target.SourceRefs = refs
	}
	target.RunIDs = appendIfNonEmpty(target.RunIDs, runID)
	target.WindowIDs = appendIfNonEmpty(target.WindowIDs, windowID)
	target.PatchIDs = appendIfNonEmpty(target.PatchIDs, patchID)
	target.ChangedSemanticNodeIDs = append(target.ChangedSemanticNodeIDs, changedNodeIDs...)
	target.ChangedSemanticEdgeIDs = append(target.ChangedSemanticEdgeIDs, changedEdgeIDs...)
	target.PatchOperationNames = append(target.PatchOperationNames, operations...)
	target.PublicSummaries = appendIfNonEmpty(target.PublicSummaries, summary)
	target.Diagnostics = append(target.Diagnostics, diagnostics...)
	if updatedAt > target.UpdatedAt {
		target.UpdatedAt = updatedAt
	}
}

func (builder *semanticWorkingSetBuilder) recordLastUpdatedAt(value string) {
	if value > builder.lastUpdatedAt {
		builder.lastUpdatedAt = value
	}
}

func (builder *semanticWorkingSetBuilder) finish() SemanticWorkingSet {
	builder.workingSet.ActiveWorkflowNodeIDs = sortedKeys(builder.activeWorkflowNodes)
	builder.workingSet.ActiveRunItemIDs = sortedKeys(builder.activeRunItems)
	liveSourceIDs := make([]string, 0, len(builder.liveSourceRefsByID))
	for id := range builder.liveSourceRefsByID {
		liveSourceIDs = append(liveSourceIDs, id)
	}
	sort.Strings(liveSourceIDs)
	for _, id := range liveSourceIDs {
		builder.workingSet.LiveSourceRefs = append(builder.workingSet.LiveSourceRefs, builder.liveSourceRefsByID[id])
	}
	targetIDs := make([]string, 0, len(builder.candidateTargetsByID))
	for id := range builder.candidateTargetsByID {
		targetIDs = append(targetIDs, id)
	}
	sort.Strings(targetIDs)
	for _, id := range targetIDs {
		target := *builder.candidateTargetsByID[id]
		target.RunIDs = uniqueSortedStrings(target.RunIDs)
		target.WindowIDs = uniqueSortedStrings(target.WindowIDs)
		target.PatchIDs = uniqueSortedStrings(target.PatchIDs)
		target.ChangedSemanticNodeIDs = uniqueSortedStrings(target.ChangedSemanticNodeIDs)
		target.ChangedSemanticEdgeIDs = uniqueSortedStrings(target.ChangedSemanticEdgeIDs)
		target.PatchOperationNames = uniqueCartographerPatchOperations(target.PatchOperationNames)
		target.PublicSummaries = uniqueSortedStrings(target.PublicSummaries)
		target.Diagnostics = nonNilSlice(target.Diagnostics)
		builder.workingSet.CandidateTargets = append(builder.workingSet.CandidateTargets, target)
	}
	builder.finishPulses()
	if builder.lastUpdatedAt == "" {
		builder.lastUpdatedAt = builder.fallbackUpdatedAt
	}
	builder.workingSet.LastUpdatedAt = builder.lastUpdatedAt
	return builder.workingSet
}

func validateSemanticWorkingSetFilter(ctx context.Context, filter SemanticWorkingSetFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: "semantic working set workflow execution id", value: filter.WorkflowExecutionID},
		{label: "semantic working set chat run id", value: filter.ChatRunID},
	})
}

func normalizedSemanticWorkingSetLimit(limit int) int {
	if limit <= 0 {
		return defaultSemanticWorkingSetLimit
	}
	if limit > maxSemanticWorkingSetLimit {
		return maxSemanticWorkingSetLimit
	}
	return limit
}

func semanticWorkingSetStatusFromRun(status CartographerRunStatus) (SemanticWorkingSetStatus, error) {
	switch status {
	case CartographerRunQueued:
		return WorkingSetStatusQueued, nil
	case CartographerRunRunning:
		return WorkingSetStatusRunning, nil
	case CartographerRunPendingReview:
		return WorkingSetStatusPendingReview, nil
	case CartographerRunApplied:
		return WorkingSetStatusApplied, nil
	case CartographerRunCompletedNoop:
		return WorkingSetStatusNoop, nil
	case CartographerRunRejected:
		return WorkingSetStatusRejected, nil
	case CartographerRunFailed:
		return WorkingSetStatusFailed, nil
	case CartographerRunSuperseded, CartographerRunCancelled, CartographerRunAbandoned:
		return WorkingSetStatusSuperseded, nil
	default:
		return "", fmt.Errorf("unsupported cartographer run status for semantic working set: %s", status)
	}
}

func semanticWorkingSetStatusFromWindow(status CartographerWindowStatus) (SemanticWorkingSetStatus, error) {
	switch status {
	case CartographerWindowOpen:
		return WorkingSetStatusWindowOpen, nil
	case CartographerWindowClosed, CartographerWindowProcessed:
		return WorkingSetStatusSuperseded, nil
	default:
		return "", fmt.Errorf("unsupported cartographer window status for semantic working set: %s", status)
	}
}

func semanticWorkingSetStatusFromPatch(status CartographerPatchStatus) (SemanticWorkingSetStatus, error) {
	switch status {
	case CartographerPatchProposed, CartographerPatchValidated:
		return WorkingSetStatusProposing, nil
	case CartographerPatchPendingReview:
		return WorkingSetStatusPendingReview, nil
	case CartographerPatchRejected:
		return WorkingSetStatusRejected, nil
	case CartographerPatchApplied:
		return WorkingSetStatusApplied, nil
	default:
		return "", fmt.Errorf("unsupported cartographer patch status for semantic working set: %s", status)
	}
}

func semanticWorkingSetStatusIsActive(status SemanticWorkingSetStatus) bool {
	switch status {
	case WorkingSetStatusObserving, WorkingSetStatusWindowOpen, WorkingSetStatusQueued, WorkingSetStatusRunning, WorkingSetStatusProposing, WorkingSetStatusApplying, WorkingSetStatusPendingReview:
		return true
	case WorkingSetStatusApplied, WorkingSetStatusNoop, WorkingSetStatusRejected, WorkingSetStatusFailed, WorkingSetStatusSuperseded:
		return false
	default:
		return false
	}
}

func semanticWorkingSetPatchPreviewIsPending(status SemanticWorkingSetStatus) bool {
	switch status {
	case WorkingSetStatusProposing, WorkingSetStatusApplying, WorkingSetStatusPendingReview:
		return true
	default:
		return false
	}
}

func semanticWorkingSetStatusRank(status SemanticWorkingSetStatus) int {
	switch status {
	case WorkingSetStatusFailed:
		return 90
	case WorkingSetStatusApplying:
		return 80
	case WorkingSetStatusPendingReview:
		return 70
	case WorkingSetStatusProposing:
		return 60
	case WorkingSetStatusRunning:
		return 50
	case WorkingSetStatusQueued:
		return 40
	case WorkingSetStatusWindowOpen:
		return 30
	case WorkingSetStatusObserving:
		return 20
	case WorkingSetStatusApplied, WorkingSetStatusNoop, WorkingSetStatusRejected, WorkingSetStatusSuperseded:
		return 10
	default:
		return 0
	}
}

func semanticWorkingSetActivityKindForStatus(status SemanticWorkingSetStatus) SemanticActivityKind {
	switch status {
	case WorkingSetStatusFailed:
		return ActivityKindBlocked
	case WorkingSetStatusRejected, WorkingSetStatusSuperseded:
		return ActivityKindDebugging
	case WorkingSetStatusProposing, WorkingSetStatusApplying, WorkingSetStatusPendingReview:
		return ActivityKindEditing
	case WorkingSetStatusApplied, WorkingSetStatusNoop:
		return ActivityKindValidating
	default:
		return ActivityKindExploring
	}
}

func semanticWorkingSetPatchSummary(patches []CartographerPatchRecord) ([]string, []string, []CartographerPatchOperation) {
	nodeIDs := []string{}
	edgeIDs := []string{}
	operations := []CartographerPatchOperation{}
	for _, patch := range patches {
		operations = append(operations, patch.Patch.Operation)
		nodes, edges := semanticWorkingSetPatchChangedIDs(patch.Patch)
		nodeIDs = append(nodeIDs, nodes...)
		edgeIDs = append(edgeIDs, edges...)
	}
	return uniqueSortedStrings(nodeIDs), uniqueSortedStrings(edgeIDs), uniqueCartographerPatchOperations(operations)
}

func semanticWorkingSetPatchChangedIDs(patch CartographerPatch) ([]string, []string) {
	payload := patch.Payload
	nodeIDs := []string{
		payload.SemanticNodeID,
		payload.TargetEntityID,
		payload.FromNodeID,
		payload.ToNodeID,
		payload.SourceNodeID,
		payload.ResolutionNodeID,
	}
	if payload.NewNode != nil {
		nodeIDs = append(nodeIDs, payload.NewNode.SemanticNodeID)
	}
	if payload.TargetNode != nil {
		nodeIDs = append(nodeIDs, payload.TargetNode.SemanticNodeID)
	}
	for _, node := range payload.NewNodes {
		nodeIDs = append(nodeIDs, node.SemanticNodeID)
	}
	nodeIDs = append(nodeIDs, payload.SourceNodeIDs...)
	return uniqueSortedStrings(nodeIDs), uniqueSortedStrings([]string{payload.EdgeID})
}

func semanticWorkingSetPatchDiagnostics(patch CartographerPatchRecord) []CartographerDiagnostic {
	diagnostics := []CartographerDiagnostic{}
	diagnostics = append(diagnostics, patch.ValidationResult.Diagnostics...)
	diagnostics = append(diagnostics, patch.ApplicationResult.Diagnostics...)
	return nonNilSlice(diagnostics)
}

func semanticWorkingSetPatchTargetEntityID(patch CartographerPatch) string {
	if patch.Payload.TargetEntityID != "" {
		return patch.Payload.TargetEntityID
	}
	if patch.Payload.SemanticNodeID != "" {
		return patch.Payload.SemanticNodeID
	}
	if patch.Payload.NewNode != nil {
		return patch.Payload.NewNode.SemanticNodeID
	}
	if patch.Payload.TargetNode != nil {
		return patch.Payload.TargetNode.SemanticNodeID
	}
	if len(patch.Payload.NewNodes) > 0 {
		return patch.Payload.NewNodes[0].SemanticNodeID
	}
	return ""
}

func semanticWorkingSetPatchPreview(patch CartographerPatchRecord, trigger CartographerRunTriggerKind, status SemanticWorkingSetStatus, changedNodeIDs []string, changedEdgeIDs []string, operations []CartographerPatchOperation, diagnostics []CartographerDiagnostic, committedNodeIDs map[string]bool) SemanticWorkingSetPatchPreview {
	newNodes := []SemanticWorkingSetPreviewNode{}
	for _, node := range semanticWorkingSetPatchNewNodes(patch.Patch) {
		if node.SemanticNodeID == "" || committedNodeIDs[node.SemanticNodeID] {
			continue
		}
		newNodes = append(newNodes, SemanticWorkingSetPreviewNode{
			SemanticNodeID: node.SemanticNodeID,
			Kind:           node.Kind,
			Label:          node.Label,
			Summary:        node.Summary,
			Scope:          node.Scope,
		})
	}
	updatedAt := firstNonEmpty(patch.ValidatedAt, patch.CreatedAt)
	return SemanticWorkingSetPatchPreview{
		ID:                     "semantic-working-set-preview:" + patch.ID,
		PatchID:                patch.ID,
		RunID:                  patch.RunID,
		WindowID:               patch.WindowID,
		Status:                 status,
		TriggerKind:            trigger,
		SourceRefs:             patch.Patch.SourceRefs,
		TargetEntityID:         semanticWorkingSetPatchTargetEntityID(patch.Patch),
		Operation:              patch.Patch.Operation,
		PatchOperationNames:    uniqueCartographerPatchOperations(operations),
		NewNodes:               newNodes,
		ChangedSemanticNodeIDs: uniqueSortedStrings(changedNodeIDs),
		ChangedSemanticEdgeIDs: uniqueSortedStrings(changedEdgeIDs),
		PublicSummary:          patch.Patch.PublicSummary,
		Diagnostics:            nonNilSlice(diagnostics),
		CreatedAt:              patch.CreatedAt,
		UpdatedAt:              updatedAt,
	}
}

func semanticWorkingSetPatchNewNodes(patch CartographerPatch) []CartographerPatchNewNode {
	nodes := []CartographerPatchNewNode{}
	if patch.Payload.NewNode != nil {
		nodes = append(nodes, *patch.Payload.NewNode)
	}
	nodes = append(nodes, patch.Payload.NewNodes...)
	if patch.Payload.TargetNode != nil && patch.Payload.TargetNode.SemanticNodeID != "" {
		nodes = append(nodes, *patch.Payload.TargetNode)
	}
	return nodes
}

func semanticWorkingSetPatchesByRunID(patches []CartographerPatchRecord) map[string][]CartographerPatchRecord {
	result := map[string][]CartographerPatchRecord{}
	for _, patch := range patches {
		result[patch.RunID] = append(result[patch.RunID], patch)
	}
	return result
}

func semanticWorkingSetRunsByID(runs []CartographerRun) map[string]CartographerRun {
	result := map[string]CartographerRun{}
	for _, run := range runs {
		result[run.ID] = run
	}
	return result
}

func semanticWorkingSetCommittedNodeIDs(graph SemanticGraph) map[string]bool {
	result := map[string]bool{}
	for _, node := range graph.Nodes {
		result[node.ID] = true
	}
	return result
}

func semanticWorkingSetWindowSummary(window CartographerWindow) string {
	if summary := firstNonEmpty(window.InputBundle.PromptSummary, window.InputBundle.AssistantResponseSummary, window.InputBundle.Truncation.DeterministicSummary); summary != "" {
		return summary
	}
	for _, event := range window.InputBundle.NewEvents {
		if event.Summary != "" {
			return event.Summary
		}
	}
	for _, observation := range window.InputBundle.Observations {
		if observation.Summary != "" {
			return observation.Summary
		}
	}
	return ""
}

func semanticWorkingSetSourceRefsEmpty(refs SemanticContextSourceRefs) bool {
	return refs.WorkflowDefinitionID == "" &&
		refs.WorkflowExecutionID == "" &&
		refs.WorkflowNodeID == "" &&
		refs.WorkflowNodeExecutionID == "" &&
		refs.ChatConversationID == "" &&
		refs.ChatRunID == "" &&
		refs.ChatMessageID == "" &&
		refs.RunItemID == ""
}

func appendIfNonEmpty(values []string, value string) []string {
	if value == "" {
		return values
	}
	return append(values, value)
}

func sortedKeys(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func uniqueSortedStrings(values []string) []string {
	seen := map[string]bool{}
	for _, value := range values {
		if value != "" {
			seen[value] = true
		}
	}
	return sortedKeys(seen)
}

func uniqueCartographerPatchOperations(values []CartographerPatchOperation) []CartographerPatchOperation {
	seen := map[CartographerPatchOperation]bool{}
	for _, value := range values {
		if value != "" {
			seen[value] = true
		}
	}
	result := make([]CartographerPatchOperation, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		return result[left] < result[right]
	})
	return result
}
