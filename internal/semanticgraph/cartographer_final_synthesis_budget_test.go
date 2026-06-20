package semanticgraph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/chat"
)

func TestWorkflowDoneFinalSynthesisDedupesFoldedContextAndCollapsesAssistantDeltas(t *testing.T) {
	config := DefaultCartographerObservationConfig()
	config.MaxWindowEvents = 2000
	config.MaxWindowContentBytes = 20000
	budget := 100000
	final := CartographerInputBundle{
		WorkspaceID: testWorkspaceID,
		TriggerKind: CartographerTriggerWorkflowDone,
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID: "workflow_execution_final_budget",
			ChatConversationID:  "chat_conversation_final_budget",
			ChatRunID:           "chat_run_final_budget",
		},
		TargetEntityID: "node_final_budget",
		RunStatus:      string(chat.RunStatusCompleted),
		WindowID:       "cartographer_window_final_budget",
		AssistantText:  "Final assistant answer preserves the actionable result.",
		NewEvents: []CartographerTrajectoryEvent{{
			Source:      CartographerTrajectorySourceWorkflow,
			EventID:     "workflow_event_final_budget_terminal",
			Type:        "workflow.execution.completed",
			SourceRefs:  SemanticContextSourceRefs{WorkflowExecutionID: "workflow_execution_final_budget"},
			Summary:     "workflow completed successfully",
			Boundary:    true,
			CloseReason: CartographerCloseWorkflowRunTerminal,
		}},
		ObservedEventRefs: []string{"workflow_event_final_budget_terminal"},
	}
	foldedInput := duplicateFinalSynthesisFoldedInput()
	folded := []CartographerWindow{
		{ID: "cartographer_window_folded_budget_a", WorkspaceID: testWorkspaceID, RunID: "cartographer_run_folded_budget_a", InputBundle: foldedInput},
		{ID: "cartographer_window_folded_budget_b", WorkspaceID: testWorkspaceID, RunID: "cartographer_run_folded_budget_b", InputBundle: foldedInput},
	}

	bundle := cartographerWorkflowDoneInputBundle(final, folded, config, budget)
	if len(bundle.Evidence) != 1 ||
		len(bundle.ExistingNodes) != 1 ||
		len(bundle.ExistingEdges) != 1 ||
		len(bundle.TrajectorySummaries) != 1 ||
		len(bundle.ObservedEventRefs) != 2 {
		t.Fatalf("deduped final bundle counts = %+v, want duplicate folded context collapsed", cartographerInputItemCounts(bundle))
	}
	if got := countAssistantDeltaObservations(bundle.Observations); got != 1 {
		t.Fatalf("assistant delta observations = %d, want one collapsed aggregate", got)
	}
	if bundle.Truncation.FoldedWindowCount != 2 ||
		bundle.Truncation.DroppedItemCounts.Evidence == 0 ||
		bundle.Truncation.DroppedItemCounts.ExistingNodes == 0 ||
		bundle.Truncation.DroppedItemCounts.TrajectorySummaries == 0 ||
		!stringSliceContains(bundle.Truncation.Reasons, "workflow_done_deduplicated_context") ||
		!stringSliceContains(bundle.Truncation.Reasons, "assistant_delta_observations_collapsed") {
		t.Fatalf("final truncation audit = %+v, want folded, dedupe, and collapse accounting", bundle.Truncation)
	}
	serialized, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("marshal final bundle: %v", err)
	}
	if bundle.Truncation.SerializedInputCharacterCount != len([]rune(string(serialized))) ||
		bundle.Truncation.SerializedInputBytes != len(serialized) ||
		bundle.Truncation.SerializedInputCharacterCount <= bundle.Truncation.IncludedContentBytes {
		t.Fatalf("serialized/input content accounting = %+v serialized=%d, want actual serialized size recorded separately from content bytes", bundle.Truncation, len(serialized))
	}
}

