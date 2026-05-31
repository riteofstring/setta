package chat

import (
	"context"
	"testing"
	"time"
)

func TestServiceExecutesGoalCommandAndStartsPursuit(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventAssistantDelta, Text: "pursuing goal"}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	result, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests")
	if err != nil {
		t.Fatalf("execute goal command: %v", err)
	}

	if result.Message == nil || result.Message.Role != RoleCommand {
		t.Fatalf("command message = %+v, want command role", result.Message)
	}
	if result.Message.Parts[0].Text != "Goal set: finish renderer tests" {
		t.Fatalf("command text = %q, want goal set result", result.Message.Parts[0].Text)
	}
	if len(result.Page.Transcript) != 1 {
		t.Fatalf("transcript = %+v, want goal pursuit turn", result.Page.Transcript)
	}
	if result.Page.Transcript[0].TriggerMessage.Parts[0].Text != "finish renderer tests" {
		t.Fatalf("goal pursuit prompt = %q, want objective", result.Page.Transcript[0].TriggerMessage.Parts[0].Text)
	}
	if result.Page.Transcript[0].TriggerMessage.Delivery != MessageDeliveryGoal {
		t.Fatalf("goal trigger delivery = %s, want goal", result.Page.Transcript[0].TriggerMessage.Delivery)
	}
	if result.Page.Goal == nil || result.Page.Goal.Status != "active" || result.Page.Goal.Objective != "finish renderer tests" {
		t.Fatalf("page goal = %+v, want active renderer goal", result.Page.Goal)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one run for goal pursuit", runs)
	}
	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	if run.PromptSummary != "finish renderer tests" {
		t.Fatalf("run prompt summary = %q, want objective", run.PromptSummary)
	}
	loaded, err := service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if ref := latestHarnessRef(loaded, HarnessCodex); ref.ThreadID != "fake-thread-"+conversation.ID || ref.Status != HarnessRefLinked {
		t.Fatalf("harness ref = %+v, want linked fake command thread", ref)
	}
}

