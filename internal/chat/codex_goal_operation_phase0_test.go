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

	result, continuation, err := harness.BeginGoalOperation(context.Background(), request)
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
	_, continuation, err = noTurnHarness.BeginGoalOperation(ctx, request)
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
	result, continuation, err := harness.BeginGoalOperation(context.Background(), testCommandRequest(t, "/goal resume"))
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
	harness := NewCodexHarness(testCodexConfig("goal-operation-multi-turn"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. goal turn B. " {
		t.Fatalf("assistant text = %q, want output from both physical turns", sink.text)
	}
	if sink.turnID != "turn_goal_a" {
		t.Fatalf("turn id = %q, want first physical turn as logical turn id", sink.turnID)
	}
	if sink.linkCount != 1 {
		t.Fatalf("thread links = %d, want one logical link", sink.linkCount)
	}
	if len(sink.goals) == 0 || sink.goals[len(sink.goals)-1] == nil || sink.goals[len(sink.goals)-1].Status != "complete" {
		t.Fatalf("goals = %+v, want terminal complete goal", sink.goals)
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
	if sink.text != "goal turn A. goal turn B. " {
		t.Fatalf("assistant text = %q, want both physical turns before finish", sink.text)
	}
	if sink.linkCount != 1 {
		t.Fatalf("thread links = %d, want one logical link", sink.linkCount)
	}
	terminalUpdates := 0
	for _, goal := range sink.goals {
		if goal == nil || goal.Status != "active" {
			terminalUpdates++
		}
	}
	if terminalUpdates != 1 {
		t.Fatalf("terminal goal updates = %d in %+v, want exactly one terminal update", terminalUpdates, sink.goals)
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
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	ctx, cancel := context.WithTimeout(context.Background(), phase0ShortEventTimeout)
	defer cancel()
	_, err := continuation.Wait(ctx, phase0GoalTurnRequest(t, result), sink)
	if err == nil {
		t.Fatal("goal operation completed after intermediate physical completion")
	}
	if !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Fatalf("wait goal operation error = %v, want context deadline after idle gap", err)
	}
	if sink.text != "goal turn A. " {
		t.Fatalf("assistant text = %q, want first physical turn output before idle-gap wait", sink.text)
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

func TestCodexHarnessGoalOperationRewritesSecondTurnApprovalToLogicalTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-approval-second-turn"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindCommand || approval.ProviderItemID != "item_goal_approval" {
		t.Fatalf("approval = %+v, want second-turn command approval", approval)
	}
	if sink.turnID != "turn_goal_a" || sink.linkCount != 1 {
		t.Fatalf("logical link = %q count %d, want one turn_goal_a link", sink.turnID, sink.linkCount)
	}
}

func TestCodexHarnessGoalOperationRewritesSecondTurnRunActivityToLogicalTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-plan-second-turn"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	item := requireRunItemType(t, sink.items, RunItemTypePlan)
	if item.ProviderItemID != "plan_turn_goal_a" || item.Summary != "plan from physical turn B" {
		t.Fatalf("plan item = %+v, want logical turn id with second-turn activity", item)
	}
}

func TestCodexHarnessGoalSetDoesNotPreserveOldProviderGoal(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-preserves-old"))
	result, continuation, err := harness.BeginGoalOperation(context.Background(), testCommandRequest(t, "/goal new objective"))
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

	_, continuation, err := harness.BeginGoalOperation(ctx, testCommandRequest(t, "/goal finish renderer tests"))
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
	if harness.hasGoalOperation("thread_fake") {
		t.Fatal("goal operation route owner leaked after pre-sink provider exit")
	}
}

func TestCodexHarnessGoalStartupSetResponseFailureFinishesOperation(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-set-invalid-response"))
	_, continuation, err := harness.BeginGoalOperation(context.Background(), testCommandRequest(t, "/goal finish renderer tests"))
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
			_, continuation, err := harness.BeginGoalOperation(context.Background(), testCommandRequest(t, "/goal finish renderer tests"))
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

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)
		t.Fatalf("cancel goal operation: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForGoalOperationReleased(t, harness, "thread_fake")
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load cancelled message page: %v", err)
	}
	if page.Goal == nil || page.Goal.Status != "paused" {
		t.Fatalf("page goal = %+v, want provider paused goal after cancellation", page.Goal)
	}
}

