package chat

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestCodexHarnessBurstCommandOutputDoesNotFailTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("burst-output"))
	sink := newSlowRecordingSink(2 * time.Millisecond)

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start burst turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "burst complete" {
		t.Fatalf("assistant text = %q, want burst completion text", sink.text)
	}
	command := requireLastRunItemByProvider(t, sink.items, "burst_command")
	details, ok := command.CommandExecutionDetails()
	if command.Status != RunItemStatusCompleted || !ok || details.ExitCode != 0 {
		t.Fatalf("burst command = %+v details=%+v, want completed exit 0", command, details)
	}
	requireSkippedOutputMarker(t, sink.outputs, "burst_command")
	if _, ok := findTraceType(sink.traces, "codex_app_server_backpressure"); !ok {
		t.Fatalf("traces = %+v, want backpressure trace", sink.traces)
	}

	followup := newRecordingSink()
	completion, err = harness.StartTurn(context.Background(), testTurnRequest(t), followup)
	if err != nil {
		t.Fatalf("start follow-up turn after burst: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if followup.text != "burst complete" {
		t.Fatalf("follow-up text = %q, want session restart usable", followup.text)
	}
}

func findLastRunItemByProvider(items []RunItem, providerItemID string) (RunItem, bool) {
	for index := len(items) - 1; index >= 0; index-- {
		if items[index].ProviderItemID == providerItemID {
			return items[index], true
		}
	}
	return RunItem{}, false
}

func requireLastRunItemByProvider(t *testing.T, items []RunItem, providerItemID string) RunItem {
	t.Helper()
	item, ok := findLastRunItemByProvider(items, providerItemID)
	if !ok {
		t.Fatalf("items = %+v, want provider item %s", items, providerItemID)
	}
	return item
}

func requireSkippedOutputMarker(t *testing.T, outputs []recordedOutput, providerItemID string) {
	t.Helper()
	for _, output := range outputs {
		if output.itemID == providerItemID && strings.Contains(output.text, "output skipped") {
			return
		}
	}
	t.Fatalf("outputs = %+v, want skipped-output marker for %s", outputs, providerItemID)
}

type slowRecordingSink struct {
	*recordingSink
	outputDelay time.Duration
}

func newSlowRecordingSink(outputDelay time.Duration) *slowRecordingSink {
	return &slowRecordingSink{
		recordingSink: newRecordingSink(),
		outputDelay:   outputDelay,
	}
}

func (sink *slowRecordingSink) RunItemOutputDelta(itemID string, stream string, text string) error {
	time.Sleep(sink.outputDelay)
	return sink.recordingSink.RunItemOutputDelta(itemID, stream, text)
}
