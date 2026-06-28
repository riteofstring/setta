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
	phase0FreezeCurrentGap(t, "Phase 2", "clear-before-set and first runtime turn binding")
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-preserves-old"))
	request := testCommandRequest(t, "/goal new objective")

	result, continuation, err := harness.BeginGoalContinuation(context.Background(), request)
	if continuation != nil {
		defer continuation.Close()
	}
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	if result.Goal == nil || result.Goal.Objective != "existing provider goal" {
		t.Fatalf("goal result = %+v, want current provider-preserved old goal", result.Goal)
	}

	noTurnHarness := NewCodexHarness(testCodexConfig("goal-operation-no-runtime-turn"))
	ctx, cancel := context.WithTimeout(context.Background(), phase0BlockingFreezeTimeout)
	defer cancel()
	result, continuation, err = noTurnHarness.BeginGoalContinuation(ctx, request)
	if continuation != nil {
		defer continuation.Close()
	}
	if err != nil {
		t.Fatalf("begin goal operation without runtime turn/started: %v", err)
	}
	if result.Goal == nil || result.Goal.Objective != "new objective" {
		t.Fatalf("goal result = %+v, want current immediate set response before runtime turn/started", result.Goal)
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
	phase0FreezeCurrentGap(t, "Phase 1", "exactly-once logical finish chokepoint")
	harness := NewCodexHarness(testCodexConfig("goal-operation-duplicate-finish"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

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
	phase0FreezeCurrentGap(t, "Phase 2", "replace provider goal with clear-before-set")
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-preserves-old"))
	result, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, "/goal new objective"))
	if continuation != nil {
		defer continuation.Close()
	}
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	if result.Goal == nil || result.Goal.Objective != "existing provider goal" {
		t.Fatalf("goal result = %+v, want current provider-preserved old goal", result.Goal)
	}
}

func TestCodexHarnessGoalOperationRequiresPersistedIdleThread(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 2", "persisted idle thread validation before provider mutation")
	for _, mode := range []string{
		"goal-operation-busy-thread",
		"goal-operation-ephemeral-thread",
		"goal-operation-missing-path-thread",
	} {
		t.Run(mode, func(t *testing.T) {
			harness := NewCodexHarness(testCodexConfig(mode))
			result, continuation, err := harness.BeginGoalContinuation(context.Background(), testCommandRequest(t, "/goal finish renderer tests"))
			if continuation != nil {
				continuation.Close()
			}
			if err != nil {
				t.Fatalf("begin goal operation with current unvalidated thread shape: %v", err)
			}
			if !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
				t.Fatalf("result = %+v, want current linked thread despite invalid shape", result)
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
	phase0FreezeCurrentGap(t, "Phase 1", "per-thread route-owner rejection instead of global serialization")
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	_, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	if harness.turnMu.TryLock() {
		harness.turnMu.Unlock()
		t.Fatal("turnMu was available, want current goal continuation to hold the harness-global lock")
	}
}

func TestCodexHarnessGoalOperationDoesNotHoldGlobalTurnMuAcrossIdleGap(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 1", "release harness-global turnMu across logical goal idle gaps")
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	_, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	if harness.turnMu.TryLock() {
		harness.turnMu.Unlock()
		t.Fatal("turnMu was available, want current goal continuation to block unrelated turns")
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
	phase0FreezeCurrentGap(t, "Phase 1", "explicit pre-sink buffer overflow error")
	harness := NewCodexHarness(testCodexConfig("goal-operation-pre-sink-overflow"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	_, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), newRecordingSink())
	if err == nil {
		t.Fatal("goal operation succeeded after pre-sink buffer overflow")
	}
	if !strings.Contains(err.Error(), "codex app-server session is closed") {
		t.Fatalf("goal operation error = %v, want current closed-session failure", err)
	}
}

func TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringIdleGap(t *testing.T) {
	assertPhase0BackgroundTerminalGoalOperationCurrentlyEndsAfterFirstTurn(t, "goal-operation-background-idle-gap")
}

func TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringPhysicalTurnB(t *testing.T) {
	assertPhase0BackgroundTerminalGoalOperationCurrentlyEndsAfterFirstTurn(t, "goal-operation-background-physical-turn-b")
}

func TestCodexHarnessGoalOperationDelegatesBackgroundTerminalBeforeLogicalRewrite(t *testing.T) {
	assertPhase0BackgroundTerminalGoalOperationCurrentlyEndsAfterFirstTurn(t, "goal-operation-background-delegate-before-rewrite")
}

func TestCodexHarnessBackgroundTerminalClassificationSharedByGoalAndStandaloneRouters(t *testing.T) {
	phase0FreezeCurrentGap(t, "Phase 1", "shared background-terminal classification")
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
		if output.providerItemID != "item_not_registered_as_background" || output.text != "unclassified output\n" {
			t.Fatalf("background output = %+v, want current unclassified output routed by connection handler", output)
		}
	case <-time.After(phase0ShortEventTimeout):
		t.Fatal("timed out waiting for current connection router to accept unclassified output")
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

func assertPhase0BackgroundTerminalGoalOperationCurrentlyEndsAfterFirstTurn(t *testing.T, mode string) {
	t.Helper()
	phase0FreezeCurrentGap(t, "Phase 1", "goal-owned background-terminal route composition")
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
