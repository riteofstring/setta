package semanticgraph

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/chat"
)

type cartographerSerializedInputSize struct {
	bytes      int
	characters int
}

func compactCartographerWorkflowDoneInputBundle(bundle CartographerInputBundle, config CartographerObservationConfig, foldedWindowCount int, requestedInputBudget int) CartographerInputBundle {
	config = normalizeCartographerObservationConfig(config)
	normalizeCartographerInputBundle(&bundle)
	if cartographerInputItemCountsIsZero(bundle.Truncation.OriginalItemCounts) {
		bundle.Truncation.OriginalItemCounts = cartographerInputItemCounts(bundle)
	}
	if foldedWindowCount > bundle.Truncation.FoldedWindowCount {
		bundle.Truncation.FoldedWindowCount = foldedWindowCount
	}
	bundle = dedupeWorkflowDoneInputBundle(bundle, config)
	bundle = collapseWorkflowDoneAssistantDeltaObservations(bundle, config)
	bundle = applyWorkflowDoneSerializedBudgetCompaction(bundle, config, requestedInputBudget)
	return finalizeWorkflowDoneInputBudgetAudit(bundle, requestedInputBudget)
}

func dedupeWorkflowDoneInputBundle(bundle CartographerInputBundle, config CartographerObservationConfig) CartographerInputBundle {
	before := cartographerInputItemCounts(bundle)
	bundle.NewEvents = dedupeCartographerItems(bundle.NewEvents, cartographerTrajectoryEventDedupeKey)
	bundle.Observations = dedupeCartographerItems(bundle.Observations, cartographerObservationDedupeKey)
	bundle.ExistingNodes = dedupeCartographerItems(bundle.ExistingNodes, func(node SemanticNode) string { return node.ID })
	bundle.ExistingEdges = dedupeCartographerItems(bundle.ExistingEdges, func(edge SemanticEdge) string { return edge.ID })
	bundle.Evidence = dedupeCartographerItems(bundle.Evidence, func(evidence SemanticEvidenceAnchor) string { return evidence.ID })
	bundle.TrajectorySummaries = dedupeCartographerItems(bundle.TrajectorySummaries, cartographerTrajectorySummaryDedupeKey)
	bundle.ObservedEventRefs = dedupeStrings(bundle.ObservedEventRefs)
	after := cartographerInputItemCounts(bundle)
	if cartographerInputItemCountsAny(cartographerInputItemCountsSubtract(before, after)) {
		bundle.Truncation.Summarized = true
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, "workflow_done_deduplicated_context")
		bundle.Truncation.DeterministicSummary = appendBoundedAggregate(
			bundle.Truncation.DeterministicSummary,
			cartographerCompactionSummary("deduplicated repeated final-synthesis context", before, after),
			config.MaxWindowContentBytes,
		)
	}
	return bundle
}

func collapseWorkflowDoneAssistantDeltaObservations(bundle CartographerInputBundle, config CartographerObservationConfig) CartographerInputBundle {
	type aggregate struct {
		record CartographerObservationRecord
		count  int
	}
	aggregates := map[string]aggregate{}
	order := []string{}
	collapsed := 0
	kept := make([]CartographerObservationRecord, 0, len(bundle.Observations))
	for _, observation := range bundle.Observations {
		if observation.Kind != CartographerObservationAssistantTextChunkAggregate {
			kept = append(kept, observation)
			continue
		}
		key := cartographerAssistantDeltaObservationAggregateKey(observation)
		current, ok := aggregates[key]
		if !ok {
			current = aggregate{record: observation}
			current.record.TextExcerpt = ""
			order = append(order, key)
		}
		current.count++
		current.record.Summary = "assistant text deltas collapsed for final synthesis"
		current.record.TextExcerpt = appendBoundedAggregate(current.record.TextExcerpt, observation.TextExcerpt, minPositive(config.MaxWindowContentBytes, cartographerAggregateTextLimit))
		current.record.ContentHash = cartographerObservationContentHash(firstNonEmpty(current.record.TextExcerpt, current.record.Summary))
		if observation.OutputOrdinal > current.record.OutputOrdinal {
			current.record.OutputOrdinal = observation.OutputOrdinal
		}
		if observation.OccurredAt > current.record.OccurredAt {
			current.record.OccurredAt = observation.OccurredAt
		}
		aggregates[key] = current
		collapsed++
	}
	for _, key := range order {
		current := aggregates[key]
		if current.count > 1 {
			current.record.Summary = fmt.Sprintf("assistant text deltas collapsed from %d event(s) for final synthesis", current.count)
		}
		kept = append(kept, current.record)
	}
	if collapsed > len(order) {
		bundle.Truncation.Summarized = true
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, "assistant_delta_observations_collapsed")
		bundle.Truncation.DeterministicSummary = appendBoundedAggregate(
			bundle.Truncation.DeterministicSummary,
			fmt.Sprintf("collapsed %d assistant text delta observation(s) into %d aggregate observation(s)", collapsed, len(order)),
			config.MaxWindowContentBytes,
		)
	}
	bundle.Observations = kept
	return bundle
}

