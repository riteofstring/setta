package chat

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"setta/internal/workspace"
)

const (
	fakeUnifiedExecForegroundItemID  = "foreground_unified_exec_fake"
	fakeUnifiedExecForegroundProcess = "proc_foreground_fake"
	fakeUnifiedExecForegroundCommand = "command -v tokei"
)

func TestCodexHarnessExecutesIdleGoalCommandRPC(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-goal-set"))
	request := testCommandRequest(t, "/goal finish renderer tests")

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("thread ref = %+v has=%v, want linked thread", result.ThreadRef, result.HasThreadRef)
	}
	if result.Goal == nil || result.Goal.Objective != "finish renderer tests" || result.Goal.Status != "active" {
		t.Fatalf("goal = %+v, want active renderer goal", result.Goal)
	}
}

func TestCodexHarnessBeginsGoalOperationFromCommandRPC(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-multi-turn"))
	request := testCommandRequest(t, "/goal finish renderer tests")

	result, continuation, err := harness.BeginGoalOperation(context.Background(), request)
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	defer continuation.Close()
	if !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("thread ref = %+v has=%v, want linked thread", result.ThreadRef, result.HasThreadRef)
	}
	if result.Goal == nil || result.Goal.Status != "active" {
		t.Fatalf("goal = %+v, want active goal", result.Goal)
	}

	turnRequest := testTurnRequest(t)
	turnRequest.Conversation = request.Conversation
	turnRequest = setTestTurnRequestPrompt(turnRequest, "finish renderer tests")
	turnRequest.ThreadRef = result.ThreadRef
	turnRequest.Workspace = request.Workspace
	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), turnRequest, sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal turn A. goal turn B. " {
		t.Fatalf("assistant text = %q, want output from both physical goal turns", sink.text)
	}
	if len(sink.goals) == 0 || sink.goals[len(sink.goals)-1] == nil || sink.goals[len(sink.goals)-1].Status != "complete" {
		t.Fatalf("goals = %+v, want final complete goal", sink.goals)
	}
}

// Goal operations run outside StartTurn, but they still preserve the thread's
// conversation context for background terminals that emit after the operation.
func TestCodexHarnessGoalOperationEnablesBackgroundTerminalLateRouting(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("goal-operation-multi-turn"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	request := testCommandRequest(t, "/goal finish renderer tests")

	result, continuation, err := harness.BeginGoalOperation(context.Background(), request)
	if err != nil {
		t.Fatalf("begin goal operation: %v", err)
	}
	defer continuation.Close()

	turnRequest := testTurnRequest(t)
	turnRequest.Conversation = request.Conversation
	turnRequest = setTestTurnRequestPrompt(turnRequest, "finish renderer tests")
	turnRequest.ThreadRef = result.ThreadRef
	turnRequest.Workspace = request.Workspace
	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), turnRequest, sink)
	if err != nil {
		t.Fatalf("wait goal operation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	// The flag is cleared (turn done) and the conversation context is retained, exactly as after
	// StartTurn, so a later unified-exec event on this thread routes to the right conversation.
	routedSink, routedContext, ok := harness.backgroundTerminalLateRouting("thread_fake")
	if !ok {
		t.Fatal("goal operation did not enable background-terminal late routing for its thread")
	}
	if routedSink == nil {
		t.Fatal("background-terminal late routing returned a nil sink")
	}
	if routedContext.workspaceID != "workspace_api" || routedContext.conversationID != "conversation_api" {
		t.Fatalf("late routing context = %+v, want workspace_api/conversation_api", routedContext)
	}
}

func TestCodexHarnessGoalEditOpensEditor(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-goal-edit"))
	request := testCommandRequest(t, "/goal edit")

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.Action != ChatCommandResultGoalEditor {
		t.Fatalf("action = %s, want goal editor", result.Action)
	}
	if result.Goal == nil || result.Goal.Objective != "finish renderer tests" {
		t.Fatalf("goal = %+v, want editable goal", result.Goal)
	}
}

func TestCodexHarnessGoalPauseRequiresExistingGoal(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-goal-pause-no-goal"))
	request := testCommandRequest(t, "/goal pause")

	_, err := harness.ExecuteCommand(context.Background(), request)
	if err == nil {
		t.Fatal("pause goal succeeded without goal")
	}
	commandErr, ok := IsChatCommandError(err)
	if !ok || commandErr.Code != ChatCommandErrorGoalNotSet {
		t.Fatalf("pause goal error = %#v, want no-goal command error", err)
	}
}

func TestCodexHarnessExecutesModelListRPCWithoutThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-list"))
	request := testModelPickerCommandRequest(t)

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.Action != ChatCommandResultModelPicker || len(result.Models) != 1 || result.Models[0].ID != "gpt-test" {
		t.Fatalf("result = %+v, want model picker with fake model", result)
	}
	if result.HasThreadRef {
		t.Fatalf("thread ref = %+v, want no thread for model picker", result.ThreadRef)
	}
	if result.SelectedModel != "gpt-test" {
		t.Fatalf("selected model = %q, want config model", result.SelectedModel)
	}
	if result.SelectedReasoningEffort == nil || *result.SelectedReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("selected reasoning effort = %v, want config effort", result.SelectedReasoningEffort)
	}
	if len(result.ReasoningEfforts) != 3 || result.ReasoningEfforts[2].Effort != ReasoningEffortXHigh {
		t.Fatalf("reasoning efforts = %+v, want fake model efforts", result.ReasoningEfforts)
	}
}