func TestWorkflowDoneFinalSynthesisCompactsToSerializedInputBudget(t *testing.T) {
	config := DefaultCartographerObservationConfig()
	config.MaxWindowEvents = 2000
	config.MaxWindowContentBytes = 40000
	budget := 9000
	final := CartographerInputBundle{
		WorkspaceID: testWorkspaceID,
		TriggerKind: CartographerTriggerWorkflowDone,
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID: "workflow_execution_compact_budget",
			ChatConversationID:  "chat_conversation_compact_budget",
			ChatRunID:           "chat_run_compact_budget",
		},
		TargetEntityID:           "node_compact_budget",
		RunStatus:                string(chat.RunStatusCompleted),
		WindowID:                 "cartographer_window_compact_budget",
		AssistantText:            "Final answer: keep the result and the command outcome. " + strings.Repeat("assistant detail ", 200),
		AssistantResponseSummary: "assistant completed with concrete result",
		ToolCalls:                []CartographerToolCallSummary{{RunItemID: "run_item_compact_command", Type: string(chat.RunItemTypeCommandExecution), Status: string(chat.RunItemStatusCompleted), Command: "pnpm test", ResultSummary: "tests passed"}},
		TestResults:              []CartographerTestResultSummary{{RunItemID: "run_item_compact_command", Command: "pnpm test", ExitCode: 0, Result: "tests passed"}},
		FileChanges:              []CartographerFileChangeSummary{{RunItemID: "run_item_compact_file", FilePaths: []string{"internal/semanticgraph/cartographer_final_synthesis_budget.go"}, DiffSummary: "added budget compaction"}},
		NewEvents:                compactBudgetEvents(),
		RetrievalResults:         compactBudgetRetrievalResults(60),
		TrajectorySummaries:      compactBudgetTrajectorySummaries(80),
		Observations:             compactBudgetObservations(80),
		ObservedEventRefs:        []string{"workflow_event_compact_terminal"},
		Truncation:               CartographerInputTruncation{Reasons: []string{}},
	}

	bundle := cartographerWorkflowDoneInputBundle(final, nil, config, budget)
	if bundle.Truncation.BudgetExceeded ||
		bundle.Truncation.SerializedInputCharacterCount > budget ||
		bundle.Truncation.InputBudgetCharacters != budget {
		t.Fatalf("compacted final truncation = %+v, want serialized input within budget %d", bundle.Truncation, budget)
	}
	if bundle.AssistantText == "" ||
		len(bundle.ToolCalls) != 1 ||
		len(bundle.TestResults) != 1 ||
		len(bundle.FileChanges) != 1 ||
		!cartographerEventsContainCloseReason(bundle.NewEvents, CartographerCloseWorkflowRunTerminal) {
		t.Fatalf("compacted final bundle = %+v, want high-value final evidence preserved", bundle)
	}
	if len(bundle.RetrievalResults) != 0 ||
		!stringSliceContains(bundle.Truncation.Reasons, "workflow_done_retrieval_results_dropped") {
		t.Fatalf("compacted final bundle retrieval/truncation = %d %+v, want low-value retrieval dropped first", len(bundle.RetrievalResults), bundle.Truncation)
	}
}

func TestProcessCartographerWindowFailsOversizedFinalSynthesisBeforeHarness(t *testing.T) {
	fake := chat.NewFakeHarness(nil)
	service, store := newCartographerRunnerTestService(t, chat.HarnessTaskRunnerFor(fake))
	ctx := context.Background()
	record, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	settings := record.Settings
	settings.FinalSynthesisTaskConfig.InputBudget = 1
	if _, err := store.UpdateSemanticCartographerSettings(ctx, settings); err != nil {
		t.Fatalf("update final synthesis budget: %v", err)
	}
	window, err := service.BuildManualCartographerWindow(ctx, CartographerManualWindowRequest{
		WorkspaceID: testWorkspaceID,
		TriggerKind: CartographerTriggerWorkflowDone,
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID: "workflow_execution_preflight_budget",
			ChatConversationID:  "chat_conversation_preflight_budget",
			ChatRunID:           "chat_run_preflight_budget",
		},
		Summary: "Final synthesis preflight budget fixture.",
	})
	if err != nil {
		t.Fatalf("build final cartographer window: %v", err)
	}

	result, err := service.ProcessCartographerWindow(ctx, testWorkspaceID, window.ID)
	if err != nil {
		t.Fatalf("process oversized final synthesis: %v", err)
	}
	if len(fake.StructuredTaskRequests()) != 0 {
		t.Fatalf("structured tasks = %+v, want final synthesis to fail before harness", fake.StructuredTaskRequests())
	}
	if result.Run.Status != CartographerRunFailed ||
		result.Run.RequestedInputBudget != 1 ||
		!result.Run.InputBundle.Truncation.BudgetExceeded ||
		!cartographerDiagnosticsContain(result.Run.Diagnostics, result.Patches, "input_budget_exceeded") ||
		!strings.Contains(result.Run.Error, "serialized harness-input character") {
		t.Fatalf("oversized final synthesis result = %+v, want pre-harness failed audit", result)
	}
	if result.Window.Status != CartographerWindowProcessed {
		t.Fatalf("oversized final window status = %s, want processed", result.Window.Status)
	}
}

