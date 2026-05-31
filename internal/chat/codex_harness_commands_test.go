package chat

import (
	"context"
	"strings"
	"testing"
	"time"

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

func TestCodexHarnessExecutesModelListRPCWithoutThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-list"))
	request := testCommandRequest(t, "/model")

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

func TestCodexHarnessStoresReasoningEffortWithoutThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-effort-set-local"))
	request := testCommandRequest(t, "/model effort xhigh")

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
	request := testCommandRequest(t, "/model gpt-test")

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
}

func TestCodexHarnessExecutesModelListRPCAgainstLinkedThread(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-list-linked"))
	request := testCommandRequest(t, "/model")
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
	request := testCommandRequest(t, "/model gpt-test")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}

	result, err := harness.ExecuteCommand(context.Background(), request)
	if err != nil {
		t.Fatalf("execute command: %v", err)
	}
	if result.SelectedModel != "gpt-test" || !result.HasThreadRef || result.ThreadRef.ThreadID != "thread_fake" {
		t.Fatalf("result = %+v, want selected model with linked thread", result)
	}
}

func TestCodexHarnessRequiresModelSettingsUpdatedNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set-no-notification"))
	request := testCommandRequest(t, "/model gpt-test")
	request.ThreadRef = HarnessThreadRef{Harness: HarnessCodex, ThreadID: "thread_fake", Status: HarnessRefLinked}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	_, err := harness.ExecuteCommand(ctx, request)
	if err == nil {
		t.Fatal("execute command succeeded, want missing settings update notification error")
	}
	commandErr, ok := IsChatCommandError(err)
	if !ok || commandErr.Code != ChatCommandErrorCodexRPC {
		t.Fatalf("error = %#v, want codex RPC command error", err)
	}
	if !strings.Contains(err.Error(), "thread/settings/updated") {
		t.Fatalf("error = %q, want settings updated notification", err)
	}
}

func TestCodexHarnessTreatsCurrentModelSetAsNoop(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("command-model-set-already-current"))
	request := testCommandRequest(t, "/model gpt-test")
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
	request := testCommandRequest(t, "/model effort high")
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
	request := testCommandRequest(t, "/model effort high")
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
		"command-model-list",
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
	return mode == "command-goal-set"
}

func fakeCommandResumesThread(mode string) bool {
	switch mode {
	case "command-model-list-linked",
		"command-model-set",
		"command-model-set-no-notification",
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
	if params["includeHidden"] != true {
		panic("model list should include hidden models")
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
	case "command-model-set", "command-model-set-no-notification":
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
		"goal": map[string]any{
			"objective": objective,
			"status":    status,
			"threadId":  "thread_fake",
		},
	})
}

func writeFakeThreadSettingsUpdated(model string, effort ReasoningEffort) {
	writeFakeNotification("thread/settings/updated", map[string]any{
		"threadId": "thread_fake",
		"threadSettings": map[string]any{
			"effort": string(effort),
			"model":  model,
		},
	})
}