func applyWorkflowDoneSerializedBudgetCompaction(bundle CartographerInputBundle, config CartographerObservationConfig, requestedInputBudget int) CartographerInputBundle {
	bundle = applyCartographerInputLimits(bundle, config)
	budget := effectiveCartographerInputCharacterBudget(requestedInputBudget)
	steps := []struct {
		reason string
		apply  func(CartographerInputBundle) CartographerInputBundle
	}{
		{
			reason: "workflow_done_text_compacted",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return compactWorkflowDoneAggregateText(input, config, budget)
			},
		},
		{
			reason: "workflow_done_retrieval_results_dropped",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.RetrievalResults = []SemanticRetrievalResult{}
				return input
			},
		},
		{
			reason: "workflow_done_trajectory_summaries_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.TrajectorySummaries = limitWorkflowDoneTrajectorySummaries(input.TrajectorySummaries, input.WindowID, 32, config)
				return input
			},
		},
		{
			reason: "workflow_done_observations_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.Observations = limitWorkflowDoneObservations(input.Observations, 96)
				return input
			},
		},
		{
			reason: "workflow_done_events_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.NewEvents = limitWorkflowDoneEvents(input.NewEvents, 96)
				return input
			},
		},
		{
			reason: "workflow_done_context_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return limitWorkflowDoneSemanticContext(input, 64, 96, 96, 16, 16, 8)
			},
		},
		{
			reason: "workflow_done_trajectory_summaries_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.TrajectorySummaries = limitWorkflowDoneTrajectorySummaries(input.TrajectorySummaries, input.WindowID, 8, config)
				return input
			},
		},
		{
			reason: "workflow_done_observations_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.Observations = limitWorkflowDoneObservations(input.Observations, 32)
				return input
			},
		},
		{
			reason: "workflow_done_events_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.NewEvents = limitWorkflowDoneEvents(input.NewEvents, 32)
				return input
			},
		},
		{
			reason: "workflow_done_context_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return limitWorkflowDoneSemanticContext(input, 16, 24, 32, 8, 8, 2)
			},
		},
		{
			reason: "workflow_done_context_text_compacted",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return compactWorkflowDoneContextText(input, 512)
			},
		},
		{
			reason: "workflow_done_prior_window_context_dropped",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.TrajectorySummaries = limitWorkflowDoneTrajectorySummaries(input.TrajectorySummaries, input.WindowID, 0, config)
				input.OutputSummaries = []CartographerOutputSummary{}
				input.ContextPacks = []SemanticContextPackRecord{}
				return input
			},
		},
		{
			reason: "workflow_done_observation_text_compacted",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return compactWorkflowDoneObservationAndEventText(input, 256)
			},
		},
		{
			reason: "workflow_done_observations_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.Observations = limitWorkflowDoneObservations(input.Observations, 8)
				return input
			},
		},
		{
			reason: "workflow_done_events_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.NewEvents = limitWorkflowDoneEvents(input.NewEvents, 8)
				return input
			},
		},
		{
			reason: "workflow_done_observations_dropped",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				input.Observations = []CartographerObservationRecord{}
				return input
			},
		},
		{
			reason: "workflow_done_context_limited",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return limitWorkflowDoneSemanticContext(input, 4, 8, 16, 4, 4, 0)
			},
		},
		{
			reason: "workflow_done_context_text_compacted",
			apply: func(input CartographerInputBundle) CartographerInputBundle {
				return compactWorkflowDoneContextText(input, 256)
			},
		},
	}
	for _, step := range steps {
		if cartographerInputBundleFitsBudget(bundle, budget) {
			return bundle
		}
		beforeCounts := cartographerInputItemCounts(bundle)
		beforeSize, _ := cartographerInputBundleSerializedSize(bundle)
		next := step.apply(bundle)
		normalizeCartographerInputBundle(&next)
		afterCounts := cartographerInputItemCounts(next)
		afterSize, _ := cartographerInputBundleSerializedSize(next)
		if cartographerInputItemCountsAny(cartographerInputItemCountsSubtract(beforeCounts, afterCounts)) || afterSize.characters < beforeSize.characters {
			next.Truncation.Summarized = true
			next.Truncation.Reasons = appendUniqueString(next.Truncation.Reasons, step.reason)
			next.Truncation.DeterministicSummary = appendBoundedAggregate(
				next.Truncation.DeterministicSummary,
				cartographerBudgetCompactionSummary(step.reason, beforeCounts, afterCounts, beforeSize, afterSize),
				config.MaxWindowContentBytes,
			)
		}
		bundle = next
	}
	if !cartographerInputBundleFitsBudget(bundle, budget) {
		bundle.Truncation.Summarized = true
		bundle.Truncation.BudgetExceeded = true
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, "input_budget_exceeded")
		size, _ := cartographerInputBundleSerializedSize(bundle)
		bundle.Truncation.DeterministicSummary = appendBoundedAggregate(
			bundle.Truncation.DeterministicSummary,
			fmt.Sprintf("final synthesis input remained %d serialized character(s) after deterministic compaction, exceeding budget %d", size.characters, budget),
			config.MaxWindowContentBytes,
		)
	}
	return bundle
}