func duplicateFinalSynthesisFoldedInput() CartographerInputBundle {
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID: "workflow_execution_final_budget",
		ChatConversationID:  "chat_conversation_final_budget",
		ChatRunID:           "chat_run_final_budget",
		ChatMessageID:       "chat_message_final_budget_delta",
	}
	observations := make([]CartographerObservationRecord, 0, 20)
	for index := 0; index < 20; index++ {
		observations = append(observations, CartographerObservationRecord{
			Kind:                CartographerObservationAssistantTextChunkAggregate,
			Source:              CartographerTrajectorySourceChat,
			EventID:             "chat_event_final_budget_delta_" + threeDigit(index+1),
			Type:                chat.EventTypeAssistantTextDelta,
			WorkspaceID:         testWorkspaceID,
			WorkflowExecutionID: sourceRefs.WorkflowExecutionID,
			ChatConversationID:  sourceRefs.ChatConversationID,
			ChatRunID:           sourceRefs.ChatRunID,
			ChatMessageID:       sourceRefs.ChatMessageID,
			MessageRole:         string(chat.RoleAssistant),
			Summary:             "assistant delta",
			TextExcerpt:         "delta text",
			ContentHash:         "sha256:delta",
			OccurredAt:          testTimestamp(40 + index),
		})
	}
	return CartographerInputBundle{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    CartographerTriggerWorkflowWindow,
		SourceRefs:     sourceRefs,
		TargetEntityID: "node_final_budget",
		Observations:   observations,
		ExistingNodes: []SemanticNode{{
			ID:          "node_duplicate_final_budget",
			WorkspaceID: testWorkspaceID,
			Kind:        NodeKindFinding,
			Label:       "Duplicate context node",
			Summary:     strings.Repeat("node summary ", 40),
			CreatedAt:   testTimestamp(20),
			UpdatedAt:   testTimestamp(21),
		}},
		ExistingEdges: []SemanticEdge{{
			ID:          "edge_duplicate_final_budget",
			WorkspaceID: testWorkspaceID,
			Kind:        EdgeKindSupports,
			FromNodeID:  "node_duplicate_final_budget",
			ToNodeID:    "node_final_budget",
			Summary:     strings.Repeat("edge summary ", 20),
			CreatedAt:   testTimestamp(22),
			UpdatedAt:   testTimestamp(23),
		}},
		Evidence: []SemanticEvidenceAnchor{{
			ID:                  "evidence_duplicate_final_budget",
			WorkspaceID:         testWorkspaceID,
			TargetEntityID:      "node_duplicate_final_budget",
			SourceKind:          EvidenceSourceChatMessage,
			SourceID:            sourceRefs.ChatMessageID,
			Text:                "Assistant text establishes the final evidence.",
			Summary:             "Final assistant evidence",
			WorkflowExecutionID: sourceRefs.WorkflowExecutionID,
			ChatConversationID:  sourceRefs.ChatConversationID,
			ChatRunID:           sourceRefs.ChatRunID,
			ChatMessageID:       sourceRefs.ChatMessageID,
			CreatedAt:           testTimestamp(24),
		}},
		TrajectorySummaries: []CartographerTrajectorySummary{{
			ID:          "cartographer_summary_duplicate_final_budget",
			WorkspaceID: testWorkspaceID,
			RunID:       "cartographer_run_duplicate_final_budget",
			WindowID:    "cartographer_window_duplicate_final_budget",
			SourceKind:  CartographerSourceChatRun,
			SourceID:    sourceRefs.ChatRunID,
			Summary:     strings.Repeat("prior summary ", 80),
			SourceRefs:  sourceRefs,
			ItemCount:   20,
			CreatedAt:   testTimestamp(25),
		}},
		ObservedEventRefs: []string{"chat_event_final_budget_delta_001"},
	}
}

