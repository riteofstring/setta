package chat

import (
	"testing"
	"time"
)

func TestSeedUIShowcaseConversationCreatesReloadableFixture(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	seededAt := time.Date(2026, 6, 2, 20, 0, 0, 0, time.UTC)
	result, err := SeedUIShowcaseConversation(store, "workspace_api", seededAt)
	if err != nil {
		t.Fatalf("seed UI showcase: %v", err)
	}
	if result.Conversation.ID != UIShowcaseConversationID {
		t.Fatalf("conversation id = %q, want %q", result.Conversation.ID, UIShowcaseConversationID)
	}
	if len(result.RunIDs) != len(uiShowcaseRunIDs) {
		t.Fatalf("run ids = %v, want all showcase runs", result.RunIDs)
	}

	run, ok, err := store.ActiveRun("workspace_api", UIShowcaseConversationID)
	if err != nil {
		t.Fatalf("active run from store: %v", err)
	}
	if !ok || run.PendingApproval == nil || run.PendingApproval.Kind != ApprovalKindUserInput {
		t.Fatalf("stored active run = %+v, want pending user-input approval", run)
	}
	if run.PendingApproval.ID != uiShowcaseUserInputApprovalID {
		t.Fatalf("approval id = %q, want %q", run.PendingApproval.ID, uiShowcaseUserInputApprovalID)
	}

	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	page, err := service.LoadMessagePage("workspace_api", UIShowcaseConversationID, 0, 40)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if page.Goal == nil || page.Goal.Status != "active" {
		t.Fatalf("goal = %+v, want active goal", page.Goal)
	}
	showcaseRun, err := store.LoadRun("workspace_api", uiShowcaseUserInputRunID)
	if err != nil {
		t.Fatalf("load user-input run after service startup: %v", err)
	}
	if showcaseRun.Status != RunStatusRunning || showcaseRun.PendingApproval == nil || showcaseRun.PendingApproval.Kind != ApprovalKindUserInput {
		t.Fatalf("showcase run after service startup = %+v, want running run with pending user-input approval", showcaseRun)
	}
	assertUIShowcaseMessages(t, page.Messages)
	runItems, err := store.LoadRunItems("workspace_api", uiShowcaseCompletedRunID)
	if err != nil {
		t.Fatalf("load showcase run items: %v", err)
	}
	outputs, err := store.LoadRunItemOutputs("workspace_api", uiShowcaseCompletedRunID)
	if err != nil {
		t.Fatalf("load showcase run item outputs: %v", err)
	}
	assertUIShowcaseRunItems(t, runItems, outputs)
}

func TestSeedUIShowcaseConversationOverwritesExistingFixture(t *testing.T) {
	store := mustStore(t, t.TempDir())
	firstSeededAt := time.Date(2026, 6, 2, 20, 0, 0, 0, time.UTC)
	secondSeededAt := firstSeededAt.Add(time.Hour)
	if _, err := SeedUIShowcaseConversation(store, "workspace_api", firstSeededAt); err != nil {
		t.Fatalf("seed first showcase: %v", err)
	}
	if _, err := SeedUIShowcaseConversation(store, "workspace_api", secondSeededAt); err != nil {
		t.Fatalf("seed second showcase: %v", err)
	}
	conversation, err := store.LoadConversation("workspace_api", UIShowcaseConversationID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if conversation.UpdatedAt != timestamp(secondSeededAt) {
		t.Fatalf("updatedAt = %q, want second seed timestamp %q", conversation.UpdatedAt, timestamp(secondSeededAt))
	}
	messages, err := store.LoadMessages("workspace_api", UIShowcaseConversationID)
	if err != nil {
		t.Fatalf("load messages: %v", err)
	}
	if len(messages) != len(uiShowcaseMessages(secondSeededAt)) {
		t.Fatalf("message count = %d, want deterministic count", len(messages))
	}
}

func assertUIShowcaseMessages(t *testing.T, messages []ChatMessage) {
	t.Helper()

	roles := map[MessageRole]bool{}
	deliveries := map[MessageDelivery]bool{}
	statuses := map[MessageStatus]bool{}
	for _, message := range messages {
		roles[message.Role] = true
		deliveries[message.Delivery] = true
		statuses[message.Status] = true
	}
	for _, role := range []MessageRole{RoleAssistant, RoleCommand, RoleDeveloper, RoleSystem, RoleTool, RoleUser} {
		if !roles[role] {
			t.Fatalf("message roles = %+v, missing %s", roles, role)
		}
	}
	for _, delivery := range []MessageDelivery{MessageDeliveryNormal, MessageDeliveryQueued, MessageDeliverySteering} {
		if !deliveries[delivery] {
			t.Fatalf("message deliveries = %+v, missing %s", deliveries, delivery)
		}
	}
	for _, status := range []MessageStatus{MessageStatusCancelled, MessageStatusComplete, MessageStatusError, MessageStatusPending, MessageStatusStreaming} {
		if !statuses[status] {
			t.Fatalf("message statuses = %+v, missing %s", statuses, status)
		}
	}
}

func assertUIShowcaseRunItems(t *testing.T, items []RunItem, outputs []RunItemOutput) {
	t.Helper()

	itemsByType := map[RunItemType]RunItem{}
	for _, item := range items {
		itemsByType[item.Type] = item
	}
	for _, itemType := range runItemTypeValues {
		item, ok := itemsByType[itemType]
		if !ok {
			t.Fatalf("run item types = %+v, missing %s", itemsByType, itemType)
		}
		if item.ProviderItemID == "" || runActivityTitle(item) == "" {
			t.Fatalf("showcase item %s is incomplete: %+v", itemType, item)
		}
	}
	outputsByRunItemID := map[string]bool{}
	for _, output := range outputs {
		outputsByRunItemID[output.RunItemID] = true
	}
	for _, item := range items {
		if !outputsByRunItemID[item.ID] {
			t.Fatalf("missing output preview for item %+v", item)
		}
	}
}