func TestCodexHarnessModelListFollowsPaginationAndHidesHiddenModels(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-list-paginated"))
	request := testModelPickerCommandRequest(t)

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if len(result.Models) != 2 {
		t.Fatalf("models = %+v, want two visible paginated models", result.Models)
	}
	if result.Models[0].Model != "gpt-test" || result.Models[1].Model != "gpt-test-2" {
		t.Fatalf("models = %+v, want visible models from both pages", result.Models)
	}
	for _, model := range result.Models {
		if model.Hidden {
			t.Fatalf("models = %+v, want hidden models filtered", result.Models)
		}
	}
}

func TestCodexHarnessStoresReasoningEffortWithoutThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-effort-set-local"))
	request := testTypedReasoningEffortCommandRequest(t, ReasoningEffortXHigh)

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.HasThreadRef {
		t.Fatalf("thread ref = %+v, want no thread for local model setting", result.ThreadRef)
	}
	if result.SelectedModel != "gpt-test" || result.SelectedReasoningEffort == nil || *result.SelectedReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("result = %+v, want config model with selected reasoning effort", result)
	}
	if result.CodexSettings == nil || result.CodexSettings.Model != "gpt-test" || result.CodexSettings.ReasoningEffort == nil || *result.CodexSettings.ReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("codex settings = %+v, want persisted local settings", result.CodexSettings)
	}
}

func TestCodexHarnessStoresModelWithoutThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set-local"))
	request := testTypedModelCommandRequest(t, "gpt-test")

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.HasThreadRef {
		t.Fatalf("thread ref = %+v, want no thread for local model setting", result.ThreadRef)
	}
	if result.CodexSettings == nil || result.CodexSettings.Model != "gpt-test" || result.CodexSettings.ReasoningEffort == nil || *result.CodexSettings.ReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("codex settings = %+v, want config reasoning preserved", result.CodexSettings)
	}
}

func TestCodexHarnessAppliesConversationSettingsToInitialTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("initial-settings"))
	sink := newRecordingSink()
	request := testTurnRequest(t)
	effort := ReasoningEffortXHigh
	request.Conversation.CodexSettings = &ChatCodexSettings{
		Model:           "gpt-test",
		ReasoningEffort: &effort,
	}

	completion, err := harness.StartTurn(context.Background(), request, sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.settings) == 0 || sink.settings[0].Model != "gpt-test" || sink.settings[0].ReasoningEffort == nil || *sink.settings[0].ReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("effective settings = %+v, want gpt-test xhigh", sink.settings)
	}
}