func compactBudgetEvents() []CartographerTrajectoryEvent {
	return []CartographerTrajectoryEvent{
		{
			Source:      CartographerTrajectorySourceChat,
			EventID:     "chat_event_compact_assistant_done",
			Type:        chat.EventTypeMessageUpdated,
			SourceRefs:  SemanticContextSourceRefs{ChatMessageID: "chat_message_compact_assistant"},
			MessageRole: string(chat.RoleAssistant),
			Summary:     strings.Repeat("assistant completed ", 20),
		},
		{
			Source:      CartographerTrajectorySourceWorkflow,
			EventID:     "workflow_event_compact_terminal",
			Type:        "workflow.execution.completed",
			SourceRefs:  SemanticContextSourceRefs{WorkflowExecutionID: "workflow_execution_compact_budget"},
			Summary:     "workflow completed",
			Boundary:    true,
			CloseReason: CartographerCloseWorkflowRunTerminal,
		},
	}
}

func compactBudgetRetrievalResults(count int) []SemanticRetrievalResult {
	results := make([]SemanticRetrievalResult, 0, count)
	for index := 0; index < count; index++ {
		results = append(results, SemanticRetrievalResult{
			ID:       "retrieval_compact_budget_" + threeDigit(index+1),
			Source:   "semantic",
			RecordID: "record_compact_budget_" + threeDigit(index+1),
			Title:    "retrieval candidate",
			Summary:  strings.Repeat("retrieval repeated context ", 20),
			Reasons:  []string{strings.Repeat("retrieval reason ", 12)},
		})
	}
	return results
}

func compactBudgetTrajectorySummaries(count int) []CartographerTrajectorySummary {
	summaries := make([]CartographerTrajectorySummary, 0, count)
	for index := 0; index < count; index++ {
		summaries = append(summaries, CartographerTrajectorySummary{
			ID:          "cartographer_summary_compact_budget_" + threeDigit(index+1),
			WorkspaceID: testWorkspaceID,
			RunID:       "cartographer_run_compact_budget_" + threeDigit(index+1),
			WindowID:    "cartographer_window_compact_budget_" + threeDigit(index+1),
			SourceKind:  CartographerSourceWorkflowExecution,
			SourceID:    "workflow_execution_compact_budget",
			Summary:     strings.Repeat("prior window summary ", 20),
			ItemCount:   5,
			CreatedAt:   testTimestamp(30 + index),
		})
	}
	return summaries
}

func compactBudgetObservations(count int) []CartographerObservationRecord {
	observations := make([]CartographerObservationRecord, 0, count)
	for index := 0; index < count; index++ {
		observations = append(observations, CartographerObservationRecord{
			Kind:        CartographerObservationWorkflowNodeCompleted,
			Source:      CartographerTrajectorySourceWorkflow,
			EventID:     "workflow_event_observation_compact_" + threeDigit(index+1),
			Type:        "workflow.node.completed",
			WorkspaceID: testWorkspaceID,
			Summary:     strings.Repeat("workflow observation ", 10),
			TextExcerpt: strings.Repeat("workflow excerpt ", 10),
			OccurredAt:  testTimestamp(30 + index),
		})
	}
	return observations
}

func countAssistantDeltaObservations(observations []CartographerObservationRecord) int {
	count := 0
	for _, observation := range observations {
		if observation.Kind == CartographerObservationAssistantTextChunkAggregate {
			count++
		}
	}
	return count
}

func cartographerEventsContainCloseReason(events []CartographerTrajectoryEvent, reason CartographerWindowCloseReason) bool {
	for _, event := range events {
		if event.CloseReason == reason {
			return true
		}
	}
	return false
}
