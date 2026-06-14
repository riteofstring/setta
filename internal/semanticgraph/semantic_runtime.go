package semanticgraph

import (
	"context"
	"errors"
)

const (
	defaultSemanticRuntimeLimit              = 24
	maxSemanticRuntimeLimit                  = 80
	semanticRuntimeMaxPatchPreviewNodes      = 4
	semanticRuntimeMaxChangedIDs             = 12
	semanticRuntimeMaxPatchOperations        = 8
	semanticRuntimeMaxCreatedEventIDs        = 8
	semanticRuntimeMaxAggregateEntityRefs    = 8
	semanticRuntimeMaxStatusCounts           = 12
	semanticRuntimeMaxSummaryRunUpdates      = 12
	semanticRuntimeMaxSummaryWindowUpdates   = 12
	semanticRuntimeMaxSummaryPatchPreviews   = 12
	semanticRuntimeMaxSummarySemanticChanges = 16
	semanticRuntimeMaxSummaryAggregates      = 20
)

type SemanticRuntimeChangeArea string

const (
	SemanticRuntimeChangeAreaWorkflow         SemanticRuntimeChangeArea = "workflow"
	SemanticRuntimeChangeAreaCartographer     SemanticRuntimeChangeArea = "cartographer"
	SemanticRuntimeChangeAreaPatches          SemanticRuntimeChangeArea = "patches"
	SemanticRuntimeChangeAreaSemanticActivity SemanticRuntimeChangeArea = "semantic_activity"
	SemanticRuntimeChangeAreaAggregateSources SemanticRuntimeChangeArea = "aggregate_sources"
)

var semanticRuntimeChangeAreaValues = []SemanticRuntimeChangeArea{
	SemanticRuntimeChangeAreaWorkflow,
	SemanticRuntimeChangeAreaCartographer,
	SemanticRuntimeChangeAreaPatches,
	SemanticRuntimeChangeAreaSemanticActivity,
	SemanticRuntimeChangeAreaAggregateSources,
}

type SemanticRuntimeFilter struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Limit               int    `json:"limit"`
}

type SemanticRuntimeSnapshot struct {
	WorkspaceID         string                        `json:"workspaceId"`
	WorkflowExecutionID string                        `json:"workflowExecutionId"`
	ChatRunID           string                        `json:"chatRunId"`
	Revision            int                           `json:"revision"`
	GeneratedAt         string                        `json:"generatedAt"`
	Limits              SemanticRuntimeLimits         `json:"limits"`
	Workflow            SemanticRuntimeWorkflowState  `json:"workflow"`
	Cartographer        SemanticRuntimeCartographer   `json:"cartographer"`
	Patches             []SemanticRuntimePatchPreview `json:"patches"`
	SemanticActivity    SemanticRuntimeActivity       `json:"semanticActivity"`
	DisplayHints        SemanticRuntimeDisplayHints   `json:"displayHints"`
}

type SemanticRuntimeDelta struct {
	WorkspaceID                 string                              `json:"workspaceId"`
	FromRevision                int                                 `json:"fromRevision"`
	ToRevision                  int                                 `json:"toRevision"`
	GeneratedAt                 string                              `json:"generatedAt"`
	ChangedAreas                []SemanticRuntimeChangeArea         `json:"changedAreas"`
	WorkflowNodeUpdates         []SemanticRuntimeWorkflowNode       `json:"workflowNodeUpdates"`
	RunItemUpdates              []SemanticRuntimeRunItem            `json:"runItemUpdates"`
	CartographerRunUpdates      []SemanticRuntimeCartographerRun    `json:"cartographerRunUpdates"`
	CartographerWindowUpdates   []SemanticRuntimeCartographerWindow `json:"cartographerWindowUpdates"`
	PatchPreviewUpdates         []SemanticRuntimePatchPreview       `json:"patchPreviewUpdates"`
	SemanticNodeActivityUpdates []SemanticRuntimeNodeActivity       `json:"semanticNodeActivityUpdates"`
	AggregateSourceUpdates      []SemanticRuntimeSourceAggregate    `json:"aggregateSourceUpdates"`
	SemanticChangeUpdates       []SemanticRuntimeSemanticChange     `json:"semanticChangeUpdates"`
	Removals                    SemanticRuntimeRemovals             `json:"removals"`
}

type SemanticRuntimeLimits struct {
	MaxCartographerRuns       int `json:"maxCartographerRuns"`
	MaxCartographerWindows    int `json:"maxCartographerWindows"`
	MaxPatchPreviews          int `json:"maxPatchPreviews"`
	MaxPatchPreviewNodes      int `json:"maxPatchPreviewNodes"`
	MaxSemanticChanges        int `json:"maxSemanticChanges"`
	MaxAggregateSources       int `json:"maxAggregateSources"`
	MaxChangedIDsPerItem      int `json:"maxChangedIdsPerItem"`
	MaxPatchOperationsPerItem int `json:"maxPatchOperationsPerItem"`
	MaxCreatedEventIDsPerItem int `json:"maxCreatedEventIdsPerItem"`
	MaxAggregateEntityRefs    int `json:"maxAggregateEntityRefs"`
}

