package conversation

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestDurableForkAndActiveSideRemainIsolatedFromParentTrajectory(t *testing.T) {
	service, runtime := newConversationServiceTestFixture(t)
	ctx := context.Background()
	parent := createServiceTestConversation(t, service, "Parent topic")
	parentEvents, err := service.SubscribeEvents(parent.EventCursor, parent.Conversation.WorkspaceID, parent.Conversation.ID)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	defer parentEvents.Unsubscribe()
	if _, err := service.Send(ctx, SendConversationInputRequest{
		WorkspaceID: "workspace_test", ConversationID: parent.Conversation.ID,
		Input: AuthoredInput{Text: "Complete the parent work"},
	}); err != nil {
		t.Fatalf("Send parent: %v", err)
	}
	runtime.waitStarted(t, parent.Conversation.ID)
	waitConversationIdleEvent(t, parentEvents.Events())
	completed, err := service.ReadSnapshot(ctx, "workspace_test", parent.Conversation.ID)
	if err != nil {
		t.Fatalf("Read completed parent: %v", err)
	}
	sourceTurn := completed.Turns.Turns[len(completed.Turns.Turns)-1]
	fork, err := service.Fork(ctx, ForkConversationRequest{
		WorkspaceID: "workspace_test", ParentConversationID: parent.Conversation.ID,
		ForkedAtTurnID: sourceTurn.ID,
	})
	if err != nil {
		t.Fatalf("Fork: %v", err)
	}
	if fork.Branch == nil || fork.Branch.ParentConversationID != parent.Conversation.ID || fork.ThreadBinding.ThreadID == completed.ThreadBinding.ThreadID {
		t.Fatalf("fork snapshot = %+v", fork)
	}
	matches, err := service.store.SearchTopicIndex(ctx, "Fork", nil, 10)
	if err != nil || len(matches) != 1 || matches[0].Document.ConversationID != fork.Conversation.ID {
		t.Fatalf("fork index matches = %+v, %v", matches, err)
	}

	_, err = service.Send(ctx, SendConversationInputRequest{
		WorkspaceID: "workspace_test", ConversationID: parent.Conversation.ID,
		Input: AuthoredInput{Text: "hold active parent"},
	})
	if err != nil {
		t.Fatalf("Send active parent: %v", err)
	}
	runtime.waitStarted(t, parent.Conversation.ID)
	working, err := service.ReadSnapshot(ctx, "workspace_test", parent.Conversation.ID)
	if err != nil {
		t.Fatalf("Read active parent: %v", err)
	}
	parentSequence := working.Conversation.LastTrajectorySequence
	side, err := service.CreateSide(ctx, CreateSideConversationRequest{
		WorkspaceID: "workspace_test", ParentConversationID: parent.Conversation.ID,
		ParentPaneID: "pane_parent", Input: AuthoredInput{Text: "Answer the isolated question"},
	})
	if err != nil {
		t.Fatalf("CreateSide: %v", err)
	}
	runtime.waitCompleted(t, "side_"+side.ID)
	afterSide, err := service.ReadSnapshot(ctx, "workspace_test", parent.Conversation.ID)
	if err != nil {
		t.Fatalf("Read parent after side: %v", err)
	}
	if afterSide.Conversation.LastTrajectorySequence != parentSequence || afterSide.Conversation.Status != ConversationStatusWorking {
		t.Fatalf("side contaminated parent state: sequence=%d want=%d status=%s", afterSide.Conversation.LastTrajectorySequence, parentSequence, afterSide.Conversation.Status)
	}
	items := runtime.injectedItems()
	if len(items) != 2 || !strings.Contains(items[0].Text, `"sourceTrajectorySequence":`) || !strings.Contains(items[0].Text, `"currentObjective":"hold active parent"`) {
		t.Fatalf("side injected context = %+v", items)
	}
	disposed, err := service.DisposeSide(ctx, DisposeSideConversationRequest{
		WorkspaceID: "workspace_test", ParentConversationID: parent.Conversation.ID, SideID: side.ID,
	})
	if err != nil {
		t.Fatalf("DisposeSide: %v", err)
	}
	if disposed.DisposedAt == nil || !runtime.wasUnsubscribed(*side.ProviderThreadID) {
		t.Fatalf("disposed side = %+v", disposed)
	}
	runtime.release(parent.Conversation.ID)
	runtime.waitCompleted(t, parent.Conversation.ID)
}

func waitConversationIdleEvent(t *testing.T, events <-chan ConversationEvent) {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for {
		select {
		case event := <-events:
			if payload, ok := event.Payload.(*ConversationUpdatedEventPayload); ok && payload.Conversation.Status == ConversationStatusIdle {
				return
			}
			if payload, ok := event.Payload.(ConversationUpdatedEventPayload); ok && payload.Conversation.Status == ConversationStatusIdle {
				return
			}
		case <-deadline.C:
			t.Fatal("timed out waiting for idle conversation event")
		}
	}
}
