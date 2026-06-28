package chat

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/codexapp"
)

// Phase 0 goal-operation fixtures are intentionally limited to finality-affecting
// edge shapes the direct app-server tests cannot force repeatably: alternate
// notification ordering, idle gaps, pre-sink timing/overflow, cancellation races,
// and route ownership conflicts. The raw set-preserves-old fixture is anchored by
// TestCodexAppServerGoalSetUpdatesExistingGoalWithoutClear.

const (
	phase0BlockingFreezeTimeout = 2 * time.Second
	phase0ShortEventTimeout     = 200 * time.Millisecond
)

func TestCodexHarnessGoalSetClearsBeforeSetAndWaitsForRuntimeTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-preserves-old"))
	request := testCommandRequest(t, "/goal new objective")

	result, continuation, err := harness.BeginGoalContinuation(context.Background(), request)
	if continuation != nil {
		defer continuation.Close()
	}
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	if result.Goal == nil || result.Goal.Objective != "new objective" {
		t.Fatalf("goal result = %+v, want replacement provider goal", result.Goal)
	}

	noTurnHarness := NewCodexHarness(testCodexConfig("goal-operation-no-runtime-turn"))
	ctx, cancel := context.WithTimeout(context.Background(), phase0ShortEventTimeout)
	defer cancel()
	_, continuation, err = noTurnHarness.BeginGoalContinuation(ctx, request)
	if continuation != nil {
		defer continuation.Close()
	}
	if err == nil {
		t.Fatal("begin goal operation without runtime turn/started succeeded")
	}
	if !strings.Contains(err.Error(), "timed out waiting for codex goal operation runtime turn/started") {
		t.Fatalf("begin goal operation error = %v, want runtime turn/started timeout", err)
	}
	if noTurnHarness.hasGoalOperation("thread_fake") {
		t.Fatal("goal operation route owner leaked after first-turn startup timeout")
	}
}

func TestCodexHarnessGoalResumeActivatesExistingGoalAndWaitsForRuntimeTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-resume"))
	result, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, "/goal resume"))
	if continuation != nil {
		defer continuation.Close()
	}
	if err != nil {
		t.Fatalf("begin goal resume operation: %v", err)
	}
	if result.Goal == nil || result.Goal.Objective != "existing provider goal" || result.Goal.Status != "active" {
		t.Fatalf("goal result = %+v, want resumed active existing provider goal", result.Goal)
	}
	if !harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("goal resume operation did not reserve route owner")
	}
}

func TestCodexHarnessGoalOperationCoalescesRuntimeContinuations(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 3", "logical coalescing across physical goal turns")
	harness := NewCodexHarness(testCodexConfig("goal-operation-multi-turn"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. " {
		t.Fatalf("assistant text = %q, want current first-physical-turn-only output", sink.text)
	}
	if sink.turnID != "turn_goal_a" {
		t.Fatalf("turn id = %q, want current first physical turn id", sink.turnID)
	}
}

func TestCodexHarnessGoalOperationFinishExactlyOnce(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-duplicate-finish"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()
	if !harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("goal operation route owner was not registered")
	}

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. " {
		t.Fatalf("assistant text = %q, want current first physical turn before premature finish", sink.text)
	}
	if sink.linkCount != 1 {
		t.Fatalf("thread links = %d, want current single first-turn link", sink.linkCount)
	}
	terminalUpdates := 0
	for _, goal := range sink.goals {
		if goal == nil || goal.Status != "active" {
			terminalUpdates++
		}
	}
	if terminalUpdates != 0 {
		t.Fatalf("terminal goal updates = %d in %+v, want current premature finish before terminal goal update", terminalUpdates, sink.goals)
	}
	if harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("goal operation route owner leaked after finish")
	}
	continuation.Close()
	if harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("goal operation route owner was unregistered more than once incorrectly")
	}
}

func TestCodexHarnessGoalOperationDoesNotFinishOnIntermediateCompletion(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 3", "keep logical goal run active across idle gaps")
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. " {
		t.Fatalf("assistant text = %q, want current first physical turn before idle-gap finish", sink.text)
	}
}

