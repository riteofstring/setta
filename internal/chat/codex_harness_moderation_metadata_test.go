package chat

import (
	"context"
	"strings"
	"testing"
)

func TestCodexHarnessHandlesTurnModerationMetadataAsTraceOnly(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("moderation-metadata-notification"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.items) != 0 || len(sink.outputs) != 0 {
		t.Fatalf("items=%+v outputs=%+v, want no moderation activity", sink.items, sink.outputs)
	}
	trace, ok := findTraceType(sink.traces, "codex_turn_moderation_metadata")
	if !ok {
		t.Fatalf("traces = %+v, want moderation metadata trace", sink.traces)
	}
	if strings.Contains(trace.message, "presentation") || strings.Contains(trace.message, "inline") {
		t.Fatalf("moderation trace message = %q, want bounded non-raw evidence", trace.message)
	}
	for _, diagnostic := range sink.diagnostics {
		if diagnostic.code == "codex_notification_unsupported" || diagnostic.severity == DiagnosticSeverityCritical {
			t.Fatalf("diagnostics = %+v, want no unsupported or critical diagnostic", sink.diagnostics)
		}
	}
}
