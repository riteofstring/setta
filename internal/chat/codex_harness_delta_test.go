package chat

import (
	"context"
	"strings"
	"testing"
)

func TestCodexHarnessAcceptsSchemaValidEmptyDeltas(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("empty-deltas"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "after empty" {
		t.Fatalf("assistant text = %q, want non-empty delta after accepted empty delta", sink.text)
	}
	if len(sink.outputs) != 0 {
		t.Fatalf("outputs = %+v, want no empty command output records", sink.outputs)
	}
}

func TestCodexHarnessAcceptsSchemaValidEmptyBase64OutputDeltas(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("empty-base64-output-deltas"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "after empty outputs" {
		t.Fatalf("assistant text = %q, want non-empty delta after accepted empty output deltas", sink.text)
	}
	if len(sink.outputs) != 0 {
		t.Fatalf("outputs = %+v, want no empty output records", sink.outputs)
	}
	if len(sink.items) != 2 {
		t.Fatalf("items = %+v, want command and process run items", sink.items)
	}
}

func TestCodexHarnessRejectsUnsupportedOutputStream(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unsupported-output-stream"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want unsupported output stream error")
	}
	if !strings.Contains(err.Error(), "unsupported codex output stream: stdlog") {
		t.Fatalf("error = %q, want unsupported output stream", err)
	}
}
