package chat

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestServiceRunsIndependentCodexConversationsConcurrently(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("parallel-turns"))
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := harness.manager.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown manager: %v", err)
		}
	}()
	service := newTestService(t, t.TempDir(), testResolver(t), harness)

	firstConversation := mustCreateParallelConversation(t, service, "first")
	first, err := service.SendUserInput("workspace_api", firstConversation.ID, TextChatInput("stall first service turn"))
	if err != nil {
		t.Fatalf("send first message: %v", err)
	}
	firstActive := waitForServiceActiveCodexTurn(t, harness, first.Run.ID)

	secondConversation := mustCreateParallelConversation(t, service, "second")
	second, err := service.SendUserInput("workspace_api", secondConversation.ID, TextChatInput("wait-steer second service turn"))
	if err != nil {
		t.Fatalf("send second message: %v", err)
	}
	secondActive := waitForServiceActiveCodexTurn(t, harness, second.Run.ID)
	if secondActive.threadID == firstActive.threadID {
		t.Fatalf("second thread = %s, want distinct from first", secondActive.threadID)
	}

	thirdConversation := mustCreateParallelConversation(t, service, "third")
	third, err := service.SendUserInput("workspace_api", thirdConversation.ID, TextChatInput("finish third service turn"))
	if err != nil {
		t.Fatalf("send third message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", thirdConversation.ID, third.Run.ID, RunStatusCompleted)
	thirdThread := latestConversationThread(t, service, thirdConversation.ID)
	if thirdThread == "" || thirdThread == firstActive.threadID || thirdThread == secondActive.threadID {
		t.Fatalf("third thread = %q, want distinct from %q and %q", thirdThread, firstActive.threadID, secondActive.threadID)
	}
	waitForAssistantText(t, service, "workspace_api", thirdConversation.ID, "done "+thirdThread)

	steered := steerWhenReady(t, service, "workspace_api", secondConversation.ID, "adjust course")
	if steered.Run.ID != second.Run.ID {
		t.Fatalf("steered run = %s, want %s", steered.Run.ID, second.Run.ID)
	}
	waitForRunStatus(t, service, "workspace_api", secondConversation.ID, second.Run.ID, RunStatusCompleted)
	waitForAssistantText(
		t,
		service,
		"workspace_api",
		secondConversation.ID,
		fmt.Sprintf("waiting %s steered %s", secondActive.threadID, secondActive.threadID),
	)

	cancelled, err := service.CancelActiveRun("workspace_api", firstConversation.ID)
	if err != nil {
		t.Fatalf("cancel first run: %v", err)
	}
	if cancelled.ID != first.Run.ID || cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want cancelled first run %s", cancelled, first.Run.ID)
	}
	waitForAssistantText(t, service, "workspace_api", firstConversation.ID, "stalling "+firstActive.threadID+" ")
}

func mustCreateParallelConversation(t *testing.T, service *Service, title string) Conversation {
	t.Helper()
	conversation, err := service.CreateConversation("workspace_api", title)
	if err != nil {
		t.Fatalf("create %s conversation: %v", title, err)
	}
	return conversation
}

func waitForServiceActiveCodexTurn(t *testing.T, harness *CodexHarness, runID string) *codexActiveTurn {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		active := harness.activeTurnSnapshot(runID)
		if active != nil && active.threadID != "" && active.turnID != "" {
			return active
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for active codex turn %s", runID)
	return nil
}

func latestConversationThread(t *testing.T, service *Service, conversationID string) string {
	t.Helper()
	conversation, err := service.store.LoadConversation("workspace_api", conversationID)
	if err != nil {
		t.Fatalf("load conversation %s: %v", conversationID, err)
	}
	ref := latestHarnessRef(conversation, HarnessCodex)
	return ref.ThreadID
}
