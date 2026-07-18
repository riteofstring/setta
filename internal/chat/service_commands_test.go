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
	if result.Message.Parts[0].Text.Text != "Goal set: finish renderer tests" {
		t.Fatalf("command text = %q, want goal set result", result.Message.Parts[0].Text.Text)
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
	blocks, err := service.store.LoadTranscriptBlocks("workspace_api", runs[0].ID)
	if err != nil {
		t.Fatalf("load goal transcript blocks: %v", err)
	}
	goalBlock := firstUserMessageBlock(blocks)
	if goalBlock == nil {
		t.Fatalf("blocks = %+v, want goal pursuit trigger block", blocks)
	}
	if goalBlock.UserMessage.Parts[0].Text.Text != "finish renderer tests" {
		t.Fatalf("goal pursuit prompt = %q, want objective", goalBlock.UserMessage.Parts[0].Text.Text)
	}
	if goalBlock.UserMessage.Delivery != MessageDeliveryGoal {
		t.Fatalf("goal trigger delivery = %s, want goal", goalBlock.UserMessage.Delivery)
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

func TestServiceGoalCommandReturnsActiveRunSnapshot(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	result, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal finish renderer tests")
	if err != nil {
		t.Fatalf("execute goal command: %v", err)
	}

	if result.ActiveRun == nil || result.ActiveRun.Status != RunStatusRunning {
		t.Fatalf("active run = %+v, want running goal run", result.ActiveRun)
	}
	if result.ActiveRun.ConversationID != conversation.ID {
		t.Fatalf("active run = %+v, want conversation %s", result.ActiveRun, conversation.ID)
	}
	trigger, ok, err := service.store.FindMessageByID("workspace_api", conversation.ID, result.ActiveRun.TriggerMessageID)
	if err != nil {
		t.Fatalf("load active run trigger message: %v", err)
	}
	if !ok || trigger.Delivery != MessageDeliveryGoal {
		t.Fatalf("active run trigger = %+v exists %v, want goal delivery", trigger, ok)
	}
	if result.ActiveRunLiveness == nil || result.ActiveRunLiveness.RunID != result.ActiveRun.ID || !result.ActiveRunLiveness.Cancellable {
		t.Fatalf("active run liveness = %+v, want cancellable liveness for %s", result.ActiveRunLiveness, result.ActiveRun.ID)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
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
		t.Fatalf("runs = %+v, want one goal operation run", runs)
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
		t.Fatalf("runs = %+v, want replacement goal operation", runs)
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
		t.Fatalf("runs = %+v, want goal operation", runs)
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
	if result.Result.ComposerDraft != "/goal finish renderer tests" {
		t.Fatalf("edit composer draft = %q, want goal objective draft", result.Result.ComposerDraft)
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

	if result.Message == nil || result.Message.Parts[0].Text.Text != "Reasoning set: High" {
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

func TestServiceLocalReasoningChangePreservesChatDefaults(t *testing.T) {
	harness := NewScriptedWorkflowHarness()
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	readOnly, ok := chatPermissionSettingsForPreset(ChatPermissionPresetReadOnly)
	if !ok {
		t.Fatal("read-only preset settings not found")
	}
	defaultReasoning := ReasoningEffortXHigh
	defaults := expectedCodexSettings{
		Model:            "scripted-careful",
		PermissionPreset: ChatPermissionPresetReadOnly,
		ReasoningEffort:  ReasoningEffortXHigh,
	}
	if _, err := service.UpdateChatCodexDefaults(context.Background(), ChatCodexSettings{
		Model:           defaults.Model,
		ReasoningEffort: &defaultReasoning,
		Permission:      &readOnly,
	}, false); err != nil {
		t.Fatalf("update chat defaults: %v", err)
	}
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	picker, err := service.OpenChatCodexModelPicker("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("open model picker: %v", err)
	}
	requireCommandSelection(t, picker, defaults)
	requireEffectivePermissionPreset(t, picker.Conversation.CodexEffectiveSettings, defaults.PermissionPreset)

	result, err := service.SetChatCodexReasoningEffort("workspace_api", conversation.ID, ReasoningEffortLow)
	if err != nil {
		t.Fatalf("set reasoning effort: %v", err)
	}
	changed := defaults
	changed.ReasoningEffort = ReasoningEffortLow
	requireCommandSelection(t, result, changed)
	requireConversationCodexSettings(t, "changed conversation", result.Conversation.CodexSettings, changed)

	nextConversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create second conversation: %v", err)
	}
	requireConversationCodexSettings(t, "second conversation", nextConversation.CodexSettings, defaults)
}

type expectedCodexSettings struct {
	Model            string
	PermissionPreset ChatPermissionPresetID
	ReasoningEffort  ReasoningEffort
}

func requireCommandSelection(t *testing.T, result ChatCommandExecuteResult, expected expectedCodexSettings) {
	t.Helper()
	if result.Result.SelectedModel != expected.Model {
		t.Fatalf("selected model = %q, want %q", result.Result.SelectedModel, expected.Model)
	}
	if result.Result.SelectedReasoningEffort == nil {
		t.Fatalf("selected reasoning effort = nil, want %s", expected.ReasoningEffort)
	}
	if *result.Result.SelectedReasoningEffort != expected.ReasoningEffort {
		t.Fatalf("selected reasoning effort = %s, want %s", *result.Result.SelectedReasoningEffort, expected.ReasoningEffort)
	}
}

func requireEffectivePermissionPreset(t *testing.T, settings *ChatCodexEffectiveSettings, expected ChatPermissionPresetID) {
	t.Helper()
	if settings == nil || settings.Permission == nil || settings.Permission.Preset == nil {
		t.Fatalf("effective settings = %+v, want permission preset %s", settings, expected)
	}
	if *settings.Permission.Preset != expected {
		t.Fatalf("effective permission preset = %s, want %s", *settings.Permission.Preset, expected)
	}
}

func requireConversationCodexSettings(t *testing.T, label string, settings *ChatCodexSettings, expected expectedCodexSettings) {
	t.Helper()
	if settings == nil {
		t.Fatalf("%s settings = nil, want %+v", label, expected)
	}
	if settings.Model != expected.Model {
		t.Fatalf("%s model = %q, want %q", label, settings.Model, expected.Model)
	}
	requireConversationReasoning(t, label, settings.ReasoningEffort, expected.ReasoningEffort)
	requireConversationPermission(t, label, settings.Permission, expected.PermissionPreset)
}

func requireConversationReasoning(t *testing.T, label string, actual *ReasoningEffort, expected ReasoningEffort) {
	t.Helper()
	if actual == nil {
		t.Fatalf("%s reasoning = nil, want %s", label, expected)
	}
	if *actual != expected {
		t.Fatalf("%s reasoning = %s, want %s", label, *actual, expected)
	}
}

func requireConversationPermission(t *testing.T, label string, actual *ChatCodexPermissionSettings, expected ChatPermissionPresetID) {
	t.Helper()
	if actual == nil {
		t.Fatalf("%s permission = nil, want %s", label, expected)
	}
	if actual.Preset != expected {
		t.Fatalf("%s permission preset = %s, want %s", label, actual.Preset, expected)
	}
}

func TestServiceStoresPermissionSettingsWithoutCreatingThread(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	result, err := service.SetChatCodexPermissionPreset("workspace_api", conversation.ID, ChatPermissionPresetReadOnly, false)
	if err != nil {
		t.Fatalf("set read-only permission: %v", err)
	}

	if result.Message == nil || result.Message.Parts[0].Text.Text != "Permission mode set: Read Only" {
		t.Fatalf("command message = %+v, want permission set result", result.Message)
	}
	if result.Conversation.CodexSettings == nil || result.Conversation.CodexSettings.Permission == nil {
		t.Fatalf("result codex settings = %+v, want permission settings", result.Conversation.CodexSettings)
	}
	if permission := result.Conversation.CodexSettings.Permission; permission.Preset != ChatPermissionPresetReadOnly || permission.ApprovalPolicy != codexApprovalPolicyNever || permission.Permissions != codexPermissionProfileReadOnly {
		t.Fatalf("result permission settings = %+v, want read-only preset", permission)
	}
	loaded, err := service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if len(loaded.HarnessRefs) != 0 {
		t.Fatalf("harness refs = %+v, want no thread ref for local permission setting", loaded.HarnessRefs)
	}
	if loaded.CodexSettings == nil || loaded.CodexSettings.Permission == nil {
		t.Fatalf("stored codex settings = %+v, want permission settings", loaded.CodexSettings)
	}
	if permission := loaded.CodexSettings.Permission; permission.Preset != ChatPermissionPresetReadOnly || permission.Permissions != codexPermissionProfileReadOnly {
		t.Fatalf("stored permission settings = %+v, want read-only preset", permission)
	}
}

func TestServiceStoresTypedCodexModelWithoutParsingSlashCommand(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	result, err := service.SetChatCodexModel("workspace_api", conversation.ID, "scripted-careful")
	if err != nil {
		t.Fatalf("set codex model: %v", err)
	}

	if result.Message == nil || result.Message.Parts[0].Text.Text != "Model set: scripted-careful" {
		t.Fatalf("command message = %+v, want model set result", result.Message)
	}
	if result.Conversation.CodexSettings == nil || result.Conversation.CodexSettings.Model != "scripted-careful" {
		t.Fatalf("result conversation codex settings = %+v, want scripted-careful", result.Conversation.CodexSettings)
	}
	requests := harness.CommandRequests()
	if len(requests) != 1 || requests[0].Command.Model == nil || requests[0].Command.Model.ModelID != "scripted-careful" {
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

	result, err := service.OpenChatCodexModelPicker("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("open model picker: %v", err)
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
	started, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("active"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	result, err := service.ExecuteChatCommand("workspace_api", conversation.ID, "/goal pause")
	if err != nil {
		t.Fatalf("execute active goal command: %v", err)
	}
	if result.Message == nil || result.Message.Parts[0].Text.Text != "Goal paused." {
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
	if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("/goal")); err == nil {
		t.Fatal("send slash command succeeded, want error")
	} else if commandErr, ok := IsChatCommandError(err); !ok || commandErr.Code != ChatCommandErrorWrongEndpoint {
		t.Fatalf("send slash error = %#v, want wrong endpoint", err)
	}
	if _, err := service.QueueUserInput("workspace_api", conversation.ID, TextChatInput("/unknown")); err == nil {
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
	assertCommandAvailable(t, idle.Commands, ChatSlashCommandGoal, true)
	if len(idle.Commands) != 1 {
		t.Fatalf("idle commands = %+v, want /goal only", idle.Commands)
	}

	if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("active")); err != nil {
		t.Fatalf("send active: %v", err)
	}
	active, err := service.ListCommands("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("list active commands: %v", err)
	}
	assertCommandAvailable(t, active.Commands, ChatSlashCommandGoal, true)
	if len(active.Commands) != 1 {
		t.Fatalf("active commands = %+v, want /goal only", active.Commands)
	}
}

func assertCommandAvailable(t *testing.T, commands []ChatCommandDescriptor, kind ChatSlashCommandKind, available bool) {
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
