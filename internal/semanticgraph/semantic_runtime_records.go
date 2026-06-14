package semanticgraph

import (
	"fmt"
	"sort"
)

type semanticRuntimeAggregateBuilder struct {
	item         SemanticRuntimeSourceAggregate
	statusCounts map[SemanticWorkingSetStatus]int
}

func semanticRuntimeRunFromCartographerRun(run CartographerRun, patches []CartographerPatchRecord) (SemanticRuntimeCartographerRun, error) {
	status, err := semanticWorkingSetStatusFromRun(run.Status)
	if err != nil {
		return SemanticRuntimeCartographerRun{}, err
	}
	changedNodeIDs, changedEdgeIDs, operations := semanticWorkingSetPatchSummary(patches)
	return SemanticRuntimeCartographerRun{
		ID:                      run.ID,
		WindowID:                run.WindowID,
		Status:                  status,
		TriggerKind:             run.TriggerKind,
		SourceRefs:              run.SourceRefs,
		TargetEntityID:          run.TargetEntityID,
		InputItemCounts:         run.InputItemCounts,
		ChangedSemanticNodeIDs:  truncateStrings(changedNodeIDs, semanticRuntimeMaxChangedIDs),
		ChangedSemanticEdgeIDs:  truncateStrings(changedEdgeIDs, semanticRuntimeMaxChangedIDs),
		PatchOperationNames:     truncateCartographerPatchOperations(operations, semanticRuntimeMaxPatchOperations),
		PublicSummary:           run.TrajectorySummary,
		CreatedSemanticEventIDs: truncateStrings(uniqueSortedStrings(run.CreatedSemanticEventIDs), semanticRuntimeMaxCreatedEventIDs),
		ModelAudit:              semanticRuntimeModelAuditFromRun(run),
		CreatedAt:               run.CreatedAt,
		StartedAt:               run.StartedAt,
		CompletedAt:             run.CompletedAt,
		UpdatedAt:               run.UpdatedAt,
	}, nil
}

func semanticRuntimeModelAuditFromRun(run CartographerRun) *SemanticRuntimeModelAudit {
	audit := SemanticRuntimeModelAudit{
		TaskProfile:              run.TaskProfile,
		RequestedModelSelection:  run.RequestedModelSelection,
		RequestedModel:           run.RequestedModel,
		EffectiveModel:           run.EffectiveModel,
		ReportedModel:            run.ReportedModel,
		RequestedReasoningEffort: run.RequestedReasoningEffort,
		EffectiveReasoningEffort: run.EffectiveReasoningEffort,
		ReportedReasoningEffort:  run.ReportedReasoningEffort,
		ReasoningEffortReported:  run.ReasoningEffortReported,
		QueueWaitMS:              run.QueueWaitMS,
		HarnessDurationMS:        run.HarnessDurationMS,
		TotalDurationMS:          run.TotalDurationMS,
		Error:                    run.Error,
	}
	if semanticRuntimeModelAuditIsEmpty(audit) {
		return nil
	}
	return &audit
}

func semanticRuntimeModelAuditIsEmpty(audit SemanticRuntimeModelAudit) bool {
	for _, value := range []string{
		string(audit.TaskProfile),
		string(audit.RequestedModelSelection),
		audit.RequestedModel,
		audit.EffectiveModel,
		audit.ReportedModel,
		string(audit.RequestedReasoningEffort),
		audit.EffectiveReasoningEffort,
		audit.ReportedReasoningEffort,
		audit.Error,
	} {
		if value != "" {
			return false
		}
	}
	for _, value := range []int{
		audit.QueueWaitMS,
		audit.HarnessDurationMS,
		audit.TotalDurationMS,
	} {
		if value != 0 {
			return false
		}
	}
	return !audit.ReasoningEffortReported
}

