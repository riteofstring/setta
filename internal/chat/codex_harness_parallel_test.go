package chat

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestCodexHarnessRunsIndependentTurnsConcurrently(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("parallel-turns"))
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := harness.manager.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown manager: %v", err)
		}
	}()

	first := parallelTurnRequest(t, "a", "stall first")
	firstSink := newRecordingSink()
	firstDone := startCodexTurnRequestAsync(first, harness, firstSink)
	waitForThreadLink(t, firstSink)
	expectTurnStillRunning(t, firstDone)

	second := parallelTurnRequest(t, "b", "wait-steer second")
	secondSink := newRecordingSink()
	secondDone := startCodexTurnRequestAsync(second, harness, secondSink)
	waitForThreadLink(t, secondSink)
	if secondSink.threadID == firstSink.threadID {
		t.Fatalf("second thread = %s, want independent thread from first", secondSink.threadID)
	}

	third := parallelTurnRequest(t, "c", "finish third")
	thirdSink := newRecordingSink()
	thirdDone := startCodexTurnRequestAsync(third, harness, thirdSink)
	requireAsyncTurnOutcome(t, thirdDone, TurnOutcomeCompleted)
	if thirdSink.threadID == "" || thirdSink.threadID == firstSink.threadID || thirdSink.threadID == secondSink.threadID {
		t.Fatalf("third thread = %q, want distinct from %q and %q", thirdSink.threadID, firstSink.threadID, secondSink.threadID)
	}
	if thirdSink.text != "done "+thirdSink.threadID {
		t.Fatalf("third text = %q, want only third scoped assistant output", thirdSink.text)
	}
	requireOutputForThreadOnly(t, thirdSink, thirdSink.threadID)
	requireNoOutputs(t, firstSink, "first active turn after standalone process noise")
	requireNoOutputs(t, secondSink, "second active turn after standalone process noise")

	if err := harness.SteerTurn(context.Background(), SteerRequest{
		RunID:          second.Run.ID,
		WorkspaceID:    second.Workspace.ID,
		ConversationID: second.Conversation.ID,
		ThreadID:       secondSink.threadID,
		TurnID:         secondSink.turnID,
		Input:          TextChatInput("adjust course"),
	}); err != nil {
		t.Fatalf("steer second turn: %v", err)
	}
	requireAsyncTurnOutcome(t, secondDone, TurnOutcomeCompleted)
	if secondSink.text != "waiting "+secondSink.threadID+" steered "+secondSink.threadID {
		t.Fatalf("second text = %q, want wait plus steered output for second only", secondSink.text)
	}

	if err := harness.CancelTurn(context.Background(), CancelRequest{
		RunID:          first.Run.ID,
		WorkspaceID:    first.Workspace.ID,
		ConversationID: first.Conversation.ID,
	}); err != nil {
		t.Fatalf("cancel first turn: %v", err)
	}
	requireAsyncTurnOutcome(t, firstDone, TurnOutcomeCancelled)
	if firstSink.text != "stalling "+firstSink.threadID+" " {
		t.Fatalf("first text = %q, want only first scoped stalled output", firstSink.text)
	}
}

func TestCodexHarnessRejectsConcurrentTurnsOnSameProviderThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("parallel-turns"))
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := harness.manager.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown manager: %v", err)
		}
	}()

	first := parallelTurnRequest(t, "same_a", "stall same thread")
	first.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_same", Status: HarnessRefLinked}
	firstSink := newRecordingSink()
	firstDone := startCodexTurnRequestAsync(first, harness, firstSink)
	waitForThreadLink(t, firstSink)
	expectTurnStillRunning(t, firstDone)

	second := parallelTurnRequest(t, "same_b", "finish same thread")
	second.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_same", Status: HarnessRefLinked}
	_, err := harness.StartTurn(context.Background(), second, newRecordingSink())
	if err == nil {
		t.Fatal("second same-thread turn succeeded")
	}
	if !strings.Contains(err.Error(), "codex thread thread_same already has active run "+first.Run.ID) {
		t.Fatalf("second same-thread error = %v, want active thread rejection", err)
	}

	if err := harness.CancelTurn(context.Background(), CancelRequest{
		RunID:          first.Run.ID,
		WorkspaceID:    first.Workspace.ID,
		ConversationID: first.Conversation.ID,
	}); err != nil {
		t.Fatalf("cancel first turn: %v", err)
	}
	requireAsyncTurnOutcome(t, firstDone, TurnOutcomeCancelled)
}

func startCodexTurnRequestAsync(request TurnRequest, harness *CodexHarness, sink *recordingSink) <-chan codexTurnResult {
	done := make(chan codexTurnResult, 1)
	go func() {
		completion, err := harness.StartTurn(context.Background(), request, sink)
		done <- codexTurnResult{completion: completion, err: err}
	}()
	return done
}

func parallelTurnRequest(t *testing.T, suffix string, prompt string) TurnRequest {
	t.Helper()
	request := testTurnRequest(t)
	request.Conversation.ID = "conversation_parallel_" + suffix
	request.Run.ID = "run_parallel_" + suffix
	request.Run.ConversationID = request.Conversation.ID
	request.Input = TextChatInput(prompt)
	return request
}

func expectTurnStillRunning(t *testing.T, done <-chan codexTurnResult) {
	t.Helper()
	select {
	case result := <-done:
		t.Fatalf("turn finished early: completion=%+v err=%v", result.completion, result.err)
	case <-time.After(150 * time.Millisecond):
	}
}

func requireNoOutputs(t *testing.T, sink *recordingSink, label string) {
	t.Helper()
	if len(sink.outputs) != 0 {
		t.Fatalf("%s outputs = %+v, want none", label, sink.outputs)
	}
}

func requireOutputForThreadOnly(t *testing.T, sink *recordingSink, threadID string) {
	t.Helper()
	if len(sink.outputs) != 1 {
		t.Fatalf("outputs = %+v, want one command output for %s", sink.outputs, threadID)
	}
	wantText := fmt.Sprintf("output %s\n", threadID)
	if sink.outputs[0].text != wantText || !strings.Contains(sink.outputs[0].itemID, sink.turnID) {
		t.Fatalf("outputs = %+v, want scoped output %q for turn %s", sink.outputs, wantText, sink.turnID)
	}
}