func TestCodexHarnessExecutesModelListRPCAgainstLinkedThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-list-linked"))
	request := testModelPickerCommandRequest(t)
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.Action != ChatCommandResultModelPicker || len(result.Models) != 1 || result.Models[0].ID != "gpt-test" {
		t.Fatalf("result = %+v, want model picker with fake model", result)
	}
	if result.SelectedModel != "gpt-test" {
		t.Fatalf("selected model = %q, want linked thread model", result.SelectedModel)
	}
	if result.SelectedReasoningEffort == nil || *result.SelectedReasoningEffort != ReasoningEffortHigh {
		t.Fatalf("selected reasoning effort = %v, want linked thread effort", result.SelectedReasoningEffort)
	}
	if result.HasThreadRef {
		t.Fatalf("thread ref = %+v, want model picker to avoid persisted thread ref updates", result.ThreadRef)
	}
}

func TestCodexHarnessExecutesModelSetRPCAgainstLinkedThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set"))
	request := testTypedModelCommandRequest(t, "gpt-test")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.SelectedModel != "gpt-test" || !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("result = %+v, want selected model with linked thread", result)
	}
}

func TestCodexHarnessTreatsModelSettingsUpdateAckAsSuccess(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set-no-notification"))
	request := testTypedModelCommandRequest(t, "gpt-test")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.SelectedModel != "gpt-test" {
		t.Fatalf("selected model = %q, want acked model", result.SelectedModel)
	}
}

func TestCodexHarnessFailsUnsupportedThreadSettingsUpdate(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set-unsupported-settings-update"))
	request := testTypedModelCommandRequest(t, "gpt-test")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err == nil {
		t.Fatal("execute command succeeded, want unsupported thread/settings/update error")
	}
	if result.SelectedModel != "" || result.SelectedReasoningEffort != nil {
		t.Fatalf("result = %+v, want no selected settings after failed update", result)
	}
	commandErr, ok := IsChatCommandError(err)
	if !ok || commandErr.Code != ChatCommandErrorCodexRPC {
		t.Fatalf("error = %T %v, want codex RPC command error", err, err)
	}
	if !strings.Contains(commandErr.Message, "thread/settings/update is required") ||
		!strings.Contains(commandErr.Message, "experimentalApi capability") {
		t.Fatalf("error message = %q, want required method and missing capability", commandErr.Message)
	}
}

func TestCodexHarnessTreatsCurrentModelSetAsNoop(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set-already-current"))
	request := testTypedModelCommandRequest(t, "gpt-test")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.SelectedModel != "gpt-test" || !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("result = %+v, want selected model no-op with linked thread", result)
	}
}

func TestCodexHarnessExecutesReasoningEffortSetRPCAgainstLinkedThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-effort-set"))
	request := testTypedReasoningEffortCommandRequest(t, ReasoningEffortHigh)
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.SelectedReasoningEffort == nil || *result.SelectedReasoningEffort != ReasoningEffortHigh || !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("result = %+v, want selected reasoning effort with linked thread", result)
	}
}

func TestCodexHarnessTreatsCurrentReasoningEffortSetAsNoop(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-effort-set-already-current"))
	request := testTypedReasoningEffortCommandRequest(t, ReasoningEffortHigh)
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.SelectedReasoningEffort == nil || *result.SelectedReasoningEffort != ReasoningEffortHigh || !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("result = %+v, want selected reasoning effort no-op with linked thread", result)
	}
}

func testCommandRequest(t *testing.T, raw string) HarnessCommandRequest {
	t.Helper()
	command, err := ParseChatCommand(raw)
	if err != nil {
		t.Fatalf("parse command %q: %v", raw, err)
	}
	return testCommandRequestFromCommand(t, command)
}

func testTypedModelCommandRequest(t *testing.T, modelID string) HarnessCommandRequest {
	t.Helper()
	command, err := modelSetChatCommand(modelID)
	if err != nil {
		t.Fatalf("build model command: %v", err)
	}
	return testCommandRequestFromCommand(t, command)
}

func testModelPickerCommandRequest(t *testing.T) HarnessCommandRequest {
	t.Helper()
	return testCommandRequestFromCommand(t, modelPickerChatCommand())
}