func semanticRuntimeWindowFromCartographerWindow(window CartographerWindow, run CartographerRun) (SemanticRuntimeCartographerWindow, error) {
	status, err := semanticWorkingSetStatusFromWindow(window.Status)
	if err != nil {
		return SemanticRuntimeCartographerWindow{}, err
	}
	trigger := firstNonEmptyString(run.TriggerKind, window.InputBundle.TriggerKind)
	return SemanticRuntimeCartographerWindow{
		ID:                     window.ID,
		RunID:                  window.RunID,
		Status:                 status,
		TriggerKind:            trigger,
		SourceRefs:             window.InputBundle.SourceRefs,
		TargetEntityID:         firstNonEmpty(window.InputBundle.TargetEntityID, run.TargetEntityID),
		InputItemCounts:        cartographerInputItemCounts(window.InputBundle),
		ChangedSemanticNodeIDs: []string{},
		ChangedSemanticEdgeIDs: []string{},
		PatchOperationNames:    []CartographerPatchOperation{},
		PublicSummary:          semanticWorkingSetWindowSummary(window),
		OpenedAt:               window.OpenedAt,
		ClosedAt:               window.ClosedAt,
		UpdatedAt:              window.UpdatedAt,
	}, nil
}

func semanticRuntimeSemanticChangeFromPatch(patch CartographerPatchRecord, run CartographerRun) (SemanticRuntimeSemanticChange, error) {
	status, err := semanticWorkingSetStatusFromPatch(patch.Status)
	if err != nil {
		return SemanticRuntimeSemanticChange{}, err
	}
	changedNodeIDs, changedEdgeIDs, operations := semanticWorkingSetPatchSummary([]CartographerPatchRecord{patch})
	updatedAt := firstNonEmpty(patch.AppliedAt, patch.ValidatedAt, patch.CreatedAt)
	return SemanticRuntimeSemanticChange{
		ID:                      "semantic-runtime-change:" + patch.ID,
		RunID:                   patch.RunID,
		WindowID:                patch.WindowID,
		PatchID:                 patch.ID,
		Status:                  status,
		TriggerKind:             run.TriggerKind,
		SourceRefs:              patch.Patch.SourceRefs,
		TargetEntityID:          semanticWorkingSetPatchTargetEntityID(patch.Patch),
		ChangedSemanticNodeIDs:  truncateStrings(changedNodeIDs, semanticRuntimeMaxChangedIDs),
		ChangedSemanticEdgeIDs:  truncateStrings(changedEdgeIDs, semanticRuntimeMaxChangedIDs),
		PatchOperationNames:     truncateCartographerPatchOperations(operations, semanticRuntimeMaxPatchOperations),
		PublicSummary:           patch.Patch.PublicSummary,
		CreatedSemanticEventIDs: truncateStrings(uniqueSortedStrings(patch.CreatedSemanticEventIDs), semanticRuntimeMaxCreatedEventIDs),
		OccurredAt:              updatedAt,
	}, nil
}