func finalizeWorkflowDoneInputBudgetAudit(bundle CartographerInputBundle, requestedInputBudget int) CartographerInputBundle {
	normalizeCartographerInputBundle(&bundle)
	if cartographerInputItemCountsIsZero(bundle.Truncation.OriginalItemCounts) {
		bundle.Truncation.OriginalItemCounts = cartographerInputItemCounts(bundle)
	}
	bundle.Truncation.IncludedItemCounts = cartographerInputItemCounts(bundle)
	bundle.Truncation.DroppedItemCounts = cartographerInputItemCountsSubtract(bundle.Truncation.OriginalItemCounts, bundle.Truncation.IncludedItemCounts)
	budget := effectiveCartographerInputCharacterBudget(requestedInputBudget)
	bundle.Truncation.InputBudgetCharacters = budget
	bundle.Truncation.StructuredTaskCharacterLimit = codexStructuredTaskInputCharacterLimit
	for range 4 {
		size, err := cartographerInputBundleSerializedSize(bundle)
		if err != nil {
			break
		}
		exceeded := size.characters > budget || size.characters > codexStructuredTaskInputCharacterLimit
		if bundle.Truncation.SerializedInputBytes == size.bytes &&
			bundle.Truncation.SerializedInputCharacterCount == size.characters &&
			bundle.Truncation.BudgetExceeded == exceeded {
			return bundle
		}
		bundle.Truncation.SerializedInputBytes = size.bytes
		bundle.Truncation.SerializedInputCharacterCount = size.characters
		bundle.Truncation.BudgetExceeded = exceeded
	}
	return bundle
}

func cartographerInputBundleSerializedSize(bundle CartographerInputBundle) (cartographerSerializedInputSize, error) {
	normalizeCartographerInputBundle(&bundle)
	data, err := json.Marshal(bundle)
	if err != nil {
		return cartographerSerializedInputSize{}, fmt.Errorf("encode cartographer input bundle for size accounting: %w", err)
	}
	return cartographerSerializedInputSize{bytes: len(data), characters: len([]rune(string(data)))}, nil
}