func TestCodexHarnessGoalOperationCancelRetriesDeterministicStaleTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-stale-interrupt-retry"))
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
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_stale")

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		cancelPhase0ActiveRunForCleanup(t, service, "workspace_api", conversation.ID)
		t.Fatalf("cancel goal operation with stale turn retry: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForGoalOperationReleased(t, harness, "thread_fake")
}

func waitForGoalOperationReleased(t *testing.T, harness *CodexHarness, threadID string) {
	t.Helper()
	deadline := time.Now().Add(phase0BlockingFreezeTimeout)
	for time.Now().Before(deadline) {
		if !harness.hasGoalOperation(threadID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("goal operation route owner leaked for thread %s", threadID)
}

func waitForPhase0ActiveCodexTurn(t *testing.T, harness *CodexHarness, runID string) {
	t.Helper()
	waitForPhase0ActiveCodexTurnWhere(t, harness, runID, func(active *codexActiveTurn) bool {
		return active.threadID != "" && active.turnID != ""
	})
}

func waitForPhase0ActiveCodexTurnID(t *testing.T, harness *CodexHarness, runID string, turnID string) {
	t.Helper()
	waitForPhase0ActiveCodexTurnWhere(t, harness, runID, func(active *codexActiveTurn) bool {
		return active.threadID != "" && active.turnID == turnID
	})
}

func waitForPhase0ActiveCodexTurnWhere(t *testing.T, harness *CodexHarness, runID string, ready func(*codexActiveTurn) bool) {
	t.Helper()

	deadline := time.Now().Add(phase0BlockingFreezeTimeout)
	for time.Now().Before(deadline) {
		harness.mu.Lock()
		active := harness.active[runID]
		ok := active != nil && ready(active)
		harness.mu.Unlock()
		if ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for active codex turn %s before cancellation", runID)
}

func TestServiceGoalOperationRunRemainsActiveAcrossIdleGap(t *testing.T) {
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
	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	if run.Status != RunStatusRunning {
		t.Fatalf("run status after first physical turn = %s, want running run", run.Status)
	}
}

func TestServiceGoalOperationTerminalProviderStateCompletesRun(t *testing.T) {
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
	if got := phase0AssistantText(page); got != "goal turn A. goal turn B. " {
		t.Fatalf("assistant text = %q, want persisted output from both physical turns", got)
	}
	if page.Goal == nil || page.Goal.Status != "complete" {
		t.Fatalf("page goal = %+v, want terminal complete goal", page.Goal)
	}
}

func TestServiceGoalOperationSteersDuringSecondPhysicalTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-steer-second-turn"))
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
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_b")
	conversation, err = service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if ref := latestHarnessRef(conversation, HarnessCodex); ref.LastTurnID != "turn_goal_a" {
		t.Fatalf("stored codex turn ref = %q, want logical turn_goal_a before steering", ref.LastTurnID)
	}

	if _, err := service.SteerActiveRun("workspace_api", conversation.ID, "adjust course"); err != nil {
		t.Fatalf("steer active goal run: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if got := phase0AssistantText(page); got != "goal turn A. goal turn B. steered goal. " {
		t.Fatalf("assistant text = %q, want steered second physical turn output", got)
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

func TestServiceGoalOperationPauseCommandCompletesExistingRun(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-pause-command"))
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
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_command")

	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal pause"); err != nil {
		t.Fatalf("execute goal pause command: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	finalRuns, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list final runs: %v", err)
	}
	if len(finalRuns) != 1 {
		t.Fatalf("runs after pause = %+v, want existing goal run only", finalRuns)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if page.Goal == nil || page.Goal.Status != "paused" {
		t.Fatalf("page goal = %+v, want provider paused goal", page.Goal)
	}
	if got := phase0AssistantText(page); got != "goal command waiting. " {
		t.Fatalf("assistant text = %q, want active goal run output preserved", got)
	}
}

func TestServiceGoalOperationClearCommandCompletesExistingRun(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-clear-command"))
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
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusRunning)
	waitForPhase0ActiveCodexTurnID(t, harness, runs[0].ID, "turn_goal_command")

	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal clear"); err != nil {
		t.Fatalf("execute goal clear command: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	finalRuns, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list final runs: %v", err)
	}
	if len(finalRuns) != 1 {
		t.Fatalf("runs after clear = %+v, want existing goal run only", finalRuns)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if page.Goal != nil {
		t.Fatalf("page goal = %+v, want provider-cleared goal", page.Goal)
	}
	if got := phase0AssistantText(page); got != "goal command waiting. " {
		t.Fatalf("assistant text = %q, want active goal run output preserved", got)
	}
}

func TestCodexHarnessGoalOperationRejectsConcurrentThreadTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-idle-gap"))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	request := testCommandRequest(t, "/goal second objective")
	request.ThreadRef = result.ThreadRef
	_, second, err := harness.BeginGoalOperation(context.Background(), request)
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
	_, continuation, err := harness.BeginGoalOperation(context.Background(), request)
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

func TestServiceGoalOperationUnifiedExecStartupCompletedInPhysicalTurnStaysActivity(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-foreground-unified-exec"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal count repo lines"); err != nil {
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

	processes, err := service.store.ListBackgroundTerminalProcesses("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	if len(processes) != 0 {
		t.Fatalf("foreground unified exec completed inside physical turn created background terminals: %+v", processes)
	}
	blocks := loadPersistedBlocks(t, service, "workspace_api", runs[0].ID)
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindBackgroundTerminal {
			t.Fatalf("foreground unified exec completed inside physical turn created background marker: %+v", block)
		}
	}
	activities := activityBlocks(blocks)
	if len(activities) != 1 {
		t.Fatalf("activity blocks = %d, want one foreground command row: %v", len(activities), blockKinds(blocks))
	}
	activity := activities[0].Activity
	if activity.Status != RunItemStatusCompleted || activity.Details.Command != fakeUnifiedExecForegroundCommand || !activity.HasOutput {
		t.Fatalf("foreground goal command activity = %+v, want completed command with output", activity)
	}
	activityPage, err := service.LoadRunActivityPage("workspace_api", runs[0].ID, 20)
	if err != nil {
		t.Fatalf("load run activity page: %v", err)
	}
	if len(activityPage.Activity) != 1 || activityPage.Activity[0].Details.Command != fakeUnifiedExecForegroundCommand {
		t.Fatalf("foreground goal command activity page = %+v, want only completed command activity", activityPage.Activity)
	}
}

func TestServiceGoalOperationBackgroundTerminalSurvivesCancellation(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-background-cancel"))
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
	waitForRunItemByProvider(t, service, "workspace_api", runs[0].ID, fakeUnifiedExecAlphaItemID)

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel goal operation with background terminal: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run status = %s, want cancelled", cancelled.Status)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCancelled)

	process := waitForBackgroundTerminalProcess(t, service, "workspace_api", conversation.ID, fakeUnifiedExecAlphaItemID, BackgroundTerminalRunning)
	process, err = service.store.LoadBackgroundTerminalProcess("workspace_api", conversation.ID, process.ID)
	if err != nil {
		t.Fatalf("reload background terminal: %v", err)
	}
	if process.Status != BackgroundTerminalRunning || process.CompletedAt != "" {
		t.Fatalf("goal background terminal after cancellation = %+v, want still-running process", process)
	}
	blocks := loadPersistedBlocks(t, service, "workspace_api", runs[0].ID)
	marker := backgroundTerminalMarkerBlock(t, blocks, fakeUnifiedExecAlphaCommand)
	if marker.Status != TranscriptBlockStatusComplete {
		t.Fatalf("goal background marker status = %s, want complete chronology marker", marker.Status)
	}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem {
			t.Fatalf("goal background terminal cancellation path created activity block: %+v", block)
		}
	}
}

func TestServiceGoalOperationBackgroundTerminalCrossPhysicalTurnEmitsNoDuplicateRegistryEvents(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-background-physical-turn-b"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
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
	events := collectTranscriptEventsUntilTerminal(t, subscription, runs[0].ID)

	process := waitForBackgroundTerminalProcess(t, service, "workspace_api", conversation.ID, fakeUnifiedExecAlphaItemID, BackgroundTerminalExited)
	if process.ProcessID != fakeUnifiedExecAlphaProcess {
		t.Fatalf("goal background terminal provider process = %q, want %q", process.ProcessID, fakeUnifiedExecAlphaProcess)
	}
	outputPage, err := service.store.LoadBackgroundTerminalOutputPage("workspace_api", conversation.ID, process.ID, 0, 10)
	if err != nil {
		t.Fatalf("load background terminal output: %v", err)
	}
	if len(outputPage.Output) != 1 || outputPage.Output[0].Text != "goal terminal output\n" {
		t.Fatalf("background terminal output page = %+v, want one cross-physical-turn output chunk", outputPage)
	}
	if created := eventsOfType(events, EventTypeBackgroundTerminalCreated); len(created) != 1 {
		t.Fatalf("background terminal created events = %d, want 1: %v", len(created), eventTypes(events))
	}
	if outputDeltas := eventsOfType(events, EventTypeBackgroundTerminalOutputDelta); len(outputDeltas) != 1 {
		t.Fatalf("background terminal output delta events = %d, want 1: %v", len(outputDeltas), eventTypes(events))
	}
	if exitedUpdates := countBackgroundTerminalUpdatedStatus(t, events, process.ID, BackgroundTerminalExited); exitedUpdates != 1 {
		t.Fatalf("exited background terminal updates = %d, want 1: %v", exitedUpdates, eventTypes(events))
	}
	if replaced := eventsOfType(events, EventTypeBackgroundTerminalsReplaced); len(replaced) != 0 {
		t.Fatalf("goal background terminal republished full list: %v", eventTypes(events))
	}
	blocks := loadPersistedBlocks(t, service, "workspace_api", runs[0].ID)
	if markers := countBackgroundTerminalMarkerBlocks(blocks, fakeUnifiedExecAlphaCommand); markers != 1 {
		t.Fatalf("goal background terminal marker blocks = %d, want 1: %v", markers, blockKinds(blocks))
	}
	activityPage, err := service.LoadRunActivityPage("workspace_api", runs[0].ID, 20)
	if err != nil {
		t.Fatalf("load run activity page: %v", err)
	}
	if len(activityPage.Items) != 0 || len(activityPage.Output) != 0 || len(activityPage.Activity) != 0 {
		t.Fatalf("promoted goal background terminal leaked into activity page: items=%+v output=%+v activity=%+v", activityPage.Items, activityPage.Output, activityPage.Activity)
	}
}

func countBackgroundTerminalMarkerBlocks(blocks []TranscriptBlock, command string) int {
	count := 0
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindBackgroundTerminal &&
			block.BackgroundTerminal != nil &&
			block.BackgroundTerminal.Command == command {
			count++
		}
	}
	return count
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
	harness := NewCodexHarness(testCodexConfig(mode))
	result, continuation := beginPhase0GoalOperation(t, harness, "/goal finish renderer tests")
	defer continuation.Close()

	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), phase0GoalTurnRequest(t, result), sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. goal turn B. " {
		t.Fatalf("%s assistant text = %q, want output from both physical turns", mode, sink.text)
	}
	if sink.linkCount != 1 || sink.turnID != "turn_goal_a" {
		t.Fatalf("%s links/turn = %d/%q, want one logical turn_goal_a link", mode, sink.linkCount, sink.turnID)
	}
	if len(sink.goals) == 0 || sink.goals[len(sink.goals)-1] == nil || sink.goals[len(sink.goals)-1].Status != "complete" {
		t.Fatalf("%s goals = %+v, want terminal complete goal", mode, sink.goals)
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
	if sink.text != "goal turn A. goal turn B. " {
		t.Fatalf("%s assistant text = %q, want output from both physical turns", mode, sink.text)
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

func countBackgroundTerminalUpdatedStatus(t *testing.T, events []Event, processID string, status BackgroundTerminalStatus) int {
	t.Helper()
	count := 0
	for _, event := range eventsOfType(events, EventTypeBackgroundTerminalUpdated) {
		process := decodeBackgroundTerminalUpdated(t, event)
		if process.ID == processID && process.Status == status {
			count++
		}
	}
	return count
}

func beginPhase0GoalOperation(t *testing.T, harness *CodexHarness, raw string) (HarnessCommandResult, HarnessGoalOperation) {
	t.Helper()
	result, continuation, err := harness.BeginGoalOperation(context.Background(), testCommandRequest(t, raw))
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	if continuation == nil {
		t.Fatal("begin goal operation returned nil operation")
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
