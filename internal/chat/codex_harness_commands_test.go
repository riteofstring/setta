package chat

import (
	"context"
	"strings"
	"testing"

	"setta/internal/workspace"
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

func TestCodexHarnessBeginsGoalContinuationFromCommandRPC(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-goal-continuation"))
	request := testCommandRequest(t, "/goal finish renderer tests")

	result, continuation, err := harness.BeginGoalContinuation(context.Background(), request)
	if err != nil {
		t.Fatalf("begin goal continuation: %v", err)
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
	turnRequest.Prompt = "finish renderer tests"
	turnRequest.ThreadRef = result.ThreadRef
	turnRequest.Workspace = request.Workspace
	sink := newRecordingSink()
	completion, err := continuation.Wait(context.Background(), turnRequest, sink)
	if err != nil {
		t.Fatalf("wait goal continuation: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "goal continuation" {
		t.Fatalf("assistant text = %q, want goal continuation", sink.text)
	}
	if len(sink.goals) == 0 || sink.goals[len(sink.goals)-1] == nil || sink.goals[len(sink.goals)-1].Status != "complete" {
		t.Fatalf("goals = %+v, want final complete goal", sink.goals)
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
}

func fakeCommandUsesThread(mode string) bool {
	return fakeCommandStartsThread(mode) || fakeCommandResumesThread(mode)
}

func fakeCommandStartsThread(mode string) bool {
	return mode == "command-goal-set" || mode == "command-goal-continuation" || mode == "command-goal-edit" || mode == "command-goal-pause-no-goal"
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
