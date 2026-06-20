package semanticgraph

import (
	"fmt"
	"sort"
)

func cartographerWorkflowDoneInputBundle(final CartographerInputBundle, folded []CartographerWindow, config CartographerObservationConfig, requestedInputBudget int) CartographerInputBundle {
	combined := emptyCartographerWorkflowDoneInputBundle(final)
	for _, window := range folded {
		mergeCartographerEpochInputBundle(&combined, window.InputBundle, config)
	}
	mergeCartographerEpochInputBundle(&combined, final, config)
	combined.WorkspaceID = final.WorkspaceID
	combined.TriggerKind = CartographerTriggerWorkflowDone
	combined.SourceRefs = final.SourceRefs
	combined.TargetEntityID = final.TargetEntityID
	combined.RunStatus = firstNonEmpty(final.RunStatus, combined.RunStatus)
	combined.TerminalReason = firstNonEmpty(final.TerminalReason, combined.TerminalReason)
	combined.WindowID = final.WindowID
	combined.TokenBudget = final.TokenBudget
	if len(folded) > 0 {
		combined.Truncation.Summarized = true
		combined.Truncation.Reasons = appendUniqueString(combined.Truncation.Reasons, "workflow_done_folded_epochs")
		combined.Truncation.DeterministicSummary = appendBoundedAggregate(
			combined.Truncation.DeterministicSummary,
			fmt.Sprintf("folded %d earlier cartographer epoch(s) into the workflow completion synthesis pass", len(folded)),
			config.MaxWindowContentBytes,
		)
	}
	return compactCartographerWorkflowDoneInputBundle(combined, config, len(folded), requestedInputBudget)
}

func emptyCartographerWorkflowDoneInputBundle(final CartographerInputBundle) CartographerInputBundle {
	return CartographerInputBundle{
		WorkspaceID:     final.WorkspaceID,
		TriggerKind:     CartographerTriggerWorkflowDone,
		SourceRefs:      final.SourceRefs,
		TargetEntityID:  final.TargetEntityID,
		WindowID:        final.WindowID,
		TokenBudget:     final.TokenBudget,
		WindowEndCursor: final.WindowEndCursor,
	}
}

func mergeCartographerEpochInputBundle(target *CartographerInputBundle, source CartographerInputBundle, config CartographerObservationConfig) {
	target.RunStatus = firstNonEmpty(source.RunStatus, target.RunStatus)
	target.TerminalReason = firstNonEmpty(source.TerminalReason, target.TerminalReason)
	mergeCartographerWindowCursors(target, source)
	target.NewEvents = append(target.NewEvents, source.NewEvents...)
	target.Observations = append(target.Observations, source.Observations...)
	target.PromptSummary = appendBoundedAggregate(target.PromptSummary, source.PromptSummary, config.MaxWindowContentBytes)
	target.PromptText = appendBoundedAggregate(target.PromptText, source.PromptText, config.MaxWindowContentBytes)
	target.AssistantResponseSummary = appendBoundedAggregate(target.AssistantResponseSummary, source.AssistantResponseSummary, config.MaxWindowContentBytes)
	target.AssistantText = appendBoundedAggregate(target.AssistantText, source.AssistantText, config.MaxWindowContentBytes)
	for _, summary := range source.ToolCalls {
		target.ToolCalls = upsertToolSummary(target.ToolCalls, summary)
	}
	for _, summary := range source.FileChanges {
		target.FileChanges = upsertFileChangeSummary(target.FileChanges, summary)
	}
	for _, summary := range source.TestResults {
		target.TestResults = upsertTestResultSummary(target.TestResults, summary)
	}
	for _, summary := range source.OutputSummaries {
		target.OutputSummaries = upsertOutputSummary(target.OutputSummaries, summary, config)
	}
	for _, candidate := range source.EvidenceCandidates {
		target.EvidenceCandidates = upsertEvidenceCandidate(target.EvidenceCandidates, candidate)
	}
	target.ExistingNodes = append(target.ExistingNodes, source.ExistingNodes...)
	target.ExistingEdges = append(target.ExistingEdges, source.ExistingEdges...)
	target.Evidence = append(target.Evidence, source.Evidence...)
	target.Activity = append(target.Activity, source.Activity...)
	target.Steering = append(target.Steering, source.Steering...)
	target.ContextPacks = append(target.ContextPacks, source.ContextPacks...)
	target.RetrievalResults = append(target.RetrievalResults, source.RetrievalResults...)
	target.TrajectorySummaries = append(target.TrajectorySummaries, source.TrajectorySummaries...)
	for _, ref := range source.ObservedEventRefs {
		target.ObservedEventRefs = appendUniqueString(target.ObservedEventRefs, ref)
	}
	mergeCartographerInputTruncation(&target.Truncation, source.Truncation, config)
}

