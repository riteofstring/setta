package chat

import "testing"

func TestServicePersistsReadMarkersAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	resolver := testResolver(t)
	service := newTestService(t, appDataDir, resolver, NewFakeHarness(nil))

	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "read markers")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	unread := listConversationItem(t, service, "workspace_api", conversation.ID)
	if unread.LatestReadRelevantMarker <= unread.ReadMarker {
		t.Fatalf("markers = read %d latest %d, want unread", unread.ReadMarker, unread.LatestReadRelevantMarker)
	}

	read, err := service.MarkConversationRead("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("mark conversation read: %v", err)
	}
	if read.ReadMarker != unread.LatestReadRelevantMarker {
		t.Fatalf("read marker = %d, want latest marker %d", read.ReadMarker, unread.LatestReadRelevantMarker)
	}
	if read.LatestReadRelevantMarker != unread.LatestReadRelevantMarker {
		t.Fatalf("latest marker = %d, want unchanged %d", read.LatestReadRelevantMarker, unread.LatestReadRelevantMarker)
	}

	again, err := service.MarkConversationRead("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("mark conversation read again: %v", err)
	}
	if again.ReadMarker != read.ReadMarker || again.LatestReadRelevantMarker != read.LatestReadRelevantMarker {
		t.Fatalf("idempotent markers = read %d latest %d, want read %d latest %d", again.ReadMarker, again.LatestReadRelevantMarker, read.ReadMarker, read.LatestReadRelevantMarker)
	}

	restarted := newTestService(t, appDataDir, resolver, NewFakeHarness(nil))
	persisted := listConversationItem(t, restarted, "workspace_api", conversation.ID)
	if persisted.ReadMarker != read.ReadMarker || persisted.LatestReadRelevantMarker != read.LatestReadRelevantMarker {
		t.Fatalf("persisted markers = read %d latest %d, want read %d latest %d", persisted.ReadMarker, persisted.LatestReadRelevantMarker, read.ReadMarker, read.LatestReadRelevantMarker)
	}

	second, err := restarted.SendUserMessage("workspace_api", conversation.ID, "read markers again")
	if err != nil {
		t.Fatalf("send second message: %v", err)
	}
	waitForRunStatus(t, restarted, "workspace_api", conversation.ID, second.Run.ID, RunStatusCompleted)

	advanced := listConversationItem(t, restarted, "workspace_api", conversation.ID)
	if advanced.ReadMarker != persisted.ReadMarker {
		t.Fatalf("read marker = %d, want unchanged %d after new output", advanced.ReadMarker, persisted.ReadMarker)
	}
	if advanced.LatestReadRelevantMarker <= persisted.LatestReadRelevantMarker {
		t.Fatalf("latest marker = %d, want greater than %d", advanced.LatestReadRelevantMarker, persisted.LatestReadRelevantMarker)
	}
}

func listConversationItem(t *testing.T, service *Service, workspaceID string, conversationID string) ConversationListItem {
	t.Helper()

	list, err := service.ListConversations(workspaceID)
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	for _, item := range list.Conversations {
		if item.Conversation.ID == conversationID {
			return item
		}
	}
	t.Fatalf("conversation %s not found in %+v", conversationID, list.Conversations)
	return ConversationListItem{}
}
