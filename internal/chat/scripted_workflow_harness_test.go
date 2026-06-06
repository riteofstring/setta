package chat

import "testing"

func TestScriptedWorkflowHarnessUIShowcaseEmitsEveryRunItemType(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewScriptedWorkflowHarness())
	conversation, err := service.CreateConversation("workspace_api", "showcase")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "ui showcase workflow")
	if err != nil {
		t.Fatalf("send showcase prompt: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 40)
	if err != nil {
		t.Fatalf("load showcase page: %v", err)
	}
	itemsByType := map[RunItemType]RunItem{}
	for _, item := range page.RunItems {
		itemsByType[item.Type] = item
	}
	for _, itemType := range runItemTypeValues {
		item, ok := itemsByType[itemType]
		if !ok {
			t.Fatalf("run item types = %+v, missing %s", itemsByType, itemType)
		}
		if item.ProviderItemID == "" || item.Title == "" {
			t.Fatalf("showcase item %s is incomplete: %+v", itemType, item)
		}
	}
	if len(page.RunItemOutputs) < len(runItemTypeValues) {
		t.Fatalf("run item outputs = %d, want at least %d", len(page.RunItemOutputs), len(runItemTypeValues))
	}
}