func mergeCartographerWindowCursors(target *CartographerInputBundle, source CartographerInputBundle) {
	if cartographerWindowCursorIsZero(target.WindowStartCursor) {
		target.WindowStartCursor = source.WindowStartCursor
	}
	target.WindowEndCursor = mergeCartographerWindowCursor(target.WindowEndCursor, source.WindowEndCursor)
}

func cartographerWindowCursorIsZero(cursor CartographerWindowCursor) bool {
	return cursor.ChatEventStreamID == "" &&
		cursor.ChatEventSequence == 0 &&
		cursor.WorkflowEventCursor == "" &&
		len(cursor.OutputOrdinalByRunItem) == 0
}

func mergeCartographerWindowCursor(target CartographerWindowCursor, source CartographerWindowCursor) CartographerWindowCursor {
	if source.ChatEventSequence > target.ChatEventSequence {
		target.ChatEventStreamID = source.ChatEventStreamID
		target.ChatEventSequence = source.ChatEventSequence
	}
	_, targetWorkflowSequence := splitCartographerCursorSequence(target.WorkflowEventCursor)
	_, sourceWorkflowSequence := splitCartographerCursorSequence(source.WorkflowEventCursor)
	if sourceWorkflowSequence > targetWorkflowSequence {
		target.WorkflowEventCursor = source.WorkflowEventCursor
	}
	if target.OutputOrdinalByRunItem == nil {
		target.OutputOrdinalByRunItem = map[string]int{}
	}
	for runItemID, ordinal := range source.OutputOrdinalByRunItem {
		if ordinal > target.OutputOrdinalByRunItem[runItemID] {
			target.OutputOrdinalByRunItem[runItemID] = ordinal
		}
	}
	return target
}

func upsertOutputSummary(items []CartographerOutputSummary, summary CartographerOutputSummary, config CartographerObservationConfig) []CartographerOutputSummary {
	for index := range items {
		if items[index].RunItemID == summary.RunItemID && items[index].Stream == summary.Stream {
			if items[index].StartOrdinal == 0 || (summary.StartOrdinal > 0 && summary.StartOrdinal < items[index].StartOrdinal) {
				items[index].StartOrdinal = summary.StartOrdinal
			}
			if summary.EndOrdinal > items[index].EndOrdinal {
				items[index].EndOrdinal = summary.EndOrdinal
			}
			items[index].Summary = appendBoundedAggregate(items[index].Summary, summary.Summary, config.MaxWindowContentBytes)
			items[index].Truncated = items[index].Truncated || summary.Truncated
			return items
		}
	}
	return append(items, summary)
}

func mergeCartographerInputTruncation(target *CartographerInputTruncation, source CartographerInputTruncation, config CartographerObservationConfig) {
	target.OriginalEventCount = maxInt(target.OriginalEventCount, source.OriginalEventCount)
	target.OriginalContentBytes = maxInt(target.OriginalContentBytes, source.OriginalContentBytes)
	target.Summarized = target.Summarized || source.Summarized
	target.Split = target.Split || source.Split
	for _, reason := range source.Reasons {
		target.Reasons = appendUniqueString(target.Reasons, reason)
	}
	target.DeterministicSummary = appendBoundedAggregate(target.DeterministicSummary, source.DeterministicSummary, config.MaxWindowContentBytes)
}

func cartographerWindowShouldFoldIntoWorkflowDone(window CartographerWindow, finalWindow CartographerWindow, refs SemanticContextSourceRefs) bool {
	if window.ID == finalWindow.ID || window.RunID == finalWindow.RunID || window.WorkspaceID != finalWindow.WorkspaceID {
		return false
	}
	if window.InputBundle.TriggerKind == CartographerTriggerWorkflowDone {
		return false
	}
	return cartographerSourceRefsMatchWorkflowDone(window.InputBundle.SourceRefs, refs)
}

func cartographerSourceRefsMatchWorkflowDone(candidate SemanticContextSourceRefs, refs SemanticContextSourceRefs) bool {
	if refs.WorkflowExecutionID != "" && candidate.WorkflowExecutionID == refs.WorkflowExecutionID {
		return true
	}
	if refs.ChatRunID != "" && candidate.ChatRunID == refs.ChatRunID {
		return true
	}
	return false
}

func sortCartographerWindowsForEpochFold(windows []CartographerWindow) {
	sort.SliceStable(windows, func(left int, right int) bool {
		if windows[left].OpenedAt == windows[right].OpenedAt {
			if windows[left].UpdatedAt == windows[right].UpdatedAt {
				return windows[left].ID < windows[right].ID
			}
			return windows[left].UpdatedAt < windows[right].UpdatedAt
		}
		return windows[left].OpenedAt < windows[right].OpenedAt
	})
}