func semanticRuntimePatchPreviewFromPatch(patch CartographerPatchRecord, run CartographerRun) (SemanticRuntimePatchPreview, bool, error) {
	status, err := semanticWorkingSetStatusFromPatch(patch.Status)
	if err != nil {
		return SemanticRuntimePatchPreview{}, false, err
	}
	if !semanticWorkingSetPatchPreviewIsPending(status) {
		return SemanticRuntimePatchPreview{}, false, nil
	}
	changedNodeIDs, changedEdgeIDs, operations := semanticWorkingSetPatchSummary([]CartographerPatchRecord{patch})
	newNodes := []SemanticRuntimePreviewNode{}
	for _, node := range semanticWorkingSetPatchNewNodes(patch.Patch) {
		if node.SemanticNodeID == "" {
			continue
		}
		newNodes = append(newNodes, SemanticRuntimePreviewNode{
			SemanticNodeID: node.SemanticNodeID,
			Kind:           node.Kind,
			Label:          node.Label,
			Summary:        node.Summary,
			Scope:          node.Scope,
		})
		if len(newNodes) >= semanticRuntimeMaxPatchPreviewNodes {
			break
		}
	}
	updatedAt := firstNonEmpty(patch.ValidatedAt, patch.CreatedAt)
	return SemanticRuntimePatchPreview{
		ID:                     semanticRuntimePatchPreviewID(patch.ID),
		PatchID:                patch.ID,
		RunID:                  patch.RunID,
		WindowID:               patch.WindowID,
		Status:                 status,
		TriggerKind:            run.TriggerKind,
		SourceRefs:             patch.Patch.SourceRefs,
		TargetEntityID:         semanticWorkingSetPatchTargetEntityID(patch.Patch),
		Operation:              patch.Patch.Operation,
		PatchOperationNames:    truncateCartographerPatchOperations(operations, semanticRuntimeMaxPatchOperations),
		NewNodes:               newNodes,
		ChangedSemanticNodeIDs: truncateStrings(changedNodeIDs, semanticRuntimeMaxChangedIDs),
		ChangedSemanticEdgeIDs: truncateStrings(changedEdgeIDs, semanticRuntimeMaxChangedIDs),
		PublicSummary:          patch.Patch.PublicSummary,
		CreatedAt:              patch.CreatedAt,
		UpdatedAt:              updatedAt,
	}, true, nil
}

func semanticRuntimePatchPreviewID(patchID string) string {
	return "semantic-runtime-preview:" + patchID
}

func semanticRuntimeSourceAggregateID(refs SemanticContextSourceRefs, targetEntityID string) string {
	switch {
	case refs.WorkflowNodeID != "":
		return "semantic-runtime-source:workflow-node:" + refs.WorkflowNodeID
	case refs.RunItemID != "":
		return "semantic-runtime-source:run-item:" + refs.RunItemID
	case targetEntityID != "":
		return "semantic-runtime-source:target:" + targetEntityID
	case refs.ChatRunID != "":
		return "semantic-runtime-source:chat-run:" + refs.ChatRunID
	case refs.WorkflowExecutionID != "":
		return "semantic-runtime-source:workflow-execution:" + refs.WorkflowExecutionID
	default:
		return "semantic-runtime-source:workspace"
	}
}

func semanticRuntimeStatusCounts(counts map[SemanticWorkingSetStatus]int) []SemanticRuntimeStatusCount {
	result := make([]SemanticRuntimeStatusCount, 0, len(counts))
	for status, count := range counts {
		if status == "" || count <= 0 {
			continue
		}
		result = append(result, SemanticRuntimeStatusCount{Status: status, Count: count})
	}
	sort.Slice(result, func(left int, right int) bool {
		leftRank := semanticWorkingSetStatusRank(result[left].Status)
		rightRank := semanticWorkingSetStatusRank(result[right].Status)
		if leftRank != rightRank {
			return leftRank > rightRank
		}
		return result[left].Status < result[right].Status
	})
	return truncateStatusCounts(result, semanticRuntimeMaxStatusCounts)
}

func sortedSemanticRuntimeWorkflowNodes(values map[string]*SemanticRuntimeWorkflowNode) []SemanticRuntimeWorkflowNode {
	result := make([]SemanticRuntimeWorkflowNode, 0, len(values))
	for _, value := range values {
		result = append(result, *value)
	}
	sort.Slice(result, func(left int, right int) bool {
		if result[left].UpdatedAt != result[right].UpdatedAt {
			return result[left].UpdatedAt > result[right].UpdatedAt
		}
		return result[left].WorkflowNodeID < result[right].WorkflowNodeID
	})
	return result
}

func sortedSemanticRuntimeRunItems(values map[string]*SemanticRuntimeRunItem) []SemanticRuntimeRunItem {
	result := make([]SemanticRuntimeRunItem, 0, len(values))
	for _, value := range values {
		result = append(result, *value)
	}
	sort.Slice(result, func(left int, right int) bool {
		if result[left].UpdatedAt != result[right].UpdatedAt {
			return result[left].UpdatedAt > result[right].UpdatedAt
		}
		return result[left].RunItemID < result[right].RunItemID
	})
	return result
}

