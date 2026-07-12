package chat

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/codexapp"
)

func TestCodexHarnessFailsOnTurnScopedNotificationMismatch(t *testing.T) {
	tests := []struct {
		mode       string
		wantText   string
		wantItems  int
		wantOutput int
	}{
		{mode: "mismatched-assistant-delta"},
		{mode: "mismatched-item-upsert"},
		{mode: "mismatched-moderation-metadata-turn"},
		{mode: "mismatched-output-delta"},
		{mode: "mismatched-turn-completed"},
	}
	for _, tt := range tests {
		t.Run(tt.mode, func(t *testing.T) {
			harness := NewCodexHarness(testCodexConfig(tt.mode))
			sink := newRecordingSink()

			_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
			if err == nil {
				t.Fatal("start turn succeeded, want provider scope drift error")
			}
			if !strings.Contains(err.Error(), "codex notification") || !strings.Contains(err.Error(), "scope mismatched_ids") {
				t.Fatalf("error = %q, want scope mismatch", err)
			}
			if len(sink.diagnostics) != 1 {
				t.Fatalf("diagnostics = %+v, want one provider diagnostic", sink.diagnostics)
			}
			diagnostic := sink.diagnostics[0]
			if diagnostic.code != "codex_notification_scope_drift" || !diagnostic.resyncRequired {
				t.Fatalf("diagnostic = %+v, want scope drift resync diagnostic", diagnostic)
			}
			if diagnostic.context["expectedThreadId"] != "thread_fake" || diagnostic.context["expectedTurnId"] != "turn_fake" {
				t.Fatalf("diagnostic context = %+v, want expected thread and turn", diagnostic.context)
			}
			if sink.text != tt.wantText || len(sink.items) != tt.wantItems || len(sink.outputs) != tt.wantOutput {
				t.Fatalf("mutated sink text=%q items=%+v outputs=%+v", sink.text, sink.items, sink.outputs)
			}
		})
	}
}

func TestCodexTurnModerationMetadataRejectsMismatchedThread(t *testing.T) {
	sink := newRecordingSink()
	message := codexapp.Message{
		Method: codexapp.CodexNotificationTurnModerationMetadata,
		Params: json.RawMessage(`{"threadId":"thread_other","turnId":"turn_fake","metadata":{"presentation":"inline"}}`),
	}

	_, err := handleCodexNotification(message, "thread_fake", "turn_fake", sink)
	if err == nil {
		t.Fatal("handle notification succeeded, want provider scope drift error")
	}
	if !strings.Contains(err.Error(), "codex notification") || !strings.Contains(err.Error(), "scope mismatched_ids") {
		t.Fatalf("error = %q, want scope mismatch", err)
	}
	if len(sink.diagnostics) != 1 {
		t.Fatalf("diagnostics = %+v, want one provider diagnostic", sink.diagnostics)
	}
	diagnostic := sink.diagnostics[0]
	if diagnostic.code != "codex_notification_scope_drift" || !diagnostic.resyncRequired {
		t.Fatalf("diagnostic = %+v, want scope drift resync diagnostic", diagnostic)
	}
	if diagnostic.context["expectedThreadId"] != "thread_fake" || diagnostic.context["receivedThreadId"] != "thread_other" {
		t.Fatalf("diagnostic context = %+v, want thread mismatch", diagnostic.context)
	}
}