func TestCodexHarnessGoalOperationHandlesTerminalStatusBeforeCompletion(t *testing.T) {
	assertPhase0GoalOperationOrderVariant(t, "goal-operation-terminal-before-completion")
}

func TestCodexHarnessGoalOperationHandlesTerminalStatusAfterCompletion(t *testing.T) {
	assertPhase0GoalOperationOrderVariant(t, "goal-operation-terminal-after-completion")
}

func TestCodexHarnessGoalOperationHandlesNonTerminalActiveUpdateBeforeCompletion(t *testing.T) {
	assertPhase0GoalOperationOrderVariant(t, "goal-operation-active-before-completion")
}

func TestCodexHarnessGoalOperationHandlesNonTerminalActiveUpdateAfterCompletion(t *testing.T) {
	assertPhase0GoalOperationOrderVariant(t, "goal-operation-active-after-completion")
}

func TestCodexHarnessGoalSetDoesNotPreserveOldProviderGoal(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-preserves-old"))
	result, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, "/goal new objective"))
	if continuation != nil {
		defer continuation.Close()
	}
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	if result.Goal == nil || result.Goal.Objective != "new objective" {
		t.Fatalf("goal result = %+v, want replacement provider goal", result.Goal)
	}
}

func TestCodexHarnessGoalStartupClearNotificationIsDropped(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-preserves-old"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal new objective")
	defer continuation.Close()

	sink := newRecordingSink()
	if _, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink); err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	for _, goal := range sink.goals {
		if goal == nil {
			t.Fatalf("startup thread/goal/cleared reached operation sink: %+v", sink.goals)
		}
	}
}

func TestCodexHarnessGoalStartupLifecycleFailureFinishesImmediately(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-exit-before-runtime-turn"))
	ctx, cancel := context.WithTimeout(context.Background(), phase0BlockingFreezeTimeout)
	defer cancel()

	started := time.Now()
	_, continuation, err := harness.BeginGoalContinuation(ctx, testCommandRequest(t, "/goal finish renderer tests"))
	if continuation != nil {
		defer continuation.Close()
	}
	if err == nil {
		t.Fatal("begin goal operation with pre-sink provider exit succeeded")
	}
	if strings.Contains(err.Error(), "timed out waiting for codex goal operation runtime turn/started") {
		t.Fatalf("begin goal operation error = %v, want provider lifecycle failure before first-turn timeout", err)
	}
	if !strings.Contains(err.Error(), "codex app-server exited before goal operation sink attached") {
		t.Fatalf("begin goal operation error = %v, want provider lifecycle failure", err)
	}
	if elapsed := time.Since(started); elapsed >= time.Second {
		t.Fatalf("begin goal operation returned after %s, want immediate provider exit failure", elapsed)
	}
	if harness.hasGoalOperation("thread_fake") {
		t.Fatal("goal operation route owner leaked after pre-sink provider exit")
	}
}

func TestCodexHarnessGoalStartupSetResponseFailureFinishesOperation(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-invalid-response"))
	_, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, "/goal finish renderer tests"))
	if continuation != nil {
		defer continuation.Close()
	}
	if err == nil {
		t.Fatal("begin goal operation with invalid set response succeeded")
	}
	if !strings.Contains(err.Error(), "ThreadGoalSetResponse.goal.createdAt is required") {
		t.Fatalf("begin goal operation error = %v, want invalid thread/goal/set response", err)
	}
	if harness.hasGoalOperation("thread_fake") {
		t.Fatal("goal operation route owner leaked after invalid set response")
	}
}

func TestCodexHarnessGoalOperationRequiresPersistedIdleThread(t *testing.T) {
	cases := map[string]string{
		"goal-operation-busy-thread":         "requires idle thread",
		"goal-operation-ephemeral-thread":    "requires a persisted non-ephemeral thread",
		"goal-operation-missing-path-thread": "requires a persisted thread path",
	}
	for mode, want := range cases {
		t.Run(mode, func(t *testing.T) {
			harness := NewCodexHarness(testCodexConfig(mode))
			_, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, "/goal finish renderer tests"))
			if continuation != nil {
				continuation.Close()
			}
			if err == nil {
				t.Fatal("begin goal operation with invalid provider thread state succeeded")
			}
			if !strings.Contains(err.Error(), want) {
				t.Fatalf("begin goal operation error = %v, want %q", err, want)
			}
			if harness.hasGoalOperation("thread_fake") {
				t.Fatal("goal operation route owner leaked after invalid provider thread state")
			}
		})
	}
}