func testTypedReasoningEffortCommandRequest(t *testing.T, effort ReasoningEffort) HarnessCommandRequest {
	t.Helper()
	command, err := reasoningEffortSetChatCommand(effort)
	if err != nil {
		t.Fatalf("build effort command: %v", err)
	}
	return testCommandRequestFromCommand(t, command)
}

func testCommandRequestFromCommand(t *testing.T, command ChatCommand) HarnessCommandRequest {
	t.Helper()
	rootPath := t.TempDir()
	return HarnessCommandRequest{
		Command: command,
		Conversation: Conversation{
			ID:          "conversation_api",
			WorkspaceID: "workspace_api",
		},
		Workspace: workspace.WorkspaceSummary{
			ID:           "workspace_api",
			RootPath:     rootPath,
			DisplayName:  "api",
			LastOpenedAt: "2026-05-29T20:00:00Z",
		},
	}
}

func fakeCommandDone(mode string) bool {
	if fakeGoalOperationMode(mode) {
		return false
	}
	switch mode {
	case "command-goal-set",
		"command-goal-edit",
		"command-goal-pause-no-goal",
		"command-model-list",
		"command-model-list-paginated",
		"command-model-list-linked",
		"command-model-set",
		"command-model-set-local",
		"command-effort-set",
		"command-effort-set-local":
		return true
	default:
		return false
	}
}

func handleFakeCommandThread(mode string, state *fakeCodexState, message map[string]any) {
	if !fakeCommandUsesThread(mode) {
		return
	}
	method := message["method"]
	params := fakeParams(message)
	if fakeGoalOperationMode(mode) {
		if method != "thread/start" && method != "thread/resume" {
			panic("goal operation command should start or resume a thread")
		}
		state.commandThreadStarted = method == "thread/start"
		state.commandThreadResumed = method == "thread/resume"
		state.currentThreadID = "thread_fake"
		if method == "thread/resume" {
			if threadID, ok := params["threadId"].(string); ok && threadID != "" {
				state.currentThreadID = threadID
			}
		}
		return
	}
	if fakeCommandStartsThread(mode) && method != "thread/start" {
		panic("goal set command should start a thread")
	}
	if fakeCommandResumesThread(mode) && method != "thread/resume" {
		panic("linked model command should resume a linked thread")
	}
	if params["approvalPolicy"] != "on-request" || params["approvalsReviewer"] != "user" {
		panic("command thread start/resume missing approval params")
	}
	if params["cwd"] == "" {
		panic("command thread start/resume missing cwd")
	}
	if method == "thread/resume" && params["threadId"] != "thread_fake" {
		panic("command thread resume used wrong thread id")
	}
	state.commandThreadStarted = method == "thread/start"
	state.commandThreadResumed = method == "thread/resume"
	state.currentThreadID = "thread_fake"
	if method == "thread/resume" {
		state.currentThreadID = params["threadId"].(string)
	}
}

func fakeCommandUsesThread(mode string) bool {
	return fakeCommandStartsThread(mode) || fakeCommandResumesThread(mode)
}

func fakeCommandStartsThread(mode string) bool {
	return mode == "command-goal-set" || mode == "command-goal-edit" || mode == "command-goal-pause-no-goal" || fakeGoalOperationMode(mode)
}

func fakeCommandResumesThread(mode string) bool {
	switch mode {
	case "command-model-list-linked",
		"command-model-set",
		"command-model-set-no-notification",
		"command-model-set-unsupported-settings-update",
		"command-model-set-already-current",
		"command-effort-set",
		"command-effort-set-already-current":
		return true
	default:
		return false
	}
}

func assertFakeGoalSet(mode string, message map[string]any) {
	params := fakeParams(message)
	if params["threadId"] != "thread_fake" {
		panic("goal command targeted wrong thread")
	}
	if fakeGoalOperationMode(mode) {
		return
	}
	switch mode {
	case "command-goal-set":
		if params["objective"] != "finish renderer tests" || params["status"] != "active" {
			panic("goal set params mismatch")
		}
	}
}

