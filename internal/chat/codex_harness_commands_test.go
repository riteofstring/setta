package chat

import (
	"context"
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
	case "command-goal-set", "command-model-list", "command-model-set":
		return true
	default:
		return false
	}
}

func handleFakeCommandThread(mode string, state *fakeCodexState, message map[string]any) {
	if mode != "command-goal-set" && mode != "command-model-set" {
		return
	}
	method := message["method"]
	params := fakeParams(message)
	if mode == "command-goal-set" && method != "thread/start" {
		panic("goal set command should start a thread")
	}
	if mode == "command-model-set" && method != "thread/resume" {
		panic("model set command should resume a linked thread")
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

func assertFakeModelSet(message map[string]any) {
	params := fakeParams(message)
	if params["threadId"] != "thread_fake" || params["model"] != "gpt-test" {
		panic("model set used wrong params")
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
