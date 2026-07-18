package chat

import (
	"context"
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
	if len(sink.items) != 0 {
		t.Fatalf("items = %+v, want no standalone command or process run items", sink.items)
	}
}

func TestCodexHarnessIgnoresStandaloneUnsupportedOutputStream(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unsupported-output-stream"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "after standalone output" {
		t.Fatalf("assistant text = %q, want turn to continue after ignored standalone output", sink.text)
	}
	if len(sink.outputs) != 0 || len(sink.items) != 0 {
		t.Fatalf("items = %+v outputs = %+v, want standalone output ignored", sink.items, sink.outputs)
	}
}