func assertFakeModelList(message map[string]any) {
	params := fakeParams(message)
	if params["includeHidden"] != false {
		panic("model list should hide hidden models by default")
	}
}

func assertFakeConfigRead(message map[string]any) {
	params := fakeParams(message)
	if params["cwd"] == "" {
		panic("config/read should include cwd")
	}
}

func assertFakeModelSet(message map[string]any) {
	params := fakeParams(message)
	if params["threadId"] != "thread_fake" || params["model"] != "gpt-test" {
		panic("model set used wrong params")
	}
}

func assertFakeEffortSet(message map[string]any) {
	params := fakeParams(message)
	if params["threadId"] != "thread_fake" || params["effort"] != "high" {
		panic("reasoning effort set used wrong params")
	}
}

func assertFakeInitialTurnSettings(message map[string]any) {
	params := fakeParams(message)
	if params["model"] != "gpt-test" || params["effort"] != "xhigh" {
		panic("initial turn settings mismatch")
	}
}

func fakeThreadResponseModel(mode string) string {
	switch mode {
	case "command-model-set", "command-model-set-no-notification", "command-model-set-unsupported-settings-update":
		return "gpt-old"
	default:
		return "gpt-test"
	}
}

func fakeThreadResponseEffort(mode string) ReasoningEffort {
	switch mode {
	case "command-effort-set":
		return ReasoningEffortMedium
	default:
		return ReasoningEffortHigh
	}
}

func writeFakeGoalResponse(id any, objective string, status string) {
	writeFakeResponse(id, map[string]any{
		"goal": fakeThreadGoal(objective, status),
	})
}

func writeFakeThreadGoalUpdated(objective string, status string) {
	writeFakeNotification("thread/goal/updated", map[string]any{
		"goal":     fakeThreadGoal(objective, status),
		"threadId": "thread_fake",
	})
}

func writeFakeTurnStartedForThread(threadID string, turnID string) {
	writeFakeNotification("turn/started", map[string]any{
		"threadId": threadID,
		"turnId":   turnID,
	})
}

func writeFakeAssistantDeltaForTurn(turnID string, itemID string, delta string) {
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    delta,
		"itemId":   itemID,
		"threadId": "thread_fake",
		"turnId":   turnID,
	})
}

func writeFakeCompletedTurnID(turnID string, status string) {
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn": map[string]any{
			"id":     turnID,
			"items":  []any{},
			"status": status,
		},
	})
}

func writeFakeGoalPhysicalTurn(turnID string, text string) {
	writeFakeTurnStartedForThread("thread_fake", turnID)
	writeFakeAssistantDeltaForTurn(turnID, "item_"+turnID, text)
}

func writeFakeGoalOperationMultiTurn(mode string, objective string) {
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeGoalPhysicalTurn("turn_goal_a", "goal turn A. ")
	if fakeGoalOperationStartsBackgroundTerminal(mode) {
		writeFakeUnifiedExecStartupForTurn("turn_goal_a", fakeUnifiedExecAlphaItemID, fakeUnifiedExecAlphaProcess, fakeUnifiedExecAlphaCommand)
	}
	if fakeGoalOperationActiveBeforeFirstCompletion(mode) {
		writeFakeThreadGoalUpdated(objective, "active")
	}
	writeFakeCompletedTurnID("turn_goal_a", "completed")
	if mode == "goal-operation-background-idle-gap" {
		writeFakeGoalBackgroundTerminalOutputAndCompletion("turn_goal_a")
	}
	if mode == "goal-operation-idle-gap" {
		return
	}
	if mode == "goal-operation-active-after-completion" {
		writeFakeThreadGoalUpdated(objective, "active")
	}
	writeFakeGoalPhysicalTurn("turn_goal_b", "goal turn B. ")
	if fakeGoalOperationEmitsBackgroundDuringSecondTurn(mode) {
		writeFakeGoalBackgroundTerminalOutputAndCompletion("turn_goal_a")
	}
	if mode == "goal-operation-approval-second-turn" {
		time.Sleep(100 * time.Millisecond)
		writeFakeGoalCommandApprovalRequestForTurn("turn_goal_b")
	}
	if mode == "goal-operation-plan-second-turn" {
		writeFakeGoalPlanUpdatedForTurn("turn_goal_b")
	}
	if mode == "goal-operation-steer-second-turn" {
		return
	}
	if mode == "goal-operation-terminal-before-completion" || mode == "goal-operation-multi-turn" || mode == "goal-operation-duplicate-finish" {
		writeFakeThreadGoalUpdated(objective, "complete")
	}
	writeFakeCompletedTurnID("turn_goal_b", "completed")
	if fakeGoalOperationCompletesAfterSecondTurn(mode) {
		writeFakeThreadGoalUpdated(objective, "complete")
	}
}