func TestServicePersistsGoalCompletionNotification(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{
		Type: FakeEventGoalUpdated,
		Goal: &ChatGoalState{
			Objective: "finish renderer tests",
			Status:    "complete",
			ThreadID:  "fake-thread-conversation_0001",
		},
	}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	_, err = service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests")
	if err != nil {
		t.Fatalf("execute goal command: %v", err)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one goal continuation run", runs)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
	page := waitForGoalStatus(t, service, "workspace_api", conversation.ID, "complete")
	if page.Goal == nil || page.Goal.Objective != "finish renderer tests" {
		t.Fatalf("completed page goal = %+v, want completed renderer goal", page.Goal)
	}
}

func TestServiceRequiresConfirmationBeforeReplacingActiveGoal(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if err := service.store.SaveGoal("workspace_api", conversation.ID, ChatGoalState{
		Objective: "existing goal",
		Status:    "active",
		ThreadID:  "thread_fake",
	}); err != nil {
		t.Fatalf("save goal: %v", err)
	}

	_, err = service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal replacement goal")
	if err == nil {
		t.Fatal("replace goal succeeded without confirmation")
	}
	commandErr, ok := IsChatCommandError(err)
	if !ok || commandErr.Code != ChatCommandErrorGoalReplaceConfirm {
		t.Fatalf("replace goal error = %#v, want replacement confirmation", err)
	}

	result, err := service.ExecuteChatCommandWithOptions("workspace_api", conversation.ID, "/goal replacement goal", ChatCommandExecutionOptions{
		ConfirmGoalReplacement: true,
	})
	if err != nil {
		t.Fatalf("replace goal with confirmation: %v", err)
	}
	if result.Page.Goal == nil || result.Page.Goal.Objective != "replacement goal" {
		t.Fatalf("page goal = %+v, want replacement goal", result.Page.Goal)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want replacement goal continuation", runs)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)
}

func TestServiceGoalEditOpensEditorWithoutCommandMessage(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests"); err != nil {
		t.Fatalf("set goal: %v", err)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want goal continuation", runs)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, runs[0].ID, RunStatusCompleted)

	result, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal edit")
	if err != nil {
		t.Fatalf("edit goal: %v", err)
	}
	if result.Result.Action != ChatCommandResultGoalEditor {
		t.Fatalf("result action = %s, want goal editor", result.Result.Action)
	}
	if result.Message != nil {
		t.Fatalf("edit command message = %+v, want no persisted command message", result.Message)
	}
	if result.Result.Goal == nil || result.Result.Goal.Objective != "finish renderer tests" {
		t.Fatalf("edit result goal = %+v, want existing goal", result.Result.Goal)
	}
}

func TestServiceGoalStatusCommandsRequireExistingGoal(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	for _, raw := range []string{"/goal pause", "/goal resume", "/goal clear"} {
		_, err := service.ExecuteChatCommand("workspace_api", conversation.ID, raw)
		if err == nil {
			t.Fatalf("%s succeeded without goal", raw)
		}
		commandErr, ok := IsChatCommandError(err)
		if !ok || commandErr.Code != ChatCommandErrorGoalNotSet {
			t.Fatalf("%s error = %#v, want no-goal command error", raw, err)
		}
	}
}

func TestServiceStoresModelSettingsWithoutCreatingThread(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	result, err := service.SetChatCodexReasoningEffort("workspace_api", conversation.ID, ReasoningEffortHigh)
	if err != nil {
		t.Fatalf("set reasoning effort: %v", err)
	}

	if result.Message == nil || result.Message.Parts[0].Text != "Reasoning set: High" {
		t.Fatalf("command message = %+v, want reasoning set result", result.Message)
	}
	if result.Conversation.CodexSettings == nil || result.Conversation.CodexSettings.ReasoningEffort == nil || *result.Conversation.CodexSettings.ReasoningEffort != ReasoningEffortHigh {
		t.Fatalf("result conversation codex settings = %+v, want high reasoning", result.Conversation.CodexSettings)
	}
	loaded, err := service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if len(loaded.HarnessRefs) != 0 {
		t.Fatalf("harness refs = %+v, want no thread ref for local model setting", loaded.HarnessRefs)
	}
	if loaded.CodexSettings == nil || loaded.CodexSettings.ReasoningEffort == nil || *loaded.CodexSettings.ReasoningEffort != ReasoningEffortHigh {
		t.Fatalf("stored codex settings = %+v, want high reasoning", loaded.CodexSettings)
	}
}

func TestServiceStoresTypedCodexModelWithoutParsingSlashCommand(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	result, err := service.SetChatCodexModel("workspace_api", conversation.ID, "gpt-test")
	if err != nil {
		t.Fatalf("set codex model: %v", err)
	}

	if result.Message == nil || result.Message.Parts[0].Text != "Model set: gpt-test" {
		t.Fatalf("command message = %+v, want model set result", result.Message)
	}
	if result.Conversation.CodexSettings == nil || result.Conversation.CodexSettings.Model != "gpt-test" {
		t.Fatalf("result conversation codex settings = %+v, want gpt-test", result.Conversation.CodexSettings)
	}
	requests := harness.CommandRequests()
	if len(requests) != 1 || requests[0].Command.Model == nil || requests[0].Command.Model.ModelID != "gpt-test" {
		t.Fatalf("command requests = %+v, want typed model set request", requests)
	}
}

func waitForGoalStatus(t *testing.T, service *Service, workspaceID string, conversationID string, status string) MessagePage {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page, err := service.LoadMessagePage(workspaceID, conversationID, 0, 20)
		if err != nil {
			t.Fatalf("load page: %v", err)
		}
		if page.Goal != nil && page.Goal.Status == status {
			return page
		}
		time.Sleep(10 * time.Millisecond)
	}
	page, err := service.LoadMessagePage(workspaceID, conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load final page: %v", err)
	}
	t.Fatalf("goal status = %+v, want %s", page.Goal, status)
	return MessagePage{}
}

func TestServiceRetriesModelCommandAfterMissingThreadRef(t *testing.T) {
	harness := &refUnavailableCommandHarness{FakeHarness: NewFakeHarness(nil)}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	conversation.HarnessRefs = []HarnessThreadRef{{
		Harness:       HarnessCodex,
		ThreadID:      "bad-thread",
		Status:        HarnessRefLinked,
		CreatedAt:     conversation.CreatedAt,
		LastResumedAt: conversation.UpdatedAt,
	}}
	if err := service.store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}

	result, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/model")
	if err != nil {
		t.Fatalf("execute model command: %v", err)
	}

	if result.Result.Action != ChatCommandResultModelPicker {
		t.Fatalf("result = %+v, want model picker after retry", result.Result)
	}
	if harness.calls != 2 {
		t.Fatalf("command calls = %d, want one retry", harness.calls)
	}
	loaded, err := service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	ref := latestHarnessRef(loaded, HarnessCodex)
	if ref.Status != HarnessRefMissing || ref.ThreadID != "bad-thread" {
		t.Fatalf("harness ref = %+v, want missing bad thread", ref)
	}
}

