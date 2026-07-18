package chat

import "testing"

func TestServiceUpdatesTypedApprovalRunItemWhenSubmitted(t *testing.T) {
	approval := ApprovalRequest{
		ID:             "approval_fake",
		Kind:           ApprovalKindCommand,
		Title:          "Run command",
		Command:        "go test ./...",
		ProviderItemID: "approval_item_fake",
		Options:        []string{},
	}
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: approval.ProviderItemID, RunItem: approvalRequestRunItem(approval)},
		{Type: FakeEventApproval, Approval: approval, WaitForApproval: true},
		{Type: FakeEventAssistantDelta, Text: "approved"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("needs approval"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)

	if _, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", result.Run.ID, approval.ProviderItemID)
	if err != nil || !exists {
		t.Fatalf("find approval run item: exists=%v err=%v", exists, err)
	}
	details, ok := item.ApprovalDetails()
	if !ok || details.ApprovalStatus == nil {
		t.Fatalf("approval details = %+v ok=%v, want typed approval status", details, ok)
	}
	if item.Status != RunItemStatusCompleted || *details.ApprovalStatus != ApprovalStatusApproved {
		t.Fatalf("approval item status = %s detail = %s, want completed/approved", item.Status, *details.ApprovalStatus)
	}
}