func fakeGoalOperationStartsBackgroundTerminal(mode string) bool {
	switch mode {
	case "goal-operation-background-cross-turn",
		"goal-operation-background-idle-gap",
		"goal-operation-background-physical-turn-b",
		"goal-operation-background-delegate-before-rewrite":
		return true
	default:
		return false
	}
}

func fakeGoalOperationActiveBeforeFirstCompletion(mode string) bool {
	switch mode {
	case "goal-operation-active-before-completion",
		"goal-operation-multi-turn",
		"goal-operation-background-cross-turn",
		"goal-operation-background-idle-gap",
		"goal-operation-background-physical-turn-b",
		"goal-operation-background-delegate-before-rewrite",
		"goal-operation-duplicate-finish":
		return true
	default:
		return false
	}
}

func fakeGoalOperationEmitsBackgroundDuringSecondTurn(mode string) bool {
	switch mode {
	case "goal-operation-background-cross-turn",
		"goal-operation-background-physical-turn-b",
		"goal-operation-background-delegate-before-rewrite":
		return true
	default:
		return false
	}
}

func fakeGoalOperationCompletesAfterSecondTurn(mode string) bool {
	switch mode {
	case "goal-operation-terminal-after-completion",
		"goal-operation-active-after-completion",
		"goal-operation-active-before-completion",
		"goal-operation-background-cross-turn",
		"goal-operation-background-idle-gap",
		"goal-operation-background-physical-turn-b",
		"goal-operation-background-delegate-before-rewrite",
		"goal-operation-duplicate-finish",
		"goal-operation-approval-second-turn",
		"goal-operation-plan-second-turn",
		"goal-operation-resume",
		"goal-operation-set-preserves-old":
		return true
	default:
		return false
	}
}

func writeFakeGoalBackgroundTerminalOutputAndCompletion(turnID string) {
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "goal terminal output\n",
		"itemId":   fakeUnifiedExecAlphaItemID,
		"threadId": "thread_fake",
		"turnId":   turnID,
	})
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 3,
		"threadId":      "thread_fake",
		"turnId":        turnID,
		"item": map[string]any{
			"command":        fakeUnifiedExecAlphaCommand,
			"commandActions": []any{},
			"cwd":            "/tmp/workspace",
			"durationMs":     5,
			"exitCode":       0,
			"id":             fakeUnifiedExecAlphaItemID,
			"processId":      fakeUnifiedExecAlphaProcess,
			"source":         "unifiedExecStartup",
			"status":         "completed",
			"type":           "commandExecution",
		},
	})
}

func writeFakeGoalOperationForegroundUnifiedExec(objective string) {
	const turnID = "turn_goal_foreground"
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeGoalPhysicalTurn(turnID, "Checking available tools. ")
	writeFakeUnifiedExecStartupForTurn(turnID, fakeUnifiedExecForegroundItemID, fakeUnifiedExecForegroundProcess, fakeUnifiedExecForegroundCommand)
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "/opt/homebrew/bin/tokei\n",
		"itemId":   fakeUnifiedExecForegroundItemID,
		"threadId": "thread_fake",
		"turnId":   turnID,
	})
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 3,
		"threadId":      "thread_fake",
		"turnId":        turnID,
		"item": map[string]any{
			"command":        fakeUnifiedExecForegroundCommand,
			"commandActions": []any{},
			"cwd":            "/tmp/workspace",
			"durationMs":     5,
			"exitCode":       0,
			"id":             fakeUnifiedExecForegroundItemID,
			"processId":      fakeUnifiedExecForegroundProcess,
			"source":         "unifiedExecStartup",
			"status":         "completed",
			"type":           "commandExecution",
		},
	})
	writeFakeThreadGoalUpdated(objective, "complete")
	writeFakeCompletedTurnID(turnID, "completed")
}

