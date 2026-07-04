package chat

import (
	"strings"
	"testing"
	"time"
)

func TestServiceCancelFakeGoalOperationUnblocksWait(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests"); err != nil {
		t.Fatalf("execute goal command: %v", err)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one goal run", runs)
	}
	waitForFakeHarnessRunRegistered(t, harness, runs[0].ID)

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel fake goal operation: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForFakeHarnessRunUnregistered(t, harness, runs[0].ID)
}

func TestServiceCancelActiveRunByIDRejectsDifferentActiveRunBeforeProviderCancel(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "partial"},
		{Type: FakeEventWaitForCancel},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("stop exact run"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusRunning)

	_, err = service.CancelActiveRunByID("workspace_api", conversation.ID, "run_other")
	if err == nil || !strings.Contains(err.Error(), "does not match requested run run_other") {
		t.Fatalf("cancel wrong run error = %v, want exact-run mismatch", err)
	}
	if cancelled := harness.CancelledRequests(); len(cancelled) != 0 {
		t.Fatalf("provider cancel requests = %+v, want none for wrong run id", cancelled)
	}
	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusRunning)
	if run.ID != result.Run.ID {
		t.Fatalf("active run = %+v, want original run %s", run, result.Run.ID)
	}

	cancelled, err := service.CancelActiveRunByID("workspace_api", conversation.ID, result.Run.ID)
	if err != nil {
		t.Fatalf("cancel exact run: %v", err)
	}
	if cancelled.ID != result.Run.ID || cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want %s cancelled", cancelled, result.Run.ID)
	}
}

func TestServiceCancelCodexGoalOperationFallbackReleasesRoute(t *testing.T) {
	previousTimeout := codexGoalCancelDrainTimeout
	codexGoalCancelDrainTimeout = 25 * time.Millisecond
	t.Cleanup(func() { codexGoalCancelDrainTimeout = previousTimeout })

	harness := NewCodexHarness(testCodexConfig("goal-operation-cancel-no-completion"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests"); err != nil {
		t.Fatalf("execute goal command: %v", err)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one goal run", runs)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_cancel")

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel codex goal operation without provider completion: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForGoalOperationReleased(t, harness, "thread_fake")
}

func TestServiceCancelCodexGoalOperationBlocksFollowUpDuringDrain(t *testing.T) {
	previousTimeout := codexGoalCancelDrainTimeout
	codexGoalCancelDrainTimeout = 2 * time.Second
	t.Cleanup(func() { codexGoalCancelDrainTimeout = previousTimeout })

	harness := NewCodexHarness(testCodexConfig("goal-operation-cancel-no-completion"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests"); err != nil {
		t.Fatalf("execute goal command: %v", err)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one goal run", runs)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_cancel")

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel codex goal operation without provider completion: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForServiceCancellationDrain(t, service, "workspace_api", conversation.ID, runs[0].ID)
	if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("after cancel")); err == nil {
		t.Fatal("send during codex cancellation drain succeeded, want active-turn rejection")
	}
	afterSendRuns, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs after rejected send: %v", err)
	}
	if len(afterSendRuns) != 1 || afterSendRuns[0].Status != RunStatusCancelled {
		t.Fatalf("runs after rejected send = %+v, want only cancelled goal run", afterSendRuns)
	}
	queued, err := service.QueueUserInput("workspace_api", conversation.ID, TextChatInput("queued after cancel"))
	if err != nil {
		t.Fatalf("queue during codex cancellation drain: %v", err)
	}
	queuedRun, err := service.store.LoadRun("workspace_api", queued.Run.ID)
	if err != nil {
		t.Fatalf("load queued run: %v", err)
	}
	if queuedRun.Status != RunStatusQueued {
		t.Fatalf("queued run status = %s, want queued while route drains", queuedRun.Status)
	}

	forceServiceActiveCancel(t, service, "workspace_api", conversation.ID, runs[0].ID)
	waitForGoalOperationReleased(t, harness, "thread_fake")
	waitForServiceCancellationDrainReleased(t, service, "workspace_api", conversation.ID, runs[0].ID)
	queuedRun, err = service.store.LoadRun("workspace_api", queued.Run.ID)
	if err != nil {
		t.Fatalf("load queued run after drain release: %v", err)
	}
	if queuedRun.Status != RunStatusQueued {
		t.Fatalf("queued run status after drain release = %s, want queued", queuedRun.Status)
	}
}