type SemanticRuntimeWorkflowState struct {
	ActiveWorkflowNodeIDs     []string                      `json:"activeWorkflowNodeIds"`
	ActiveRunItemIDs          []string                      `json:"activeRunItemIds"`
	WorkflowNodeUpdates       []SemanticRuntimeWorkflowNode `json:"workflowNodeUpdates"`
	RunItemUpdates            []SemanticRuntimeRunItem      `json:"runItemUpdates"`
	HiddenActiveWorkflowNodes int                           `json:"hiddenActiveWorkflowNodes"`
	HiddenActiveRunItems      int                           `json:"hiddenActiveRunItems"`
}

type SemanticRuntimeWorkflowNode struct {
	ID                  string                    `json:"id"`
	WorkflowExecutionID string                    `json:"workflowExecutionId"`
	WorkflowNodeID      string                    `json:"workflowNodeId"`
	Status              SemanticWorkingSetStatus  `json:"status"`
	SourceRefs          SemanticContextSourceRefs `json:"sourceRefs"`
	ActiveSourceCount   int                       `json:"activeSourceCount"`
	RunIDs              []string                  `json:"runIds"`
	WindowIDs           []string                  `json:"windowIds"`
	PatchIDs            []string                  `json:"patchIds"`
	UpdatedAt           string                    `json:"updatedAt"`
}

type SemanticRuntimeRunItem struct {
	ID                string                    `json:"id"`
	RunItemID         string                    `json:"runItemId"`
	Status            SemanticWorkingSetStatus  `json:"status"`
	SourceRefs        SemanticContextSourceRefs `json:"sourceRefs"`
	ActiveSourceCount int                       `json:"activeSourceCount"`
	RunIDs            []string                  `json:"runIds"`
	WindowIDs         []string                  `json:"windowIds"`
	PatchIDs          []string                  `json:"patchIds"`
	UpdatedAt         string                    `json:"updatedAt"`
}

type SemanticRuntimeCartographer struct {
	ActiveRuns              []SemanticRuntimeCartographerRun    `json:"activeRuns"`
	ActiveWindows           []SemanticRuntimeCartographerWindow `json:"activeWindows"`
	StatusCounts            []SemanticRuntimeStatusCount        `json:"statusCounts"`
	HiddenRunCount          int                                 `json:"hiddenRunCount"`
	HiddenWindowCount       int                                 `json:"hiddenWindowCount"`
	HiddenPatchPreviewCount int                                 `json:"hiddenPatchPreviewCount"`
	UpdatedAt               string                              `json:"updatedAt"`
}

type SemanticRuntimeCartographerRun struct {
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
	CreatedSemanticEventIDs []string                     `json:"createdSemanticEventIds"`
	CreatedAt               string                       `json:"createdAt"`
	StartedAt               string                       `json:"startedAt"`
	CompletedAt             string                       `json:"completedAt"`
	UpdatedAt               string                       `json:"updatedAt"`
}

type SemanticRuntimeCartographerWindow struct {
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
	OpenedAt               string                       `json:"openedAt"`
	ClosedAt               string                       `json:"closedAt"`
	UpdatedAt              string                       `json:"updatedAt"`
}