func cartographerInputBundleFitsBudget(bundle CartographerInputBundle, budget int) bool {
	size, err := cartographerInputBundleSerializedSize(bundle)
	if err != nil {
		return false
	}
	return size.characters <= budget && size.characters <= codexStructuredTaskInputCharacterLimit
}

func effectiveCartographerInputCharacterBudget(requestedInputBudget int) int {
	if requestedInputBudget <= 0 || requestedInputBudget > codexStructuredTaskInputCharacterLimit {
		return codexStructuredTaskInputCharacterLimit
	}
	return requestedInputBudget
}

func cartographerFinalSynthesisInputBudgetError(run CartographerRun) error {
	if run.TriggerKind != CartographerTriggerWorkflowDone {
		return nil
	}
	budget := effectiveCartographerInputCharacterBudget(run.RequestedInputBudget)
	size, err := cartographerInputBundleSerializedSize(run.InputBundle)
	if err != nil {
		return err
	}
	if size.characters <= budget && size.characters <= codexStructuredTaskInputCharacterLimit {
		return nil
	}
	if size.characters > codexStructuredTaskInputCharacterLimit {
		return fmt.Errorf(
			"cartographer final synthesis input bundle is %d serialized harness-input character(s), exceeding Codex structured-task limit %d character(s) and configured budget %d character(s) after deterministic compaction",
			size.characters,
			codexStructuredTaskInputCharacterLimit,
			budget,
		)
	}
	return fmt.Errorf(
		"cartographer final synthesis input bundle is %d serialized harness-input character(s), exceeding configured budget %d character(s) after deterministic compaction",
		size.characters,
		budget,
	)
}

func dedupeCartographerItems[T any](items []T, keyFor func(T) string) []T {
	result := make([]T, 0, len(items))
	indexByKey := map[string]int{}
	for _, item := range items {
		key := keyFor(item)
		if key == "" {
			result = append(result, item)
			continue
		}
		if index, ok := indexByKey[key]; ok {
			result[index] = item
			continue
		}
		indexByKey[key] = len(result)
		result = append(result, item)
	}
	return result
}