func TestServiceExecutesActiveGoalCommandWithoutSteering(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventGoalUpdated, Goal: &ChatGoalState{Objective: "active goal", Status: "active", ThreadID: "thread_fake"}},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	started, err := service.SendUserMessage("workspace_api", conversation.ID, "active")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	result, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal pause")
	if err != nil {
		t.Fatalf("execute active goal command: %v", err)
	}
	if result.Message == nil || result.Message.Parts[0].Text != "Goal paused." {
		t.Fatalf("command message = %+v, want goal paused", result.Message)
	}
	if steering := harness.SteeringRequests(); len(steering) != 0 {
		t.Fatalf("steering requests = %+v, want none for slash command", steering)
	}
	commands := harness.CommandRequests()
	if len(commands) != 1 || commands[0].ActiveRun == nil || commands[0].ActiveRun.ID != started.Run.ID {
		t.Fatalf("command requests = %+v, want active run command", commands)
	}
}

type refUnavailableCommandHarness struct {
	*FakeHarness
	calls int
}

func (harness *refUnavailableCommandHarness) ExecuteCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	harness.calls++
	if harness.calls == 1 {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "resume codex thread bad-thread: no rollout found", &HarnessRefUnavailableError{
			Harness:  HarnessCodex,
			ThreadID: request.ThreadRef.ThreadID,
			Message:  "resume codex thread bad-thread: no rollout found",
		})
	}
	return harness.FakeHarness.ExecuteCommand(ctx, request)
}

func TestServiceRejectsSlashCommandThroughMessageEndpoints(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "/goal"); err == nil {
		t.Fatal("send slash command succeeded, want error")
	} else if commandErr, ok := IsChatCommandError(err); !ok || commandErr.Code != ChatCommandErrorWrongEndpoint {
		t.Fatalf("send slash error = %#v, want wrong endpoint", err)
	}
	if _, err := service.QueueUserMessage("workspace_api", conversation.ID, "/unknown"); err == nil {
		t.Fatal("queue unknown slash command succeeded, want error")
	} else if commandErr, ok := IsChatCommandError(err); !ok || commandErr.Code != ChatCommandErrorUnknownCommand {
		t.Fatalf("queue slash error = %#v, want unknown command", err)
	}
}

func TestServiceListsCommandAvailability(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	idle, err := service.ListCommands("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list idle commands: %v", err)
	}
	assertCommandAvailable(t, idle.Commands, ChatCommandModel, true)

	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "active"); err != nil {
		t.Fatalf("send active: %v", err)
	}
	active, err := service.ListCommands("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list active commands: %v", err)
	}
	assertCommandAvailable(t, active.Commands, ChatCommandGoal, true)
	assertCommandAvailable(t, active.Commands, ChatCommandModel, false)
}

func assertCommandAvailable(t *testing.T, commands []ChatCommandCapability, kind ChatCommandKind, available bool) {
	t.Helper()
	for _, command := range commands {
		if command.Kind == kind {
			if command.Available != available {
				t.Fatalf("command %s availability = %v, want %v", kind, command.Available, available)
			}
			return
		}
	}
	t.Fatalf("command %s was not listed in %+v", kind, commands)
}