func TestCodexHarnessGoalOperationCancelPausesAndInterrupts(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 4", "operation-aware pause-before-interrupt cancellation")
	harness := NewCodexHarness(testCodexConfig("goal-operation-cancel"))
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
	waitForPhase0ActiveCodexTurn(t, harness, runs[0].ID)

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err == nil {
		cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)
		t.Fatal("cancel goal operation succeeded, want current interrupt-before-pause provider error")
	} else if !strings.Contains(err.Error(), "goal pause is required before interrupt") {
		cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)
		t.Fatalf("cancel goal operation error = %v, want current pause-before-interrupt provider error", err)
	}
	cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)
}

func waitForPhase0ActiveCodexTurn(t *testing.T, harness *CodexHarness, runID string) {
	t.Helper()

	deadline := time.Now().Add(phase0BlockingFreezeTimeout)
	for time.Now().Before(deadline) {
		harness.mu.Lock()
		active := harness.active[runID]
		ready := active != nil && active.threadID != "" && active.turnID != ""
		harness.mu.Unlock()
		if ready {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for active codex turn %s before cancellation", runID)
}

func TestServiceGoalOperationRunRemainsActiveAcrossIdleGap(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 3", "service run remains active across provider idle gap")
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	defer cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)

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
	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	if run.Status != RunStatusCompleted {
		t.Fatalf("run status after first physical turn = %s, want current completed run", run.Status)
	}
}

func TestServiceGoalOperationTerminalProviderStateCompletesRun(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 3", "terminal provider state completes logical run after all physical turns")
	harness := NewCodexHarness(testCodexConfig("goal-operation-multi-turn"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	defer cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)

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
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if got := phase0AssistantText(page); got != "goal turn A. " {
		t.Fatalf("assistant text = %q, want current first-physical-turn-only persisted output", got)
	}
	if page.Goal == nil || page.Goal.Status != "active" {
		t.Fatalf("page goal = %+v, want current active goal after premature run completion", page.Goal)
	}
}

func TestServiceGoalOperationProviderClearCompletesAfterCurrentPhysicalTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-clear-during-turn"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	defer cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)

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
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if got := phase0AssistantText(page); got != "goal turn A. " {
		t.Fatalf("assistant text = %q, want current physical turn persisted before provider clear completes run", got)
	}
	if page.Goal != nil {
		t.Fatalf("page goal = %+v, want provider clear persisted", page.Goal)
	}
}

func TestCodexHarnessGoalOperationRejectsConcurrentThreadTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	request := testCommandRequest(t, "/goal second objective")
	request.ThreadRef = result.ThreadRef
	_, second, err := harness.BeginGoalContinuation(context.Background(), request)
	if second != nil {
		second.Close()
	}
	if err == nil {
		t.Fatal("second goal operation for the same thread succeeded")
	}
	if !strings.Contains(err.Error(), "codex goal operation already owns thread thread_fake") {
		t.Fatalf("second goal operation error = %v, want route owner conflict", err)
	}
	if !harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("original goal operation route owner was lost after rejected second operation")
	}
}

func TestCodexHarnessGoalOperationRejectsLinkedGoalBeforeProviderSession(t *testing.T) {
	harness := NewCodexHarness(CodexHarnessConfig{Command: "/definitely/missing/codex-app-server"})
	operation, err := harness.reserveGoalOperationThread("thread_fake")
	if err != nil {
		t.Fatalf("reserve goal operation: %v", err)
	}
	defer operation.Close()

	request := testCommandRequest(t, "/goal second objective")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}
	_, continuation, err := harness.BeginGoalContinuation(context.Background(), request)
	if continuation != nil {
		continuation.Close()
	}
	if err == nil {
		t.Fatal("second linked goal operation succeeded")
	}
	if !strings.Contains(err.Error(), "codex goal operation already owns thread thread_fake") {
		t.Fatalf("second linked goal operation error = %v, want route owner conflict before provider session", err)
	}
}

