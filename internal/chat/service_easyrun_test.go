package chat

import "testing"

func TestServiceRoutesEasyRunThroughSharedHarnessTask(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	result, err := service.SendEasyRunTurn("workspace_api", EasyRunTurnRequest{
		EasyRunID: "easy_run_shared_task",
		Prompt:    "easy run shared task",
	})
	if err != nil {
		t.Fatalf("send easy-run turn: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", result.Conversation.ID, result.Run.ID, RunStatusCompleted)

	tasks := harness.TaskRequests()
	if len(tasks) != 1 {
		t.Fatalf("harness tasks = %+v, want one task", tasks)
	}
	if tasks[0].Surface != HarnessSurfaceEasyRun ||
		tasks[0].TurnMode != HarnessTurnInteractiveConversation ||
		tasks[0].OutputContract.Kind != HarnessOutputFreeTextEvents {
		t.Fatalf("easy-run harness task = %+v, want interactive free-text easy-run", tasks[0])
	}
	if !result.Conversation.Internal || result.Conversation.EasyRun == nil || result.Conversation.EasyRun.EasyRunID != "easy_run_shared_task" || result.Conversation.Workflow != nil {
		t.Fatalf("easy-run conversation = %+v, want internal easy-run owner only", result.Conversation)
	}
	if result.Conversation.CodexSettings == nil ||
		result.Conversation.CodexSettings.Permission == nil ||
		result.Conversation.CodexSettings.Permission.Preset != ChatPermissionPresetFullAccess {
		t.Fatalf("easy-run codex settings = %+v, want full-access preset", result.Conversation.CodexSettings)
	}
	publicList, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list public conversations: %v", err)
	}
	if len(publicList.Conversations) != 0 {
		t.Fatalf("public conversations = %+v, want hidden easy-run conversation omitted", publicList.Conversations)
	}
}