func TestCodexWarningAllowsThreadScopeWithoutTurnID(t *testing.T) {
	sink := newRecordingSink()
	message := codexapp.Message{
		Method: codexapp.CodexNotificationWarning,
		Params: json.RawMessage(`{"message":"falling back to HTTPS","threadId":"thread_fake"}`),
	}

	_, err := handleCodexNotification(message, "thread_fake", "turn_fake", sink)
	if err != nil {
		t.Fatalf("handle warning notification: %v", err)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
	notice := requireRunItemType(t, sink.items, RunItemTypeNotice)
	if notice.NoticeKind != codexapp.CodexNotificationWarning || notice.NoticeMessage != "falling back to HTTPS" {
		t.Fatalf("notice = %+v, want warning notice", notice)
	}
}

func TestCodexWarningRejectsMismatchedThread(t *testing.T) {
	sink := newRecordingSink()
	message := codexapp.Message{
		Method: codexapp.CodexNotificationWarning,
		Params: json.RawMessage(`{"message":"wrong thread","threadId":"thread_other"}`),
	}

	_, err := handleCodexNotification(message, "thread_fake", "turn_fake", sink)
	if err == nil {
		t.Fatal("handle warning notification succeeded, want provider scope drift error")
	}
	if !strings.Contains(err.Error(), "codex notification") || !strings.Contains(err.Error(), "scope mismatched_ids") {
		t.Fatalf("error = %q, want scope mismatch", err)
	}
	if len(sink.diagnostics) != 1 {
		t.Fatalf("diagnostics = %+v, want one provider diagnostic", sink.diagnostics)
	}
	diagnostic := sink.diagnostics[0]
	if diagnostic.code != "codex_notification_scope_drift" || !diagnostic.resyncRequired {
		t.Fatalf("diagnostic = %+v, want scope drift resync diagnostic", diagnostic)
	}
	if diagnostic.context["expectedThreadId"] != "thread_fake" || diagnostic.context["receivedThreadId"] != "thread_other" {
		t.Fatalf("diagnostic context = %+v, want thread mismatch", diagnostic.context)
	}
}

func TestCodexHarnessIgnoresUnownedScopedNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unowned-scoped-notification"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want valid stream only", sink.text)
	}
	for _, diagnostic := range sink.diagnostics {
		if diagnostic.code == "codex_notification_scope_drift" {
			t.Fatalf("diagnostics = %+v, want no scope drift for unowned notification", sink.diagnostics)
		}
	}
}

func handleFakeMismatchMode(mode string) bool {
	switch mode {
	case "mismatched-assistant-delta":
		writeFakeMismatchedAssistantDelta()
	case "mismatched-item-upsert":
		writeFakeMismatchedItemUpsert()
	case "mismatched-moderation-metadata-turn":
		writeFakeMismatchedModerationMetadata("thread_fake", "turn_other")
	case "mismatched-output-delta":
		writeFakeMismatchedOutputDelta()
	case "mismatched-turn-completed":
		writeFakeMismatchedCompletedTurn()
	case "unowned-scoped-notification":
		writeFakeUnownedScopedNotification()
	default:
		return false
	}
	return true
}

func writeFakeMismatchedAssistantDelta() {
	writeFakeTurnStartedID("turn_fake")
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    "wrong",
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_other",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeMismatchedItemUpsert() {
	writeFakeTurnStartedID("turn_fake")
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"item": map[string]any{
			"command":        "go test ./...",
			"commandActions": []any{},
			"cwd":            "/tmp/workspace",
			"id":             "command_fake",
			"status":         "inProgress",
			"type":           "commandExecution",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_other",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeMismatchedModerationMetadata(threadID string, turnID string) {
	writeFakeTurnStartedID("turn_fake")
	writeFakeNotification("turn/moderationMetadata", map[string]any{
		"metadata": map[string]any{
			"presentation": "inline",
		},
		"threadId": threadID,
		"turnId":   turnID,
	})
	time.Sleep(2 * time.Second)
}

func writeFakeMismatchedOutputDelta() {
	writeFakeTurnStartedID("turn_fake")
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "wrong\n",
		"itemId":   "command_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_other",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeMismatchedCompletedTurn() {
	writeFakeTurnStartedID("turn_fake")
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn":     map[string]any{"id": "turn_other", "items": []any{}, "status": "completed"},
	})
	time.Sleep(2 * time.Second)
}

func writeFakeUnownedScopedNotification() {
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    "wrong",
		"itemId":   "item_stale",
		"threadId": "thread_other",
		"turnId":   "turn_stale",
	})
	writeFakeStreamTurn()
}