func TestCodexHarnessGoalOperationRejectsLinkedStartTurnBeforeProviderSession(t *testing.T) {
	harness := NewCodexHarness(CodexHarnessConfig{Command: "/definitely/missing/codex-app-server"})
	operation, err := harness.reserveGoalOperationThread("thread_fake")
	if err != nil {
		t.Fatalf("reserve goal operation: %v", err)
	}
	defer operation.Close()

	request := testTurnRequest(t)
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}
	_, err = harness.StartTurn(context.Background(), request, newRecordingSink())
	if err == nil {
		t.Fatal("linked normal turn on a goal-owned thread succeeded")
	}
	if !strings.Contains(err.Error(), "codex goal operation already owns thread thread_fake") {
		t.Fatalf("linked normal turn error = %v, want route owner conflict before provider session", err)
	}
}

func TestCodexHarnessGoalOperationDoesNotHoldGlobalTurnMuAcrossIdleGap(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	_, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	if !harness.turnMu.TryLock() {
		t.Fatal("goal operation held the harness-global turnMu")
	}
	harness.turnMu.Unlock()
}

func TestCodexHarnessGoalOperationAllowsDifferentThreadTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	request := testTurnRequest(t)
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_other", Status: HarnessRefLinked}
	sink := newRecordingSink()
	completion, err := harness.StartTurn(context.Background(), request, sink)
	if err != nil {
		t.Fatalf("start unrelated normal turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.threadID != "thread_other" || sink.text != "hello from codex" {
		t.Fatalf("unrelated turn sink thread/text = %q/%q, want thread_other streamed response", sink.threadID, sink.text)
	}
	if !harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("goal operation route owner was lost while unrelated thread ran")
	}
}

func TestCodexHarnessGoalOperationBuffersPreSinkEventsInOrder(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-pre-sink-buffer"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "pre-sink live " {
		t.Fatalf("assistant text = %q, want buffered events replayed before live events", sink.text)
	}
}

func TestCodexHarnessGoalOperationFailsOnPreSinkBufferOverflow(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-pre-sink-overflow"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	_, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), newRecordingSink())
	if err == nil {
		t.Fatal("goal operation succeeded after pre-sink buffer overflow")
	}
	if !strings.Contains(err.Error(), "codex goal operation pre-sink buffer overflow") {
		t.Fatalf("goal operation error = %v, want specific pre-sink buffer overflow", err)
	}
	if harness.hasGoalOperation(result.ThreadRef.ThreadID) {
		t.Fatal("goal operation route owner leaked after pre-sink overflow")
	}
}

func TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringIdleGap(t *testing.T) {
	assertPhase1BackgroundTerminalGoalOperationRoutes(t, "goal-operation-background-idle-gap")
}

func TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringPhysicalTurnB(t *testing.T) {
	assertPhase1BackgroundTerminalGoalOperationRoutes(t, "goal-operation-background-physical-turn-b")
}

func TestCodexHarnessGoalOperationDelegatesBackgroundTerminalBeforeLogicalRewrite(t *testing.T) {
	assertPhase1BackgroundTerminalGoalOperationRoutes(t, "goal-operation-background-delegate-before-rewrite")
}

func TestServiceGoalOperationReplaysPreSinkBackgroundTerminalBeforeOutput(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-background-idle-gap"))
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
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)

	process := waitForBackgroundTerminalProcess(t, service, "workspace_api", conversation.ID, fakeUnifiedExecAlphaItemID, BackgroundTerminalExited)
	if process.Status != BackgroundTerminalExited || process.ProcessID != fakeUnifiedExecAlphaProcess {
		t.Fatalf("background terminal process = %+v, want exited goal-owned process", process)
	}
	outputPage, err := service.store.LoadBackgroundTerminalOutputPage("workspace_api", conversation.ID, process.ID, 0, 10)
	if err != nil {
		t.Fatalf("load background terminal output: %v", err)
	}
	if len(outputPage.Output) != 1 || outputPage.Output[0].Text != "goal terminal output\n" {
		t.Fatalf("background terminal output page = %+v, want pre-sink output persisted after startup replay", outputPage)
	}
}