type SemanticRuntimePatchPreview struct {
	ID                     string                       `json:"id"`
	PatchID                string                       `json:"patchId"`
	RunID                  string                       `json:"runId"`
	WindowID               string                       `json:"windowId"`
	Status                 SemanticWorkingSetStatus     `json:"status"`
	TriggerKind            CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs             SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID         string                       `json:"targetEntityId"`
	Operation              CartographerPatchOperation   `json:"operation"`
	PatchOperationNames    []CartographerPatchOperation `json:"patchOperationNames"`
	NewNodes               []SemanticRuntimePreviewNode `json:"newNodes"`
	ChangedSemanticNodeIDs []string                     `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs []string                     `json:"changedSemanticEdgeIds"`
	PublicSummary          string                       `json:"publicSummary"`
	CreatedAt              string                       `json:"createdAt"`
	UpdatedAt              string                       `json:"updatedAt"`
}

type SemanticRuntimePreviewNode struct {
	SemanticNodeID string                     `json:"semanticNodeId"`
	Kind           SemanticNodeKind           `json:"kind"`
	Label          string                     `json:"label"`
	Summary        string                     `json:"summary"`
	Scope          CartographerPatchNodeScope `json:"scope"`
}

type SemanticRuntimeActivity struct {
	RecentSemanticChanges []SemanticRuntimeSemanticChange `json:"recentSemanticChanges"`
	NodeActivity          []SemanticRuntimeNodeActivity   `json:"nodeActivity"`
	HiddenRecentChanges   int                             `json:"hiddenRecentChanges"`
}

type SemanticRuntimeSemanticChange struct {
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
	CreatedSemanticEventIDs []string                     `json:"createdSemanticEventIds"`
	OccurredAt              string                       `json:"occurredAt"`
}

type SemanticRuntimeNodeActivity struct {
	ID                      string   `json:"id"`
	TargetEntityID          string   `json:"targetEntityId"`
	LastSemanticEventID     string   `json:"lastSemanticEventId"`
	ChangedSemanticNodeIDs  []string `json:"changedSemanticNodeIds"`
	ChangedSemanticEdgeIDs  []string `json:"changedSemanticEdgeIds"`
	CreatedSemanticEventIDs []string `json:"createdSemanticEventIds"`
	UpdatedAt               string   `json:"updatedAt"`
}

type SemanticRuntimeDisplayHints struct {
	AggregateSources      []SemanticRuntimeSourceAggregate `json:"aggregateSources"`
	StatusCounts          []SemanticRuntimeStatusCount     `json:"statusCounts"`
	HiddenLiveSourceCount int                              `json:"hiddenLiveSourceCount"`
	CollapsedSourceCount  int                              `json:"collapsedSourceCount"`
}

type SemanticRuntimeSourceAggregate struct {
	ID             string                       `json:"id"`
	SourceRefs     SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID string                       `json:"targetEntityId"`
	Status         SemanticWorkingSetStatus     `json:"status"`
	StatusCounts   []SemanticRuntimeStatusCount `json:"statusCounts"`
	TotalCount     int                          `json:"totalCount"`
	VisibleCount   int                          `json:"visibleCount"`
	HiddenCount    int                          `json:"hiddenCount"`
	RunIDs         []string                     `json:"runIds"`
	WindowIDs      []string                     `json:"windowIds"`
	PatchIDs       []string                     `json:"patchIds"`
	UpdatedAt      string                       `json:"updatedAt"`
}

type SemanticRuntimeStatusCount struct {
	Status SemanticWorkingSetStatus `json:"status"`
	Count  int                      `json:"count"`
}

type SemanticRuntimeRemovals struct {
	WorkflowNodeIDs         []string `json:"workflowNodeIds"`
	RunItemIDs              []string `json:"runItemIds"`
	CartographerRunIDs      []string `json:"cartographerRunIds"`
	CartographerWindowIDs   []string `json:"cartographerWindowIds"`
	PatchPreviewIDs         []string `json:"patchPreviewIds"`
	AggregateSourceIDs      []string `json:"aggregateSourceIds"`
	SemanticNodeActivityIDs []string `json:"semanticNodeActivityIds"`
}

type semanticRuntimeRecords struct {
	runs    []CartographerRun
	windows []CartographerWindow
	patches []CartographerPatchRecord
}

func (service *Service) ReadSemanticRuntimeSnapshot(ctx context.Context, filter SemanticRuntimeFilter) (SemanticRuntimeSnapshot, error) {
	if err := validateSemanticRuntimeFilter(ctx, filter); err != nil {
		return SemanticRuntimeSnapshot{}, err
	}
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return SemanticRuntimeSnapshot{}, err
	}
	filter.Limit = normalizedSemanticRuntimeLimit(filter.Limit)
	service.semanticRuntimeMu.Lock()
	defer service.semanticRuntimeMu.Unlock()
	records, err := service.loadSemanticRuntimeRecords(ctx, filter)
	if err != nil {
		return SemanticRuntimeSnapshot{}, err
	}
	return service.buildSemanticRuntimeSnapshotLocked(filter, records)
}

func (service *Service) loadSemanticRuntimeRecords(ctx context.Context, filter SemanticRuntimeFilter) (semanticRuntimeRecords, error) {
	runs, err := service.store.ListCartographerRuns(ctx, CartographerRunFilter{
		WorkspaceID:         filter.WorkspaceID,
		WorkflowExecutionID: filter.WorkflowExecutionID,
		ChatRunID:           filter.ChatRunID,
		Limit:               filter.Limit,
	})
	if err != nil {
		return semanticRuntimeRecords{}, err
	}
	windows, err := service.store.ListCartographerWindows(ctx, CartographerWindowFilter{
		WorkspaceID:         filter.WorkspaceID,
		WorkflowExecutionID: filter.WorkflowExecutionID,
		ChatRunID:           filter.ChatRunID,
		Limit:               filter.Limit,
	})
	if err != nil {
		return semanticRuntimeRecords{}, err
	}
	patches, err := service.semanticRuntimePatches(ctx, filter, runs.Runs)
	if err != nil {
		return semanticRuntimeRecords{}, err
	}
	return semanticRuntimeRecords{runs: runs.Runs, windows: windows.Windows, patches: patches}, nil
}

func (service *Service) semanticRuntimePatches(ctx context.Context, filter SemanticRuntimeFilter, runs []CartographerRun) ([]CartographerPatchRecord, error) {
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

func (service *Service) buildSemanticRuntimeSnapshotLocked(filter SemanticRuntimeFilter, records semanticRuntimeRecords) (SemanticRuntimeSnapshot, error) {
	builder := newSemanticRuntimeBuilder(filter, service.semanticRuntimeRevision, timestamp(service.now()))
	runByID := semanticWorkingSetRunsByID(records.runs)
	patchesByRunID := semanticWorkingSetPatchesByRunID(records.patches)
	for _, window := range records.windows {
		if err := builder.addWindow(window, runByID[window.RunID]); err != nil {
			return SemanticRuntimeSnapshot{}, err
		}
	}
	for _, run := range records.runs {
		if err := builder.addRun(run, patchesByRunID[run.ID]); err != nil {
			return SemanticRuntimeSnapshot{}, err
		}
	}
	for _, patch := range records.patches {
		if err := builder.addPatch(patch, runByID[patch.RunID]); err != nil {
			return SemanticRuntimeSnapshot{}, err
		}
	}
	return builder.finish(), nil
}

func validateSemanticRuntimeFilter(ctx context.Context, filter SemanticRuntimeFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: "semantic runtime workflow execution id", value: filter.WorkflowExecutionID},
		{label: "semantic runtime chat run id", value: filter.ChatRunID},
	})
}

func normalizedSemanticRuntimeLimit(limit int) int {
	if limit <= 0 {
		return defaultSemanticRuntimeLimit
	}
	if limit > maxSemanticRuntimeLimit {
		return maxSemanticRuntimeLimit
	}
	return limit
}

func semanticGraphChangeNeedsRuntime(draft semanticGraphChangeDraft) bool {
	for _, area := range draft.ChangedAreas {
		switch area {
		case SemanticGraphChangeAreaGraph, SemanticGraphChangeAreaActivity, SemanticGraphChangeAreaCartographerAudit, SemanticGraphChangeAreaWorkingSet:
			return true
		}
	}
	return false
}

func semanticRuntimeChangeAreasForDraft(draft semanticGraphChangeDraft) []SemanticRuntimeChangeArea {
	seen := map[SemanticRuntimeChangeArea]bool{}
	for _, area := range draft.ChangedAreas {
		switch area {
		case SemanticGraphChangeAreaGraph:
			seen[SemanticRuntimeChangeAreaSemanticActivity] = true
		case SemanticGraphChangeAreaActivity:
			seen[SemanticRuntimeChangeAreaSemanticActivity] = true
		case SemanticGraphChangeAreaCartographerAudit, SemanticGraphChangeAreaWorkingSet:
			seen[SemanticRuntimeChangeAreaWorkflow] = true
			seen[SemanticRuntimeChangeAreaCartographer] = true
			seen[SemanticRuntimeChangeAreaPatches] = true
			seen[SemanticRuntimeChangeAreaAggregateSources] = true
		}
	}
	order := []SemanticRuntimeChangeArea{
		SemanticRuntimeChangeAreaWorkflow,
		SemanticRuntimeChangeAreaCartographer,
		SemanticRuntimeChangeAreaPatches,
		SemanticRuntimeChangeAreaSemanticActivity,
		SemanticRuntimeChangeAreaAggregateSources,
	}
	result := []SemanticRuntimeChangeArea{}
	for _, area := range order {
		if seen[area] {
			result = append(result, area)
		}
	}
	return result
}

type semanticRuntimeBuilder struct {
	filter                  SemanticRuntimeFilter
	revision                int
	generatedAt             string
	activeWorkflowNodes     map[string]*SemanticRuntimeWorkflowNode
	activeRunItems          map[string]*SemanticRuntimeRunItem
	aggregatesByID          map[string]*semanticRuntimeAggregateBuilder
	statusCounts            map[SemanticWorkingSetStatus]int
	hiddenRunCount          int
	hiddenWindowCount       int
	hiddenPatchPreviewCount int
	hiddenRecentChanges     int
	updatedAt               string
	snapshot                SemanticRuntimeSnapshot
}

func newSemanticRuntimeBuilder(filter SemanticRuntimeFilter, revision int, generatedAt string) *semanticRuntimeBuilder {
	return &semanticRuntimeBuilder{
		filter:              filter,
		revision:            revision,
		generatedAt:         generatedAt,
		activeWorkflowNodes: map[string]*SemanticRuntimeWorkflowNode{},
		activeRunItems:      map[string]*SemanticRuntimeRunItem{},
		aggregatesByID:      map[string]*semanticRuntimeAggregateBuilder{},
		statusCounts:        map[SemanticWorkingSetStatus]int{},
		snapshot: SemanticRuntimeSnapshot{
			WorkspaceID:         filter.WorkspaceID,
			WorkflowExecutionID: filter.WorkflowExecutionID,
			ChatRunID:           filter.ChatRunID,
			Revision:            revision,
			GeneratedAt:         generatedAt,
			Limits:              semanticRuntimeLimits(filter.Limit),
			Workflow: SemanticRuntimeWorkflowState{
				ActiveWorkflowNodeIDs: []string{},
				ActiveRunItemIDs:      []string{},
				WorkflowNodeUpdates:   []SemanticRuntimeWorkflowNode{},
				RunItemUpdates:        []SemanticRuntimeRunItem{},
			},
			Cartographer: SemanticRuntimeCartographer{
				ActiveRuns:    []SemanticRuntimeCartographerRun{},
				ActiveWindows: []SemanticRuntimeCartographerWindow{},
				StatusCounts:  []SemanticRuntimeStatusCount{},
			},
			Patches: []SemanticRuntimePatchPreview{},
			SemanticActivity: SemanticRuntimeActivity{
				RecentSemanticChanges: []SemanticRuntimeSemanticChange{},
				NodeActivity:          []SemanticRuntimeNodeActivity{},
			},
			DisplayHints: SemanticRuntimeDisplayHints{
				AggregateSources: []SemanticRuntimeSourceAggregate{},
				StatusCounts:     []SemanticRuntimeStatusCount{},
			},
		},
	}
}

func semanticRuntimeLimits(limit int) SemanticRuntimeLimits {
	normalized := normalizedSemanticRuntimeLimit(limit)
	return SemanticRuntimeLimits{
		MaxCartographerRuns:       minInt(normalized, semanticRuntimeMaxSummaryRunUpdates),
		MaxCartographerWindows:    minInt(normalized, semanticRuntimeMaxSummaryWindowUpdates),
		MaxPatchPreviews:          minInt(normalized, semanticRuntimeMaxSummaryPatchPreviews),
		MaxPatchPreviewNodes:      semanticRuntimeMaxPatchPreviewNodes,
		MaxSemanticChanges:        minInt(normalized, semanticRuntimeMaxSummarySemanticChanges),
		MaxAggregateSources:       minInt(normalized, semanticRuntimeMaxSummaryAggregates),
		MaxChangedIDsPerItem:      semanticRuntimeMaxChangedIDs,
		MaxPatchOperationsPerItem: semanticRuntimeMaxPatchOperations,
		MaxCreatedEventIDsPerItem: semanticRuntimeMaxCreatedEventIDs,
		MaxAggregateEntityRefs:    semanticRuntimeMaxAggregateEntityRefs,
	}
}

func (builder *semanticRuntimeBuilder) addRun(run CartographerRun, patches []CartographerPatchRecord) error {
	item, err := semanticRuntimeRunFromCartographerRun(run, patches)
	if err != nil {
		return err
	}
	builder.statusCounts[item.Status]++
	if semanticWorkingSetStatusIsActive(item.Status) {
		if len(builder.snapshot.Cartographer.ActiveRuns) < builder.snapshot.Limits.MaxCartographerRuns {
			builder.snapshot.Cartographer.ActiveRuns = append(builder.snapshot.Cartographer.ActiveRuns, item)
		} else {
			builder.hiddenRunCount++
		}
		builder.recordWorkflowSource(item.Status, item.SourceRefs, item.ID, item.WindowID, "", item.UpdatedAt)
		builder.recordAggregate(item.Status, item.SourceRefs, item.TargetEntityID, item.ID, item.WindowID, "", item.UpdatedAt)
	} else {
		builder.hiddenRunCount++
	}
	builder.recordUpdatedAt(item.UpdatedAt)
	return nil
}

func (builder *semanticRuntimeBuilder) addWindow(window CartographerWindow, run CartographerRun) error {
	item, err := semanticRuntimeWindowFromCartographerWindow(window, run)
	if err != nil {
		return err
	}
	builder.statusCounts[item.Status]++
	if item.Status == WorkingSetStatusWindowOpen {
		if len(builder.snapshot.Cartographer.ActiveWindows) < builder.snapshot.Limits.MaxCartographerWindows {
			builder.snapshot.Cartographer.ActiveWindows = append(builder.snapshot.Cartographer.ActiveWindows, item)
		} else {
			builder.hiddenWindowCount++
		}
		builder.recordWorkflowSource(item.Status, item.SourceRefs, item.RunID, item.ID, "", item.UpdatedAt)
		builder.recordAggregate(item.Status, item.SourceRefs, item.TargetEntityID, item.RunID, item.ID, "", item.UpdatedAt)
	} else {
		builder.hiddenWindowCount++
	}
	builder.recordUpdatedAt(item.UpdatedAt)
	return nil
}

func (builder *semanticRuntimeBuilder) addPatch(patch CartographerPatchRecord, run CartographerRun) error {
	change, err := semanticRuntimeSemanticChangeFromPatch(patch, run)
	if err != nil {
		return err
	}
	if len(builder.snapshot.SemanticActivity.RecentSemanticChanges) < builder.snapshot.Limits.MaxSemanticChanges {
		builder.snapshot.SemanticActivity.RecentSemanticChanges = append(builder.snapshot.SemanticActivity.RecentSemanticChanges, change)
	} else {
		builder.hiddenRecentChanges++
	}
	builder.recordAggregate(change.Status, change.SourceRefs, change.TargetEntityID, change.RunID, change.WindowID, change.PatchID, change.OccurredAt)
	if semanticWorkingSetStatusIsActive(change.Status) {
		builder.recordWorkflowSource(change.Status, change.SourceRefs, change.RunID, change.WindowID, change.PatchID, change.OccurredAt)
	}
	preview, ok, err := semanticRuntimePatchPreviewFromPatch(patch, run)
	if err != nil {
		return err
	}
	if ok {
		if len(builder.snapshot.Patches) < builder.snapshot.Limits.MaxPatchPreviews {
			builder.snapshot.Patches = append(builder.snapshot.Patches, preview)
		} else {
			builder.hiddenPatchPreviewCount++
		}
	} else if patch.Status != CartographerPatchApplied {
		builder.hiddenPatchPreviewCount++
	}
	builder.recordUpdatedAt(change.OccurredAt)
	return nil
}

func (builder *semanticRuntimeBuilder) recordWorkflowSource(status SemanticWorkingSetStatus, refs SemanticContextSourceRefs, runID string, windowID string, patchID string, updatedAt string) {
	if refs.WorkflowNodeID != "" {
		node := builder.activeWorkflowNodes[refs.WorkflowNodeID]
		if node == nil {
			node = &SemanticRuntimeWorkflowNode{
				ID:                  "semantic-runtime-workflow-node:" + refs.WorkflowNodeID,
				WorkflowExecutionID: refs.WorkflowExecutionID,
				WorkflowNodeID:      refs.WorkflowNodeID,
				Status:              status,
				SourceRefs:          refs,
				RunIDs:              []string{},
				WindowIDs:           []string{},
				PatchIDs:            []string{},
				UpdatedAt:           updatedAt,
			}
			builder.activeWorkflowNodes[refs.WorkflowNodeID] = node
		}
		if semanticWorkingSetStatusRank(status) > semanticWorkingSetStatusRank(node.Status) {
			node.Status = status
			node.SourceRefs = refs
		}
		node.ActiveSourceCount++
		node.RunIDs = appendIfNonEmpty(node.RunIDs, runID)
		node.WindowIDs = appendIfNonEmpty(node.WindowIDs, windowID)
		node.PatchIDs = appendIfNonEmpty(node.PatchIDs, patchID)
		if updatedAt > node.UpdatedAt {
			node.UpdatedAt = updatedAt
		}
	}
	if refs.RunItemID != "" {
		item := builder.activeRunItems[refs.RunItemID]
		if item == nil {
			item = &SemanticRuntimeRunItem{
				ID:         "semantic-runtime-run-item:" + refs.RunItemID,
				RunItemID:  refs.RunItemID,
				Status:     status,
				SourceRefs: refs,
				RunIDs:     []string{},
				WindowIDs:  []string{},
				PatchIDs:   []string{},
				UpdatedAt:  updatedAt,
			}
			builder.activeRunItems[refs.RunItemID] = item
		}
		if semanticWorkingSetStatusRank(status) > semanticWorkingSetStatusRank(item.Status) {
			item.Status = status
			item.SourceRefs = refs
		}
		item.ActiveSourceCount++
		item.RunIDs = appendIfNonEmpty(item.RunIDs, runID)
		item.WindowIDs = appendIfNonEmpty(item.WindowIDs, windowID)
		item.PatchIDs = appendIfNonEmpty(item.PatchIDs, patchID)
		if updatedAt > item.UpdatedAt {
			item.UpdatedAt = updatedAt
		}
	}
}

func (builder *semanticRuntimeBuilder) recordAggregate(status SemanticWorkingSetStatus, refs SemanticContextSourceRefs, targetEntityID string, runID string, windowID string, patchID string, updatedAt string) {
	if semanticWorkingSetSourceRefsEmpty(refs) && targetEntityID == "" {
		return
	}
	id := semanticRuntimeSourceAggregateID(refs, targetEntityID)
	aggregate := builder.aggregatesByID[id]
	if aggregate == nil {
		aggregate = &semanticRuntimeAggregateBuilder{
			item: SemanticRuntimeSourceAggregate{
				ID:             id,
				SourceRefs:     refs,
				TargetEntityID: targetEntityID,
				Status:         status,
				StatusCounts:   []SemanticRuntimeStatusCount{},
				RunIDs:         []string{},
				WindowIDs:      []string{},
				PatchIDs:       []string{},
				UpdatedAt:      updatedAt,
			},
			statusCounts: map[SemanticWorkingSetStatus]int{},
		}
		builder.aggregatesByID[id] = aggregate
	}
	if semanticWorkingSetStatusRank(status) > semanticWorkingSetStatusRank(aggregate.item.Status) {
		aggregate.item.Status = status
		aggregate.item.SourceRefs = refs
	}
	aggregate.item.TotalCount++
	if semanticWorkingSetStatusIsActive(status) {
		aggregate.item.VisibleCount = 1
	}
	aggregate.item.RunIDs = appendIfNonEmpty(aggregate.item.RunIDs, runID)
	aggregate.item.WindowIDs = appendIfNonEmpty(aggregate.item.WindowIDs, windowID)
	aggregate.item.PatchIDs = appendIfNonEmpty(aggregate.item.PatchIDs, patchID)
	aggregate.statusCounts[status]++
	if updatedAt > aggregate.item.UpdatedAt {
		aggregate.item.UpdatedAt = updatedAt
	}
}

func (builder *semanticRuntimeBuilder) recordUpdatedAt(value string) {
	if value > builder.updatedAt {
		builder.updatedAt = value
	}
}

func (builder *semanticRuntimeBuilder) finish() SemanticRuntimeSnapshot {
	for _, node := range sortedSemanticRuntimeWorkflowNodes(builder.activeWorkflowNodes) {
		if len(builder.snapshot.Workflow.WorkflowNodeUpdates) < builder.filter.Limit {
			node.RunIDs = truncateStrings(uniqueSortedStrings(node.RunIDs), semanticRuntimeMaxAggregateEntityRefs)
			node.WindowIDs = truncateStrings(uniqueSortedStrings(node.WindowIDs), semanticRuntimeMaxAggregateEntityRefs)
			node.PatchIDs = truncateStrings(uniqueSortedStrings(node.PatchIDs), semanticRuntimeMaxAggregateEntityRefs)
			builder.snapshot.Workflow.WorkflowNodeUpdates = append(builder.snapshot.Workflow.WorkflowNodeUpdates, node)
			builder.snapshot.Workflow.ActiveWorkflowNodeIDs = append(builder.snapshot.Workflow.ActiveWorkflowNodeIDs, node.WorkflowNodeID)
		} else {
			builder.snapshot.Workflow.HiddenActiveWorkflowNodes++
		}
	}
	for _, item := range sortedSemanticRuntimeRunItems(builder.activeRunItems) {
		if len(builder.snapshot.Workflow.RunItemUpdates) < builder.filter.Limit {
			item.RunIDs = truncateStrings(uniqueSortedStrings(item.RunIDs), semanticRuntimeMaxAggregateEntityRefs)
			item.WindowIDs = truncateStrings(uniqueSortedStrings(item.WindowIDs), semanticRuntimeMaxAggregateEntityRefs)
			item.PatchIDs = truncateStrings(uniqueSortedStrings(item.PatchIDs), semanticRuntimeMaxAggregateEntityRefs)
			builder.snapshot.Workflow.RunItemUpdates = append(builder.snapshot.Workflow.RunItemUpdates, item)
			builder.snapshot.Workflow.ActiveRunItemIDs = append(builder.snapshot.Workflow.ActiveRunItemIDs, item.RunItemID)
		} else {
			builder.snapshot.Workflow.HiddenActiveRunItems++
		}
	}
	builder.snapshot.Workflow.ActiveWorkflowNodeIDs = uniqueSortedStrings(builder.snapshot.Workflow.ActiveWorkflowNodeIDs)
	builder.snapshot.Workflow.ActiveRunItemIDs = uniqueSortedStrings(builder.snapshot.Workflow.ActiveRunItemIDs)
	builder.snapshot.Cartographer.StatusCounts = semanticRuntimeStatusCounts(builder.statusCounts)
	builder.snapshot.Cartographer.HiddenRunCount = builder.hiddenRunCount
	builder.snapshot.Cartographer.HiddenWindowCount = builder.hiddenWindowCount
	builder.snapshot.Cartographer.HiddenPatchPreviewCount = builder.hiddenPatchPreviewCount
	builder.snapshot.Cartographer.UpdatedAt = firstNonEmpty(builder.updatedAt, builder.generatedAt)
	builder.snapshot.SemanticActivity.HiddenRecentChanges = builder.hiddenRecentChanges
	aggregates := sortedSemanticRuntimeAggregates(builder.aggregatesByID)
	for _, aggregate := range aggregates {
		if len(builder.snapshot.DisplayHints.AggregateSources) >= builder.snapshot.Limits.MaxAggregateSources {
			builder.snapshot.DisplayHints.HiddenLiveSourceCount += aggregate.TotalCount
			builder.snapshot.DisplayHints.CollapsedSourceCount++
			continue
		}
		if aggregate.VisibleCount == 0 && semanticWorkingSetStatusIsActive(aggregate.Status) {
			aggregate.VisibleCount = 1
		}
		aggregate.HiddenCount = maxInt(0, aggregate.TotalCount-aggregate.VisibleCount)
		builder.snapshot.DisplayHints.AggregateSources = append(builder.snapshot.DisplayHints.AggregateSources, aggregate)
		builder.snapshot.DisplayHints.HiddenLiveSourceCount += aggregate.HiddenCount
	}
	builder.snapshot.DisplayHints.StatusCounts = semanticRuntimeStatusCounts(builder.statusCounts)
	sortSemanticRuntimeSnapshot(&builder.snapshot)
	return builder.snapshot
}

type semanticRuntimeDeltaBuilder struct {
	delta        *SemanticRuntimeDelta
	workflow     *semanticRuntimeBuilder
	aggregateIDs map[string]bool
}

func newSemanticRuntimeDeltaBuilder(delta *SemanticRuntimeDelta) *semanticRuntimeDeltaBuilder {
	filter := SemanticRuntimeFilter{WorkspaceID: delta.WorkspaceID, Limit: defaultSemanticRuntimeLimit}
	return &semanticRuntimeDeltaBuilder{
		delta:        delta,
		workflow:     newSemanticRuntimeBuilder(filter, delta.ToRevision, delta.GeneratedAt),
		aggregateIDs: map[string]bool{},
	}
}

func (builder *semanticRuntimeDeltaBuilder) addRun(run CartographerRun, patches []CartographerPatchRecord) error {
	item, err := semanticRuntimeRunFromCartographerRun(run, patches)
	if err != nil {
		return err
	}
	builder.delta.CartographerRunUpdates = append(builder.delta.CartographerRunUpdates, item)
	if !semanticWorkingSetStatusIsActive(item.Status) {
		builder.delta.Removals.CartographerRunIDs = append(builder.delta.Removals.CartographerRunIDs, item.ID)
		builder.removeWorkflowSource(item.SourceRefs)
	} else {
		builder.workflow.recordWorkflowSource(item.Status, item.SourceRefs, item.ID, item.WindowID, "", item.UpdatedAt)
	}
	builder.workflow.recordAggregate(item.Status, item.SourceRefs, item.TargetEntityID, item.ID, item.WindowID, "", item.UpdatedAt)
	return nil
}

func (builder *semanticRuntimeDeltaBuilder) addWindow(window CartographerWindow, run CartographerRun) error {
	item, err := semanticRuntimeWindowFromCartographerWindow(window, run)
	if err != nil {
		return err
	}
	builder.delta.CartographerWindowUpdates = append(builder.delta.CartographerWindowUpdates, item)
	if item.Status != WorkingSetStatusWindowOpen {
		builder.delta.Removals.CartographerWindowIDs = append(builder.delta.Removals.CartographerWindowIDs, item.ID)
		builder.removeWorkflowSource(item.SourceRefs)
	} else {
		builder.workflow.recordWorkflowSource(item.Status, item.SourceRefs, item.RunID, item.ID, "", item.UpdatedAt)
	}
	builder.workflow.recordAggregate(item.Status, item.SourceRefs, item.TargetEntityID, item.RunID, item.ID, "", item.UpdatedAt)
	return nil
}

func (builder *semanticRuntimeDeltaBuilder) addPatch(patch CartographerPatchRecord, run CartographerRun) error {
	change, err := semanticRuntimeSemanticChangeFromPatch(patch, run)
	if err != nil {
		return err
	}
	builder.delta.SemanticChangeUpdates = append(builder.delta.SemanticChangeUpdates, change)
	builder.workflow.recordAggregate(change.Status, change.SourceRefs, change.TargetEntityID, change.RunID, change.WindowID, change.PatchID, change.OccurredAt)
	preview, ok, err := semanticRuntimePatchPreviewFromPatch(patch, run)
	if err != nil {
		return err
	}
	if ok {
		builder.delta.PatchPreviewUpdates = append(builder.delta.PatchPreviewUpdates, preview)
	} else {
		builder.delta.Removals.PatchPreviewIDs = append(builder.delta.Removals.PatchPreviewIDs, semanticRuntimePatchPreviewID(patch.ID))
	}
	if semanticWorkingSetStatusIsActive(change.Status) {
		builder.workflow.recordWorkflowSource(change.Status, change.SourceRefs, change.RunID, change.WindowID, change.PatchID, change.OccurredAt)
	}
	return nil
}

func (builder *semanticRuntimeDeltaBuilder) addSemanticNodeActivity(draft semanticGraphChangeDraft) {
	targetIDs := uniqueStrings(append(append([]string{}, draft.SemanticNodeIDs...), draft.TargetEntityIDs...))
	for _, targetID := range targetIDs {
		update := SemanticRuntimeNodeActivity{
			ID:                      "semantic-runtime-node-activity:" + targetID,
			TargetEntityID:          targetID,
			LastSemanticEventID:     lastString(draft.CreatedSemanticEventIDs),
			ChangedSemanticNodeIDs:  truncateStrings(uniqueSortedStrings(draft.SemanticNodeIDs), semanticRuntimeMaxChangedIDs),
			ChangedSemanticEdgeIDs:  truncateStrings(uniqueSortedStrings(draft.SemanticEdgeIDs), semanticRuntimeMaxChangedIDs),
			CreatedSemanticEventIDs: truncateStrings(uniqueSortedStrings(draft.CreatedSemanticEventIDs), semanticRuntimeMaxCreatedEventIDs),
			UpdatedAt:               draft.OccurredAt,
		}
		builder.delta.SemanticNodeActivityUpdates = append(builder.delta.SemanticNodeActivityUpdates, update)
		if len(builder.delta.SemanticNodeActivityUpdates) >= defaultSemanticRuntimeLimit {
			return
		}
	}
}

func (builder *semanticRuntimeDeltaBuilder) finish() {
	snapshot := builder.workflow.finish()
	builder.delta.WorkflowNodeUpdates = snapshot.Workflow.WorkflowNodeUpdates
	builder.delta.RunItemUpdates = snapshot.Workflow.RunItemUpdates
	builder.delta.AggregateSourceUpdates = snapshot.DisplayHints.AggregateSources
	sortSemanticRuntimeDelta(builder.delta)
}

func (builder *semanticRuntimeDeltaBuilder) removeWorkflowSource(refs SemanticContextSourceRefs) {
	if refs.WorkflowNodeID != "" {
		builder.delta.Removals.WorkflowNodeIDs = append(builder.delta.Removals.WorkflowNodeIDs, refs.WorkflowNodeID)
	}
	if refs.RunItemID != "" {
		builder.delta.Removals.RunItemIDs = append(builder.delta.Removals.RunItemIDs, refs.RunItemID)
	}
}
