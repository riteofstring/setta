package chat

import (
	"context"
	"testing"
)

// TestTranscriptAssistantBlockUsesCompletedAgentMessageWithoutDelta verifies
// that a completed protocol agentMessage item materializes final assistant text
// even when no separate delta notification arrived first.
func TestTranscriptAssistantBlockUsesCompletedAgentMessageWithoutDelta(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "p1", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final item text."}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	text := assistantTextBlocks(blocks)
	if len(text) != 1 {
		t.Fatalf("assistant text blocks = %d, want 1", len(text))
	}
	if text[0].AssistantText.Text != "Final item text." {
		t.Fatalf("assistant block text = %q, want final item text", text[0].AssistantText.Text)
	}
	if len(activityBlocks(blocks)) != 0 {
		t.Fatalf("agent_message must not create an activity block: %v", blockKinds(blocks))
	}
}