func TestCodexHarnessBackgroundTerminalClassificationSharedByGoalAndStandaloneRouters(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	harness.beginBackgroundTerminalTurn("thread_fake", "workspace_api", "conversation_api")
	harness.endBackgroundTerminalTurn("thread_fake")

	harness.handleConnectionOutputDelta(codexapp.Message{
		Method: codexapp.CodexNotificationItemCommandExecutionOutputDelta,
		Params: phase0JSON(t, map[string]any{
			"delta":    "unclassified output\n",
			"itemId":   "item_not_registered_as_background",
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		}),
	})
	select {
	case output := <-background.outputs:
		t.Fatalf("unclassified output was routed by standalone background handler: %+v", output)
	case <-time.After(phase0ShortEventTimeout):
	}

	harness.recordBackgroundItemID(fakeUnifiedExecAlphaItemID)
	harness.handleConnectionOutputDelta(codexapp.Message{
		Method: codexapp.CodexNotificationItemCommandExecutionOutputDelta,
		Params: phase0JSON(t, map[string]any{
			"delta":    "classified output\n",
			"itemId":   fakeUnifiedExecAlphaItemID,
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		}),
	})
	select {
	case output := <-background.outputs:
		if output.providerItemID != fakeUnifiedExecAlphaItemID || output.text != "classified output\n" {
			t.Fatalf("classified background output = %+v, want registered unified-exec output", output)
		}
	case <-time.After(phase0ShortEventTimeout):
		t.Fatal("timed out waiting for classified background output")
	}
}

func TestCodexHarnessGoalOperationKeepsLateBackgroundRoutingBeforeThreadOwned(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	harness.setBackgroundTerminalThreadContext("thread_fake", "workspace_api", "conversation_api")
	harness.recordBackgroundItemID(fakeUnifiedExecAlphaItemID)

	operation, err := harness.reserveGoalOperationThread("thread_fake")
	if err != nil {
		t.Fatalf("reserve goal operation: %v", err)
	}
	defer operation.Close()

	harness.handleConnectionOutputDelta(codexapp.Message{
		Method: codexapp.CodexNotificationItemCommandExecutionOutputDelta,
		Params: phase0JSON(t, map[string]any{
			"delta":    "reserved output\n",
			"itemId":   fakeUnifiedExecAlphaItemID,
			"threadId": "thread_fake",
			"turnId":   "turn_previous",
		}),
	})
	reserved := background.waitForOutput(t)
	if reserved.text != "reserved output\n" {
		t.Fatalf("reserved operation output = %+v, want late route before session attach", reserved)
	}

	session, err := harness.manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	if err := operation.attachSession(session); err != nil {
		t.Fatalf("attach session: %v", err)
	}
	harness.handleConnectionOutputDelta(codexapp.Message{
		Method: codexapp.CodexNotificationItemCommandExecutionOutputDelta,
		Params: phase0JSON(t, map[string]any{
			"delta":    "attached output\n",
			"itemId":   fakeUnifiedExecAlphaItemID,
			"threadId": "thread_fake",
			"turnId":   "turn_previous",
		}),
	})
	attached := background.waitForOutput(t)
	if attached.text != "attached output\n" {
		t.Fatalf("attached-but-unowned operation output = %+v, want late route before OwnThread", attached)
	}
}

func TestCodexHarnessGoalOperationDefersConnectionScopedBackgroundTerminalRouting(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	harness.setBackgroundTerminalThreadContext("thread_fake", "workspace_api", "conversation_api")
	harness.recordBackgroundItemID(fakeUnifiedExecAlphaItemID)

	session, err := harness.manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	operation, err := harness.reserveGoalOperation(session, "thread_fake")
	if err != nil {
		t.Fatalf("reserve goal operation: %v", err)
	}
	defer operation.Close()
	if err := operation.ownThread(session, "thread_fake"); err != nil {
		t.Fatalf("own thread: %v", err)
	}

	harness.handleConnectionOutputDelta(codexapp.Message{
		Method: codexapp.CodexNotificationItemCommandExecutionOutputDelta,
		Params: phase0JSON(t, map[string]any{
			"delta":    "goal-owned output\n",
			"itemId":   fakeUnifiedExecAlphaItemID,
			"threadId": "thread_fake",
			"turnId":   "turn_goal_a",
		}),
	})
	select {
	case output := <-background.outputs:
		t.Fatalf("goal-owned background output used standalone connection route: %+v", output)
	case <-time.After(phase0ShortEventTimeout):
	}
}