func TestServiceCancelCodexGoalOperationBlocksCommandsDuringDrain(t *testing.T) {
	previousTimeout := codexGoalCancelDrainTimeout
	codexGoalCancelDrainTimeout = 2 * time.Second
	t.Cleanup(func() { codexGoalCancelDrainTimeout = previousTimeout })

	harness := NewCodexHarness(testCodexConfig("goal-operation-cancel-no-completion"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, runID := startCancelledCodexGoalDrain(t, service, harness)

	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal clear"); err == nil {
		t.Fatal("goal clear during codex cancellation drain succeeded, want active-turn rejection")
	}
	if _, err := service.SetChatCodexModel("workspace_api", conversation.ID, "gpt-test"); err == nil {
		t.Fatal("model set during codex cancellation drain succeeded, want active-turn rejection")
	}
	waitForServiceCancellationDrain(t, service, "workspace_api", conversation.ID, runID)

	forceServiceActiveCancel(t, service, "workspace_api", conversation.ID, runID)
	waitForGoalOperationReleased(t, harness, "thread_fake")
	waitForServiceCancellationDrainReleased(t, service, "workspace_api", conversation.ID, runID)
}

func TestServiceCancelCodexGoalOperationRepeatCancelPreservesDrain(t *testing.T) {
	previousTimeout := codexGoalCancelDrainTimeout
	codexGoalCancelDrainTimeout = 2 * time.Second
	t.Cleanup(func() { codexGoalCancelDrainTimeout = previousTimeout })

	harness := NewCodexHarness(testCodexConfig("goal-operation-cancel-no-completion"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, runID := startCancelledCodexGoalDrain(t, service, harness)

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("repeat cancel during codex cancellation drain: %v", err)
	}
	if cancelled.Status != RunStatusCancelled || cancelled.ID != runID {
		t.Fatalf("repeat cancel run = %+v, want same cancelled run %s", cancelled, runID)
	}
	waitForServiceCancellationDrain(t, service, "workspace_api", conversation.ID, runID)
	if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("after repeat cancel")); err == nil {
		t.Fatal("send after repeat cancel during drain succeeded, want active-turn rejection")
	}

	forceServiceActiveCancel(t, service, "workspace_api", conversation.ID, runID)
	waitForGoalOperationReleased(t, harness, "thread_fake")
	waitForServiceCancellationDrainReleased(t, service, "workspace_api", conversation.ID, runID)
}

func startCancelledCodexGoalDrain(t *testing.T, service *Service, harness *CodexHarness) (Conversation, string) {
	t.Helper()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests"); err != nil {
		t.Fatalf("execute goal command: %v", err)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one goal run", runs)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_cancel")

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel codex goal operation without provider completion: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForServiceCancellationDrain(t, service, "workspace_api", conversation.ID, runs[0].ID)
	return conversation, runs[0].ID
}

func waitForFakeHarnessRunRegistered(t *testing.T, harness *FakeHarness, runID string) {
	t.Helper()
	waitForFakeHarnessRunRegistration(t, harness, runID, true)
}

func waitForFakeHarnessRunUnregistered(t *testing.T, harness *FakeHarness, runID string) {
	t.Helper()
	waitForFakeHarnessRunRegistration(t, harness, runID, false)
}

func waitForFakeHarnessRunRegistration(t *testing.T, harness *FakeHarness, runID string, registered bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		harness.mu.Lock()
		_, approvalRegistered := harness.approvalChs[runID]
		_, steerRegistered := harness.steerChs[runID]
		harness.mu.Unlock()
		if approvalRegistered == registered && steerRegistered == registered {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	harness.mu.Lock()
	_, approvalRegistered := harness.approvalChs[runID]
	_, steerRegistered := harness.steerChs[runID]
	harness.mu.Unlock()
	t.Fatalf("fake harness run %s registration = approvals:%v steering:%v, want both %v", runID, approvalRegistered, steerRegistered, registered)
}

func waitForServiceCancellationDrain(t *testing.T, service *Service, workspaceID string, conversationID string, runID string) {
	t.Helper()
	waitForServiceCancellationDrainState(t, service, workspaceID, conversationID, runID, true)
}

func waitForServiceCancellationDrainReleased(t *testing.T, service *Service, workspaceID string, conversationID string, runID string) {
	t.Helper()
	waitForServiceCancellationDrainState(t, service, workspaceID, conversationID, runID, false)
}

func waitForServiceCancellationDrainState(t *testing.T, service *Service, workspaceID string, conversationID string, runID string, activeDrain bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		service.mu.Lock()
		active, ok := service.active[activeKey(workspaceID, conversationID)]
		matches := ok && active.runID == runID && active.cancelDrain
		service.mu.Unlock()
		if matches == activeDrain {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("service cancellation drain for run %s active = %v, want %v", runID, !activeDrain, activeDrain)
}

func forceServiceActiveCancel(t *testing.T, service *Service, workspaceID string, conversationID string, runID string) {
	t.Helper()
	service.mu.Lock()
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	service.mu.Unlock()
	if !ok || active.runID != runID {
		t.Fatalf("active cancellation drain for run %s was not present", runID)
	}
	active.cancel()
}
