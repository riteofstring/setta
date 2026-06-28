package chat

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func terminalInteractionMessage(params string) jsonRPCMessage {
	return jsonRPCMessage{
		Method: codexapp.CodexNotificationItemCommandExecutionTerminalInteraction,
		Params: json.RawMessage(params),
	}
}

// TestCodexTerminalInteractionDecodesRealSchema proves the handler decodes the actual Codex
// terminalInteraction notification (itemId/processId/stdin/threadId/turnId) and carries the
// unified exec discriminators. The previous handler hand-rolled the params and required a
// non-existent "text" field, so real notifications failed to decode and the projected item had
// neither a process handle nor a source.
func TestCodexTerminalInteractionDecodesRealSchema(t *testing.T) {
	sink := newRecordingSink()
	message := terminalInteractionMessage(`{"itemId":"item_term","processId":"proc_term","stdin":"echo hi\n","threadId":"thread_x","turnId":"turn_x"}`)
	if _, err := handleCodexTerminalInteraction(message, "thread_x", "turn_x", sink); err != nil {
		t.Fatalf("handle terminal interaction: %v", err)
	}
	if len(sink.items) != 1 {
		t.Fatalf("items = %+v, want one terminal interaction item", sink.items)
	}
	item := sink.items[0]
	if item.Type != RunItemTypeTerminalInteraction {
		t.Fatalf("item type = %s, want terminal_interaction", item.Type)
	}
	if item.ProviderItemID != "item_term_terminal" {
		t.Fatalf("item providerItemId = %q, want item_term_terminal", item.ProviderItemID)
	}
	if item.ProcessID != "proc_term" {
		t.Fatalf("item processId = %q, want proc_term", item.ProcessID)
	}
	if item.Source == nil || *item.Source != RunItemCommandSourceUnifiedExecInteraction {
		t.Fatalf("item source = %v, want unified_exec_interaction", item.Source)
	}
	if item.Summary != "echo hi\n" {
		t.Fatalf("item summary = %q, want stdin content", item.Summary)
	}
}

// TestCodexTerminalInteractionEmptyStdinIsNoOp proves an empty stdin interaction (a wait/poll)
// decodes successfully but creates no permanent transcript activity. Phase 2 routes these into a
// live waiting status; Phase 1 must not emit a terminal interaction row for them.
func TestCodexTerminalInteractionEmptyStdinIsNoOp(t *testing.T) {
	sink := newRecordingSink()
	message := terminalInteractionMessage(`{"itemId":"item_term","processId":"proc_term","stdin":"","threadId":"thread_x","turnId":"turn_x"}`)
	if _, err := handleCodexTerminalInteraction(message, "thread_x", "turn_x", sink); err != nil {
		t.Fatalf("handle empty terminal interaction: %v", err)
	}
	if len(sink.items) != 0 {
		t.Fatalf("items = %+v, want no item for an empty stdin wait", sink.items)
	}
}

// TestCodexTerminalInteractionRequiresProcessId proves the handler validates against the generated
// schema instead of the old text-shaped params: a notification missing processId fails loudly
// rather than projecting a terminal with no provider handle.
func TestCodexTerminalInteractionRequiresProcessId(t *testing.T) {
	sink := newRecordingSink()
	message := terminalInteractionMessage(`{"itemId":"item_term","stdin":"echo hi\n","threadId":"thread_x","turnId":"turn_x"}`)
	_, err := handleCodexTerminalInteraction(message, "thread_x", "turn_x", sink)
	if err == nil {
		t.Fatal("expected missing processId to fail")
	}
	if !strings.Contains(err.Error(), "processId") {
		t.Fatalf("error = %v, want processId required", err)
	}
}

// TestCodexTerminalInteractionRejectsEmptyIdentifiers proves the handler guards the lifecycle
// identifiers beyond the generated decoder's presence/type check: a present-but-empty itemId or
// processId fails loudly rather than projecting a "_terminal" item with no process handle.
func TestCodexTerminalInteractionRejectsEmptyIdentifiers(t *testing.T) {
	cases := []struct {
		name    string
		params  string
		wantSub string
	}{
		{"empty itemId", `{"itemId":"","processId":"proc_term","stdin":"echo hi\n","threadId":"thread_x","turnId":"turn_x"}`, "itemId"},
		{"empty processId", `{"itemId":"item_term","processId":"","stdin":"echo hi\n","threadId":"thread_x","turnId":"turn_x"}`, "processId"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			sink := newRecordingSink()
			_, err := handleCodexTerminalInteraction(terminalInteractionMessage(testCase.params), "thread_x", "turn_x", sink)
			if err == nil {
				t.Fatalf("expected %s to fail", testCase.name)
			}
			if !strings.Contains(err.Error(), testCase.wantSub) {
				t.Fatalf("error = %v, want substring %q", err, testCase.wantSub)
			}
			if len(sink.items) != 0 {
				t.Fatalf("items = %+v, want none for malformed identifier", sink.items)
			}
		})
	}
}