func cancelPhase0ActiveRunForCleanup(t *testing.T, service *Service, workspaceID string, conversationID string) {
	t.Helper()

	key := activeKey(workspaceID, conversationID)
	service.mu.Lock()
	active, ok := service.active[key]
	service.mu.Unlock()
	if !ok {
		return
	}
	active.cancel()
	if _, err := service.markTurnCancelledWithOptions(workspaceID, conversationID, active.runID, "phase 0 cancellation cleanup", "phase0_cancel_cleanup", "Phase 0 cancellation cleanup", false); err != nil {
		t.Logf("phase 0 cleanup could not mark run cancelled: %v", err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		service.mu.Lock()
		_, activeStillPresent := service.active[key]
		service.mu.Unlock()
		if !activeStillPresent {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Log("phase 0 cleanup left an active run attached after cancellation")
}

func assertPhase0GoalOperationOrderVariant(t *testing.T, mode string) {
	t.Helper()
	phase0FreezeCurrentGap(t, "Phase 3", "provider finality ordering across physical goal turns")
	harness := NewCodexHarness(testCodexConfig(mode))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. " {
		t.Fatalf("%s assistant text = %q, want current first-physical-turn-only output", mode, sink.text)
	}
}

func assertPhase1BackgroundTerminalGoalOperationRoutes(t *testing.T, mode string) {
	t.Helper()
	harness := NewCodexHarness(testCodexConfig(mode))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. " {
		t.Fatalf("%s assistant text = %q, want current first-physical-turn-only output before background-terminal composition is observable", mode, sink.text)
	}
	output := background.waitForOutput(t)
	if output.providerItemID != fakeUnifiedExecAlphaItemID || output.text != "goal terminal output\n" {
		t.Fatalf("%s background output = %+v, want goal-owned unified-exec output", mode, output)
	}
	completionEvent := background.waitForCompletion(t)
	if completionEvent.providerItemID != fakeUnifiedExecAlphaItemID || completionEvent.providerProcessID != fakeUnifiedExecAlphaProcess {
		t.Fatalf("%s background completion = %+v, want goal-owned unified-exec completion", mode, completionEvent)
	}
	select {
	case duplicate := <-background.outputs:
		t.Fatalf("%s background output routed more than once: %+v", mode, duplicate)
	case <-time.After(phase0ShortEventTimeout):
	}
}

func waitForBackgroundTerminalProcess(t *testing.T, service *Service, workspaceID string, conversationID string, providerItemID string, status BackgroundTerminalStatus) BackgroundTerminalProcess {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
		if err != nil {
			t.Fatalf("list background terminals: %v", err)
		}
		for _, process := range processes {
			if process.ProviderItemID == providerItemID && process.Status == status {
				return process
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for background terminal process %s status %s", providerItemID, status)
	return BackgroundTerminalProcess{}
}

func beginPhase0GoalOperation(t *testing.T, harness *CodexHarness, raw string) (HarnessCommandResult, HarnessGoalContinuation) {
	t.Helper()
	result, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, raw))
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	if continuation == nil {
		t.Fatal("begin goal operation returned nil continuation")
	}
	return result, continuation
}

func phase0GoalTurnRequest(t *testing.T, result HarnessCommandResult) TurnRequest {
	t.Helper()
	request := testTurnRequest(t)
	request.Prompt = "finish renderer tests"
	request.ThreadRef = result.ThreadRef
	return request
}

func phase0AssistantText(page MessagePage) string {
	var builder strings.Builder
	for _, message := range page.Messages {
		if message.Role != RoleAssistant {
			continue
		}
		for _, part := range message.Parts {
			builder.WriteString(part.Text)
		}
	}
	return builder.String()
}

func phase0JSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal phase 0 json: %v", err)
	}
	return json.RawMessage(data)
}

func phase0FreezeCurrentGap(t *testing.T, flipPhase string, behavior string) {
	t.Helper()
	t.Logf("Phase 0 freezes current behavior; %s flips this assertion: %s", flipPhase, behavior)
}
