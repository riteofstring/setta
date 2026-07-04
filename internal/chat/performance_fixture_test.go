package chat

import (
	"testing"
	"time"
)

func TestSeedPerformanceTranscriptConversationCreatesLongMixedFixture(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	seededAt := time.Date(2026, 6, 28, 20, 0, 0, 0, time.UTC)
	result, err := SeedPerformanceTranscriptConversation(store, "workspace_api", seededAt)
	if err != nil {
		t.Fatalf("seed performance transcript: %v", err)
	}
	if result.Conversation.ID != PerformanceConversationID {
		t.Fatalf("conversation id = %q, want %q", result.Conversation.ID, PerformanceConversationID)
	}
	if result.MessageCount < 500 {
		t.Fatalf("message count = %d, want long transcript", result.MessageCount)
	}
	if result.RunCount != performanceTranscriptTurnCount+1 {
		t.Fatalf("run count = %d, want fixture turns plus queued run", result.RunCount)
	}
	if result.RunItemCount != performanceTranscriptTurnCount*len(runItemTypeValues) {
		t.Fatalf("run item count = %d, want every type for every turn", result.RunItemCount)
	}

	messages, err := store.LoadMessages("workspace_api", PerformanceConversationID)
	if err != nil {
		t.Fatalf("load messages: %v", err)
	}
	assertPerformanceMessageCoverage(t, messages)

	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	page, err := service.LoadMessagePage("workspace_api", PerformanceConversationID, 0, 80)
	if err != nil {
		t.Fatalf("load performance page: %v", err)
	}
	if page.Goal == nil || page.Goal.Status != "active" {
		t.Fatalf("goal = %+v, want active", page.Goal)
	}
	if !page.HasMoreOlder || page.OlderBeforeOrdinal <= 0 {
		t.Fatalf("page cursor = %+v, want older pages", page)
	}
	if len(page.Transcript) < 20 {
		t.Fatalf("transcript length = %d, want loaded turns", len(page.Transcript))
	}
	assertUIShowcaseRunItems(t, page.RunItems, page.RunItemOutputs)
}

func TestSeedPerformanceTranscriptConversationOverwritesExistingFixture(t *testing.T) {
	store := mustStore(t, t.TempDir())
	firstSeededAt := time.Date(2026, 6, 28, 20, 0, 0, 0, time.UTC)
	secondSeededAt := firstSeededAt.Add(time.Hour)
	if _, err := SeedPerformanceTranscriptConversation(store, "workspace_api", firstSeededAt); err != nil {
		t.Fatalf("seed first performance transcript: %v", err)
	}
	if _, err := SeedPerformanceTranscriptConversation(store, "workspace_api", secondSeededAt); err != nil {
		t.Fatalf("seed second performance transcript: %v", err)
	}
	conversation, err := store.LoadConversation("workspace_api", PerformanceConversationID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if conversation.UpdatedAt != timestamp(secondSeededAt) {
		t.Fatalf("updatedAt = %q, want second seed timestamp %q", conversation.UpdatedAt, timestamp(secondSeededAt))
	}
	messages, err := store.LoadMessages("workspace_api", PerformanceConversationID)
	if err != nil {
		t.Fatalf("load messages: %v", err)
	}
	if len(messages) != expectedPerformanceMessageCount() {
		t.Fatalf("message count = %d, want deterministic count %d", len(messages), expectedPerformanceMessageCount())
	}
}

func assertPerformanceMessageCoverage(t *testing.T, messages []ChatMessage) {
	t.Helper()

	roles := map[MessageRole]bool{}
	deliveries := map[MessageDelivery]bool{}
	statuses := map[MessageStatus]bool{}
	for _, message := range messages {
		roles[message.Role] = true
		deliveries[message.Delivery] = true
		statuses[message.Status] = true
	}
	for _, role := range messageRoleValues {
		if !roles[role] {
			t.Fatalf("message roles = %+v, missing %s", roles, role)
		}
	}
	for _, delivery := range []MessageDelivery{MessageDeliveryNormal, MessageDeliveryQueued, MessageDeliverySteering} {
		if !deliveries[delivery] {
			t.Fatalf("message deliveries = %+v, missing %s", deliveries, delivery)
		}
	}
	for _, status := range messageStatusValues {
		if !statuses[status] {
			t.Fatalf("message statuses = %+v, missing %s", statuses, status)
		}
	}
}

func expectedPerformanceMessageCount() int {
	return 4 + performanceTranscriptTurnCount*2 + performanceTranscriptTurnCount/3 + 1
}
