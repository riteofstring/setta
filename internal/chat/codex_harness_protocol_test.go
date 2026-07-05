package chat

import (
	"context"
	"strings"
	"testing"
)

func TestCodexHarnessUsesTurnStartedIDForTurnScopedNotifications(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("turn-started-id"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	if sink.text != "provider turn" {
		t.Fatalf("assistant text = %q, want provider turn response", sink.text)
	}
	if sink.threadID != "thread_fake" || sink.turnID != "turn_provider" {
		t.Fatalf("linked refs = %q %q, want provider turn id", sink.threadID, sink.turnID)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want no provider drift", sink.diagnostics)
	}
}

func TestCodexHarnessRebindsFirstSameThreadTurnScopedNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("provider-item-turn-id"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	if sink.text != "provider item turn" {
		t.Fatalf("assistant text = %q, want provider turn response", sink.text)
	}
	if sink.threadID != "thread_fake" || sink.turnID != "turn_provider" {
		t.Fatalf("linked refs = %q %q, want provider turn ref", sink.threadID, sink.turnID)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessStoresStructuredPlanUpdatedNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("plan-updated"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	item := requireRunItemType(t, sink.items, RunItemTypePlan)
	if item.ProviderItemID != "plan_turn_fake" || item.Summary != "" {
		t.Fatalf("plan item = %+v, want typed plan item without summary fallback", item)
	}
	details, ok := item.PlanDetails()
	if !ok {
		t.Fatalf("plan item details = %+v, want typed plan details", item.Details)
	}
	if details.Explanation != "Updating the turn plan." {
		t.Fatalf("plan explanation = %q, want provider explanation", details.Explanation)
	}
	wantSteps := []RunItemPlanStep{
		{Status: RunItemPlanStepStatusCompleted, Step: "Read the plan"},
		{Status: RunItemPlanStepStatusInProgress, Step: "Implement the typed contract"},
		{Status: RunItemPlanStepStatusPending, Step: "Render the active surface"},
	}
	if len(details.Steps) != len(wantSteps) {
		t.Fatalf("plan steps = %+v, want %+v", details.Steps, wantSteps)
	}
	for index, want := range wantSteps {
		if details.Steps[index] != want {
			t.Fatalf("plan step %d = %+v, want %+v", index, details.Steps[index], want)
		}
	}
}

func TestCodexRunItemStatusMappingCoversCurrentProtocolValues(t *testing.T) {
	tests := map[string]RunItemStatus{
		"completed":   RunItemStatusCompleted,
		"declined":    RunItemStatusCancelled,
		"failed":      RunItemStatusFailed,
		"inProgress":  RunItemStatusRunning,
		"interrupted": RunItemStatusCancelled,
		"succeeded":   RunItemStatusCompleted,
	}
	for status, want := range tests {
		got, err := mapCodexItemStatus(status)
		if err != nil {
			t.Fatalf("map status %s: %v", status, err)
		}
		if got != want {
			t.Fatalf("map status %s = %s, want %s", status, got, want)
		}
	}
}

func TestCodexRunItemStatusMappingRejectsUnknownValues(t *testing.T) {
	_, err := mapCodexItemStatus("running")
	if err == nil {
		t.Fatal("map status succeeded, want unsupported status error")
	}
	if !strings.Contains(err.Error(), "unsupported codex item status: running") {
		t.Fatalf("error = %q, want unsupported status", err)
	}
}

func TestCodexPlanStepStatusMappingRejectsUnknownValues(t *testing.T) {
	_, err := runItemPlanStepStatusFromCodex("blocked")
	if err == nil {
		t.Fatal("map plan step status succeeded, want unsupported status error")
	}
	if !strings.Contains(err.Error(), "unsupported codex plan step status: blocked") {
		t.Fatalf("error = %q, want unsupported status", err)
	}
}

func writeFakeProviderTurnID() {
	writeFakeTurnStartedID("turn_provider")
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    "provider turn",
		"itemId":   "agent_message_provider_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_provider",
	})
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn": map[string]any{
			"id":     "turn_provider",
			"items":  []any{},
			"status": "completed",
		},
	})
}

func writeFakePlanUpdatedTurn() {
	writeFakeTurnStartedID("turn_fake")
	writeFakeNotification("turn/plan/updated", map[string]any{
		"explanation": "Updating the turn plan.",
		"plan": []map[string]any{
			{
				"status": "completed",
				"step":   "Read the plan",
			},
			{
				"status": "inProgress",
				"step":   "Implement the typed contract",
			},
			{
				"status": "pending",
				"step":   "Render the active surface",
			},
		},
		"summary":  "legacy summary that must not be used",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeCompletedTurn("completed")
}

func writeFakeProviderItemTurnID() {
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"item": map[string]any{
			"id":   "agent_message_provider_fake",
			"text": "",
			"type": "agentMessage",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_provider",
	})
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    "provider item turn",
		"itemId":   "agent_message_provider_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_provider",
	})
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn": map[string]any{
			"id":     "turn_provider",
			"items":  []any{},
			"status": "completed",
		},
	})
}