func dedupeStrings(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func cartographerTrajectoryEventDedupeKey(event CartographerTrajectoryEvent) string {
	if event.EventID == "" {
		return ""
	}
	return string(event.Source) + "|event|" + event.EventID
}

func cartographerObservationDedupeKey(observation CartographerObservationRecord) string {
	if observation.EventID != "" {
		return strings.Join([]string{string(observation.Source), string(observation.Kind), observation.EventID}, "|")
	}
	refs := []string{
		string(observation.Source),
		string(observation.Kind),
		observation.Type,
		observation.WorkflowExecutionID,
		observation.WorkflowNodeExecutionID,
		observation.ChatConversationID,
		observation.ChatRunID,
		observation.ChatMessageID,
		observation.RunItemID,
		observation.FilePath,
		fmt.Sprintf("%d", observation.OutputOrdinal),
	}
	return strings.Join(refs, "|")
}

func cartographerTrajectorySummaryDedupeKey(summary CartographerTrajectorySummary) string {
	if summary.ID != "" {
		return "summary:" + summary.ID
	}
	if summary.WindowID != "" {
		return "window:" + summary.WindowID
	}
	if summary.RunID != "" {
		return "run:" + summary.RunID
	}
	return ""
}

func cartographerAssistantDeltaObservationAggregateKey(observation CartographerObservationRecord) string {
	if observation.ChatMessageID != "" {
		return "message:" + observation.ChatMessageID
	}
	if observation.ChatRunID != "" {
		return "chat_run:" + observation.ChatRunID
	}
	if observation.RunItemID != "" {
		return "run_item:" + observation.RunItemID
	}
	return strings.Join([]string{string(observation.Source), observation.Type, observation.EventID}, "|")
}

func compactWorkflowDoneAggregateText(bundle CartographerInputBundle, config CartographerObservationConfig, budget int) CartographerInputBundle {
	assistantLimit := minPositive(config.MaxWindowContentBytes, maxInt(1024, budget/4))
	promptLimit := minPositive(config.MaxWindowContentBytes, maxInt(512, budget/8))
	summaryLimit := minPositive(config.MaxWindowContentBytes, maxInt(512, budget/10))
	bundle.AssistantText = boundedText(bundle.AssistantText, assistantLimit).text
	bundle.PromptText = boundedText(bundle.PromptText, promptLimit).text
	bundle.AssistantResponseSummary = boundedText(bundle.AssistantResponseSummary, summaryLimit).text
	bundle.PromptSummary = boundedText(bundle.PromptSummary, summaryLimit).text
	bundle.Truncation.DeterministicSummary = boundedText(bundle.Truncation.DeterministicSummary, summaryLimit).text
	return bundle
}

func limitWorkflowDoneTrajectorySummaries(items []CartographerTrajectorySummary, windowID string, limit int, config CartographerObservationConfig) []CartographerTrajectorySummary {
	if len(items) == 0 {
		return []CartographerTrajectorySummary{}
	}
	selected := map[int]bool{}
	count := 0
	for index := len(items) - 1; index >= 0; index-- {
		if items[index].WindowID == windowID {
			selected[index] = true
			continue
		}
		if count < limit {
			selected[index] = true
			count++
		}
	}
	result := make([]CartographerTrajectorySummary, 0, len(selected))
	for index, item := range items {
		if !selected[index] {
			continue
		}
		item.Summary = boundedText(item.Summary, minPositive(config.MaxWindowContentBytes, cartographerTrajectorySummaryLimit)).text
		result = append(result, item)
	}
	return result
}

func limitWorkflowDoneObservations(items []CartographerObservationRecord, limit int) []CartographerObservationRecord {
	if len(items) <= limit {
		return items
	}
	return selectWorkflowDonePriorityItems(items, limit, cartographerObservationHighValueForFinalSynthesis)
}

func limitWorkflowDoneEvents(items []CartographerTrajectoryEvent, limit int) []CartographerTrajectoryEvent {
	if len(items) <= limit {
		return items
	}
	return selectWorkflowDonePriorityItems(items, limit, cartographerEventHighValueForFinalSynthesis)
}

func selectWorkflowDonePriorityItems[T any](items []T, limit int, highValue func(T) bool) []T {
	if limit <= 0 {
		return []T{}
	}
	selected := map[int]bool{}
	for index := len(items) - 1; index >= 0 && len(selected) < limit; index-- {
		if highValue(items[index]) {
			selected[index] = true
		}
	}
	for index := len(items) - 1; index >= 0 && len(selected) < limit; index-- {
		selected[index] = true
	}
	result := make([]T, 0, len(selected))
	for index, item := range items {
		if selected[index] {
			result = append(result, item)
		}
	}
	return result
}

func cartographerObservationHighValueForFinalSynthesis(observation CartographerObservationRecord) bool {
	switch observation.Kind {
	case CartographerObservationAssistantMessageCompleted,
		CartographerObservationCommandCompleted,
		CartographerObservationCommandFailed,
		CartographerObservationFileChangeObserved,
		CartographerObservationDiffObserved,
		CartographerObservationTestResultObserved,
		CartographerObservationWorkflowNodeCompleted,
		CartographerObservationApprovalRequested,
		CartographerObservationRunCompleted:
		return true
	default:
		return false
	}
}

func cartographerEventHighValueForFinalSynthesis(event CartographerTrajectoryEvent) bool {
	if event.Boundary || isCartographerClosingReason(event.CloseReason) {
		return true
	}
	if event.MessageRole == string(chat.RoleAssistant) && isTerminalMessageStatusString(event.MessageStatus) {
		return true
	}
	switch chat.RunItemType(event.RunItemType) {
	case chat.RunItemTypeCommandExecution, chat.RunItemTypeFileChange, chat.RunItemTypeDiff, chat.RunItemTypeApprovalReview:
		return true
	}
	switch chat.RunStatus(event.RunStatus) {
	case chat.RunStatusCompleted, chat.RunStatusFailed, chat.RunStatusCancelled:
		return true
	}
	return false
}

func limitWorkflowDoneSemanticContext(bundle CartographerInputBundle, nodeLimit int, edgeLimit int, evidenceLimit int, activityLimit int, steeringLimit int, contextPackLimit int) CartographerInputBundle {
	bundle.ExistingNodes = limitSlice(bundle.ExistingNodes, nodeLimit)
	bundle.ExistingEdges = limitSlice(bundle.ExistingEdges, edgeLimit)
	bundle.Evidence = limitSlice(bundle.Evidence, evidenceLimit)
	bundle.Activity = limitSlice(bundle.Activity, activityLimit)
	bundle.Steering = limitSlice(bundle.Steering, steeringLimit)
	bundle.ContextPacks = limitSlice(bundle.ContextPacks, contextPackLimit)
	return bundle
}

func compactWorkflowDoneContextText(bundle CartographerInputBundle, limit int) CartographerInputBundle {
	for index := range bundle.ExistingNodes {
		bundle.ExistingNodes[index].Summary = boundedText(bundle.ExistingNodes[index].Summary, limit).text
	}
	for index := range bundle.ExistingEdges {
		bundle.ExistingEdges[index].Summary = boundedText(bundle.ExistingEdges[index].Summary, limit).text
	}
	for index := range bundle.Evidence {
		bundle.Evidence[index].Text = boundedText(bundle.Evidence[index].Text, limit).text
		bundle.Evidence[index].Summary = boundedText(bundle.Evidence[index].Summary, limit).text
	}
	for index := range bundle.Activity {
		bundle.Activity[index].Summary = boundedText(bundle.Activity[index].Summary, limit).text
	}
	for index := range bundle.Steering {
		bundle.Steering[index].Instruction = boundedText(bundle.Steering[index].Instruction, limit).text
	}
	for index := range bundle.ContextPacks {
		bundle.ContextPacks[index].DeliveredContext = boundedText(bundle.ContextPacks[index].DeliveredContext, limit).text
		for itemIndex := range bundle.ContextPacks[index].Items {
			bundle.ContextPacks[index].Items[itemIndex].Summary = boundedText(bundle.ContextPacks[index].Items[itemIndex].Summary, limit).text
			bundle.ContextPacks[index].Items[itemIndex].ReasonIncluded = boundedText(bundle.ContextPacks[index].Items[itemIndex].ReasonIncluded, limit).text
		}
	}
	return bundle
}

func compactWorkflowDoneObservationAndEventText(bundle CartographerInputBundle, limit int) CartographerInputBundle {
	for index := range bundle.Observations {
		bundle.Observations[index].Summary = boundedText(bundle.Observations[index].Summary, limit).text
		bundle.Observations[index].TextExcerpt = boundedText(bundle.Observations[index].TextExcerpt, limit).text
		bundle.Observations[index].ContentHash = cartographerObservationContentHash(firstNonEmpty(bundle.Observations[index].TextExcerpt, bundle.Observations[index].Summary))
	}
	for index := range bundle.NewEvents {
		text := boundedText(bundle.NewEvents[index].Summary, limit)
		bundle.NewEvents[index].Summary = text.text
		bundle.NewEvents[index].IncludedContentBytes = len([]byte(text.text))
		bundle.NewEvents[index].Truncated = bundle.NewEvents[index].Truncated || text.truncated
	}
	return bundle
}

func limitSlice[T any](items []T, limit int) []T {
	if limit <= 0 {
		return []T{}
	}
	if len(items) <= limit {
		return items
	}
	return append([]T{}, items[:limit]...)
}

func cartographerCompactionSummary(action string, before CartographerInputItemCounts, after CartographerInputItemCounts) string {
	return fmt.Sprintf("%s: %s", action, cartographerInputItemCountsSummary(cartographerInputItemCountsSubtract(before, after)))
}

func cartographerBudgetCompactionSummary(reason string, before CartographerInputItemCounts, after CartographerInputItemCounts, beforeSize cartographerSerializedInputSize, afterSize cartographerSerializedInputSize) string {
	return fmt.Sprintf(
		"%s reduced serialized input from %d to %d character(s); dropped %s",
		reason,
		beforeSize.characters,
		afterSize.characters,
		cartographerInputItemCountsSummary(cartographerInputItemCountsSubtract(before, after)),
	)
}

func cartographerInputItemCountsSubtract(left CartographerInputItemCounts, right CartographerInputItemCounts) CartographerInputItemCounts {
	return CartographerInputItemCounts{
		NewEvents:           nonNegativeInt(left.NewEvents - right.NewEvents),
		Observations:        nonNegativeInt(left.Observations - right.Observations),
		ToolCalls:           nonNegativeInt(left.ToolCalls - right.ToolCalls),
		FileChanges:         nonNegativeInt(left.FileChanges - right.FileChanges),
		TestResults:         nonNegativeInt(left.TestResults - right.TestResults),
		OutputSummaries:     nonNegativeInt(left.OutputSummaries - right.OutputSummaries),
		ExistingNodes:       nonNegativeInt(left.ExistingNodes - right.ExistingNodes),
		ExistingEdges:       nonNegativeInt(left.ExistingEdges - right.ExistingEdges),
		Evidence:            nonNegativeInt(left.Evidence - right.Evidence),
		Activity:            nonNegativeInt(left.Activity - right.Activity),
		Steering:            nonNegativeInt(left.Steering - right.Steering),
		ContextPacks:        nonNegativeInt(left.ContextPacks - right.ContextPacks),
		RetrievalResults:    nonNegativeInt(left.RetrievalResults - right.RetrievalResults),
		TrajectorySummaries: nonNegativeInt(left.TrajectorySummaries - right.TrajectorySummaries),
		ObservedEventRefs:   nonNegativeInt(left.ObservedEventRefs - right.ObservedEventRefs),
	}
}

func cartographerInputItemCountsAny(counts CartographerInputItemCounts) bool {
	for _, value := range cartographerInputItemCountValues(counts) {
		if value > 0 {
			return true
		}
	}
	return false
}

func cartographerInputItemCountsIsZero(counts CartographerInputItemCounts) bool {
	return !cartographerInputItemCountsAny(counts)
}

func cartographerInputItemCountValues(counts CartographerInputItemCounts) []int {
	return []int{
		counts.NewEvents,
		counts.Observations,
		counts.ToolCalls,
		counts.FileChanges,
		counts.TestResults,
		counts.OutputSummaries,
		counts.ExistingNodes,
		counts.ExistingEdges,
		counts.Evidence,
		counts.Activity,
		counts.Steering,
		counts.ContextPacks,
		counts.RetrievalResults,
		counts.TrajectorySummaries,
		counts.ObservedEventRefs,
	}
}

func cartographerInputItemCountsSummary(counts CartographerInputItemCounts) string {
	parts := []string{}
	appendCount := func(label string, value int) {
		if value > 0 {
			parts = append(parts, fmt.Sprintf("%s=%d", label, value))
		}
	}
	appendCount("newEvents", counts.NewEvents)
	appendCount("observations", counts.Observations)
	appendCount("toolCalls", counts.ToolCalls)
	appendCount("fileChanges", counts.FileChanges)
	appendCount("testResults", counts.TestResults)
	appendCount("outputSummaries", counts.OutputSummaries)
	appendCount("existingNodes", counts.ExistingNodes)
	appendCount("existingEdges", counts.ExistingEdges)
	appendCount("evidence", counts.Evidence)
	appendCount("activity", counts.Activity)
	appendCount("steering", counts.Steering)
	appendCount("contextPacks", counts.ContextPacks)
	appendCount("retrievalResults", counts.RetrievalResults)
	appendCount("trajectorySummaries", counts.TrajectorySummaries)
	appendCount("observedEventRefs", counts.ObservedEventRefs)
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, ", ")
}

func nonNegativeInt(value int) int {
	if value < 0 {
		return 0
	}
	return value
}
