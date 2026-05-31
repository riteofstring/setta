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

func writeFakeProviderItemTurnID() {
	writeFakeNotification("item/started", map[string]any{
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