func writeFakeGoalCommandApprovalRequestForTurn(turnID string) {
	writeFakeServerRequest("goal-approval-1", "item/commandExecution/requestApproval", map[string]any{
		"command":     "go test ./...",
		"itemId":      "item_goal_approval",
		"startedAtMs": 0,
		"threadId":    "thread_fake",
		"turnId":      turnID,
	})
}

func writeFakeGoalPlanUpdatedForTurn(turnID string) {
	writeFakeNotification("turn/plan/updated", map[string]any{
		"plan": []map[string]any{
			{
				"status": "inProgress",
				"step":   "Verify physical turn B activity",
			},
		},
		"summary":  "plan from physical turn B",
		"threadId": "thread_fake",
		"turnId":   turnID,
	})
}

func writeFakeGoalOperationClearDuringTurn(objective string) {
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeGoalPhysicalTurn("turn_goal_clear", "goal turn A. ")
	writeFakeThreadGoalCleared()
	writeFakeCompletedTurnID("turn_goal_clear", "completed")
}

func writeFakeGoalOperationSessionFailureAfterStart(objective string) {
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeGoalPhysicalTurn("turn_goal_session_failure", "goal turn A. ")
}

func writeFakeGoalOperationSingleTurnCompletion(objective string, status string) {
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeGoalPhysicalTurn("turn_goal_"+status, "goal turn A. ")
	writeFakeCompletedTurnID("turn_goal_"+status, status)
}

func writeFakeUnifiedExecStartupForTurn(turnID string, itemID string, processID string, command string) {
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"threadId":    "thread_fake",
		"turnId":      turnID,
		"item": map[string]any{
			"command":        command,
			"commandActions": []any{},
			"cwd":            "/tmp/workspace",
			"id":             itemID,
			"processId":      processID,
			"source":         "unifiedExecStartup",
			"status":         "inProgress",
			"type":           "commandExecution",
		},
	})
}

func writeFakeGoalOperationPreSinkBuffer(objective string) {
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeGoalPhysicalTurn("turn_goal_buffer", "pre-sink ")
	writeFakeAssistantDeltaForTurn("turn_goal_buffer", "item_goal_buffer_live", "live ")
	writeFakeThreadGoalUpdated(objective, "complete")
	writeFakeCompletedTurnID("turn_goal_buffer", "completed")
}

func writeFakeGoalOperationPreSinkOverflow(objective string) {
	writeFakeThreadGoalUpdated(objective, "active")
	writeFakeTurnStartedForThread("thread_fake", "turn_goal_overflow")
	for index := 0; index < 1025; index++ {
		writeFakeAssistantDeltaForTurn("turn_goal_overflow", fmt.Sprintf("item_goal_overflow_%04d", index), "x")
	}
	writeFakeThreadGoalUpdated(objective, "complete")
	writeFakeCompletedTurnID("turn_goal_overflow", "completed")
}

func fakeGoalOperationMode(mode string) bool {
	// Goal-operation modes model edge orders and race shapes the direct app-server
	// tests cannot force repeatably; do not add provider semantics here unless a
	// direct app-server characterization test anchors the behavior.
	return strings.HasPrefix(mode, "goal-operation-")
}

func fakeThreadGoal(objective string, status string) map[string]any {
	return map[string]any{
		"createdAt":       1,
		"objective":       objective,
		"status":          status,
		"threadId":        "thread_fake",
		"timeUsedSeconds": 0,
		"tokensUsed":      0,
		"updatedAt":       1,
	}
}

func writeFakeThreadSettingsUpdated(model string, effort ReasoningEffort) {
	writeFakeNotification("thread/settings/updated", map[string]any{
		"threadId":       "thread_fake",
		"threadSettings": fakeCodexThreadSettings(model, effort),
	})
}