func sortedSemanticRuntimeAggregates(values map[string]*semanticRuntimeAggregateBuilder) []SemanticRuntimeSourceAggregate {
	result := make([]SemanticRuntimeSourceAggregate, 0, len(values))
	for _, value := range values {
		item := value.item
		item.RunIDs = truncateStrings(uniqueSortedStrings(item.RunIDs), semanticRuntimeMaxAggregateEntityRefs)
		item.WindowIDs = truncateStrings(uniqueSortedStrings(item.WindowIDs), semanticRuntimeMaxAggregateEntityRefs)
		item.PatchIDs = truncateStrings(uniqueSortedStrings(item.PatchIDs), semanticRuntimeMaxAggregateEntityRefs)
		item.StatusCounts = semanticRuntimeStatusCounts(value.statusCounts)
		result = append(result, item)
	}
	sort.Slice(result, func(left int, right int) bool {
		if result[left].UpdatedAt != result[right].UpdatedAt {
			return result[left].UpdatedAt > result[right].UpdatedAt
		}
		return result[left].ID < result[right].ID
	})
	return result
}

func sortSemanticRuntimeSnapshot(snapshot *SemanticRuntimeSnapshot) {
	sort.Slice(snapshot.Cartographer.ActiveRuns, func(left int, right int) bool {
		return semanticRuntimeItemLess(snapshot.Cartographer.ActiveRuns[left].UpdatedAt, snapshot.Cartographer.ActiveRuns[left].ID, snapshot.Cartographer.ActiveRuns[right].UpdatedAt, snapshot.Cartographer.ActiveRuns[right].ID)
	})
	sort.Slice(snapshot.Cartographer.ActiveWindows, func(left int, right int) bool {
		return semanticRuntimeItemLess(snapshot.Cartographer.ActiveWindows[left].UpdatedAt, snapshot.Cartographer.ActiveWindows[left].ID, snapshot.Cartographer.ActiveWindows[right].UpdatedAt, snapshot.Cartographer.ActiveWindows[right].ID)
	})
	sort.Slice(snapshot.Patches, func(left int, right int) bool {
		return semanticRuntimeItemLess(snapshot.Patches[left].UpdatedAt, snapshot.Patches[left].ID, snapshot.Patches[right].UpdatedAt, snapshot.Patches[right].ID)
	})
	sort.Slice(snapshot.SemanticActivity.RecentSemanticChanges, func(left int, right int) bool {
		return semanticRuntimeItemLess(snapshot.SemanticActivity.RecentSemanticChanges[left].OccurredAt, snapshot.SemanticActivity.RecentSemanticChanges[left].ID, snapshot.SemanticActivity.RecentSemanticChanges[right].OccurredAt, snapshot.SemanticActivity.RecentSemanticChanges[right].ID)
	})
}

func sortSemanticRuntimeDelta(delta *SemanticRuntimeDelta) {
	sort.Slice(delta.CartographerRunUpdates, func(left int, right int) bool {
		return semanticRuntimeItemLess(delta.CartographerRunUpdates[left].UpdatedAt, delta.CartographerRunUpdates[left].ID, delta.CartographerRunUpdates[right].UpdatedAt, delta.CartographerRunUpdates[right].ID)
	})
	sort.Slice(delta.CartographerWindowUpdates, func(left int, right int) bool {
		return semanticRuntimeItemLess(delta.CartographerWindowUpdates[left].UpdatedAt, delta.CartographerWindowUpdates[left].ID, delta.CartographerWindowUpdates[right].UpdatedAt, delta.CartographerWindowUpdates[right].ID)
	})
	sort.Slice(delta.PatchPreviewUpdates, func(left int, right int) bool {
		return semanticRuntimeItemLess(delta.PatchPreviewUpdates[left].UpdatedAt, delta.PatchPreviewUpdates[left].ID, delta.PatchPreviewUpdates[right].UpdatedAt, delta.PatchPreviewUpdates[right].ID)
	})
	sort.Strings(delta.Removals.CartographerRunIDs)
	sort.Strings(delta.Removals.CartographerWindowIDs)
	sort.Strings(delta.Removals.PatchPreviewIDs)
}

