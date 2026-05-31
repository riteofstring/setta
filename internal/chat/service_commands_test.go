package chat

import "testing"

func TestServiceExecutesGoalCommandWithoutCreatingRun(t *testing.T) {
	harness := NewFakeHarness(nil)
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
	if len(result.Page.Transcript) != 0 {
		t.Fatalf("transcript = %+v, want no model turns", result.Page.Transcript)
	}
	runs, err := service.ListRuns("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("runs = %+v, want no run for command", runs)
	}
	loaded, err := service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if ref := latestHarnessRef(loaded, HarnessCodex); ref.ThreadID != "fake-thread-"+conversation.ID || ref.Status != HarnessRefLinked {
		t.Fatalf("harness ref = %+v, want linked fake command thread", ref)
	}
}

func TestServiceExecutesActiveGoalCommandWithoutSteering(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
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
