package chat

import "testing"

func TestServicePersistsFinalAggregatedCommandOutput(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewCodexHarness(testCodexConfig("command-final-output")))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("run final output command"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	item := requireCommandOutputRunItem(t, service, result.Run.ID)
	details, ok := item.CommandExecutionDetails()
	if !ok {
		t.Fatalf("command details = %+v, want command execution details", item.Details)
	}
	if details.OutputAvailability != RunItemOutputAvailabilityCaptured {
		t.Fatalf("outputAvailability = %s, want captured", details.OutputAvailability)
	}
	if details.Result != "final-only output\n" {
		t.Fatalf("result = %q, want final output", details.Result)
	}
	page, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, item.ID, 0, 20)
	if err != nil {
		t.Fatalf("load output: %v", err)
	}
	if len(page.Output) != 1 {
		t.Fatalf("output count = %d, want 1", len(page.Output))
	}
	if page.Output[0].Stream != codexCommandExecutionOutputStream || page.Output[0].Text != "final-only output\n" {
		t.Fatalf("output = %+v, want final output artifact", page.Output[0])
	}

	activity, err := service.LoadRunActivityPage("workspace_api", result.Run.ID, "", 20)
	if err != nil {
		t.Fatalf("load activity: %v", err)
	}
	if len(activity.Activity) != 1 || !activity.Activity[0].HasOutput {
		t.Fatalf("activity = %+v, want command with output", activity.Activity)
	}
}

func TestServicePersistsExplicitCommandOutputAvailabilityStates(t *testing.T) {
	tests := []struct {
		name string
		mode string
		want RunItemOutputAvailability
	}{
		{name: "empty", mode: "command-empty-output", want: RunItemOutputAvailabilityEmpty},
		{name: "unavailable", mode: "command-unavailable-output", want: RunItemOutputAvailabilityUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := newTestService(t, t.TempDir(), testResolver(t), NewCodexHarness(testCodexConfig(tt.mode)))
			conversation, err := service.CreateConversation("workspace_api", "")
			if err != nil {
				t.Fatalf("create conversation: %v", err)
			}
			result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("run command"))
			if err != nil {
				t.Fatalf("send message: %v", err)
			}
			waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

			item := requireCommandOutputRunItem(t, service, result.Run.ID)
			details, ok := item.CommandExecutionDetails()
			if !ok {
				t.Fatalf("command details = %+v, want command execution details", item.Details)
			}
			if details.OutputAvailability != tt.want {
				t.Fatalf("outputAvailability = %s, want %s", details.OutputAvailability, tt.want)
			}
			page, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, item.ID, 0, 20)
			if err != nil {
				t.Fatalf("load output: %v", err)
			}
			if len(page.Output) != 0 {
				t.Fatalf("output = %+v, want no output artifact", page.Output)
			}
		})
	}
}

func TestServiceMarksStreamedCommandOutputCaptured(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Details:        NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: "printf streamed"}),
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "streamed output\n"},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("run streamed command"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", result.Run.ID, "command_fake")
	if err != nil {
		t.Fatalf("find command item: %v", err)
	}
	if !exists {
		t.Fatal("command item missing")
	}
	details, ok := item.CommandExecutionDetails()
	if !ok {
		t.Fatalf("command details = %+v, want command execution details", item.Details)
	}
	if details.OutputAvailability != RunItemOutputAvailabilityCaptured {
		t.Fatalf("outputAvailability = %s, want captured", details.OutputAvailability)
	}
}

func requireCommandOutputRunItem(t *testing.T, service *Service, runID string) RunItem {
	t.Helper()
	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", runID, "command_final_output_fake")
	if err != nil {
		t.Fatalf("find command item: %v", err)
	}
	if !exists {
		t.Fatal("command item missing")
	}
	return item
}