func semanticRuntimeItemLess(leftUpdatedAt string, leftID string, rightUpdatedAt string, rightID string) bool {
	if leftUpdatedAt != rightUpdatedAt {
		return leftUpdatedAt > rightUpdatedAt
	}
	return leftID < rightID
}

func emptySemanticRuntimeRemovals() SemanticRuntimeRemovals {
	return SemanticRuntimeRemovals{
		WorkflowNodeIDs:         []string{},
		RunItemIDs:              []string{},
		CartographerRunIDs:      []string{},
		CartographerWindowIDs:   []string{},
		PatchPreviewIDs:         []string{},
		AggregateSourceIDs:      []string{},
		SemanticNodeActivityIDs: []string{},
	}
}

func truncateStrings(values []string, limit int) []string {
	if values == nil {
		return []string{}
	}
	if limit >= 0 && len(values) > limit {
		return append([]string{}, values[:limit]...)
	}
	return append([]string{}, values...)
}

func truncateCartographerPatchOperations(values []CartographerPatchOperation, limit int) []CartographerPatchOperation {
	if values == nil {
		return []CartographerPatchOperation{}
	}
	if limit >= 0 && len(values) > limit {
		return append([]CartographerPatchOperation{}, values[:limit]...)
	}
	return append([]CartographerPatchOperation{}, values...)
}

func truncateStatusCounts(values []SemanticRuntimeStatusCount, limit int) []SemanticRuntimeStatusCount {
	if values == nil {
		return []SemanticRuntimeStatusCount{}
	}
	if limit >= 0 && len(values) > limit {
		return append([]SemanticRuntimeStatusCount{}, values[:limit]...)
	}
	return append([]SemanticRuntimeStatusCount{}, values...)
}

func firstNonEmptyString[T ~string](values ...T) T {
	var empty T
	for _, value := range values {
		if value != empty {
			return value
		}
	}
	return empty
}

func lastString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[len(values)-1]
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func assertSemanticRuntimeListBounds(snapshot SemanticRuntimeSnapshot) error {
	if len(snapshot.Cartographer.ActiveRuns) > snapshot.Limits.MaxCartographerRuns {
		return fmt.Errorf("semantic runtime active runs exceeded bound: %d > %d", len(snapshot.Cartographer.ActiveRuns), snapshot.Limits.MaxCartographerRuns)
	}
	if len(snapshot.Cartographer.ActiveWindows) > snapshot.Limits.MaxCartographerWindows {
		return fmt.Errorf("semantic runtime active windows exceeded bound: %d > %d", len(snapshot.Cartographer.ActiveWindows), snapshot.Limits.MaxCartographerWindows)
	}
	if len(snapshot.Patches) > snapshot.Limits.MaxPatchPreviews {
		return fmt.Errorf("semantic runtime patch previews exceeded bound: %d > %d", len(snapshot.Patches), snapshot.Limits.MaxPatchPreviews)
	}
	if len(snapshot.SemanticActivity.RecentSemanticChanges) > snapshot.Limits.MaxSemanticChanges {
		return fmt.Errorf("semantic runtime semantic changes exceeded bound: %d > %d", len(snapshot.SemanticActivity.RecentSemanticChanges), snapshot.Limits.MaxSemanticChanges)
	}
	if len(snapshot.DisplayHints.AggregateSources) > snapshot.Limits.MaxAggregateSources {
		return fmt.Errorf("semantic runtime aggregate sources exceeded bound: %d > %d", len(snapshot.DisplayHints.AggregateSources), snapshot.Limits.MaxAggregateSources)
	}
	return nil
}
