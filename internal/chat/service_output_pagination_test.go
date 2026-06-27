package chat

import "testing"

func TestServiceLoadRunItemOutputPageDoesNotReadBeyondLimit(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "printf output",
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "one\n"},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "two\n"},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "three\n"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "activity")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", result.Run.ID, "command_fake")
	if err != nil || !exists {
		t.Fatalf("find item: exists=%v err=%v", exists, err)
	}
	page, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, item.ID, 0, 2)
	if err != nil {
		t.Fatalf("load first bounded page: %v", err)
	}
	if len(page.Output) != 2 || !page.HasMore || page.NextOrdinal != 2 {
		t.Fatalf("page = %+v, want first two outputs with next ordinal 2", page)
	}
	next, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, item.ID, page.NextOrdinal, 1)
	if err != nil {
		t.Fatalf("load next bounded page: %v", err)
	}
	if len(next.Output) != 1 || next.Output[0].Text != "three\n" || next.HasMore {
		t.Fatalf("next page = %+v, want final third output", next)
	}
}
