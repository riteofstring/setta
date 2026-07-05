package chat

import (
	"context"
	"testing"
)

// TestTranscriptDuplicateCompletedAgentMessageDropsBlock verifies that an
// identical completed agentMessage from a distinct provider item does not
// duplicate final assistant text: the duplicate's tail block is removed.
func TestTranscriptDuplicateCompletedAgentMessageDropsBlock(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("p1", "Final answer."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "p1", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final answer."}); err != nil {
				return TurnCompletion{}, err
			}
			// Replay of the same final text under a new provider item id.
			if err := sink.AssistantTextDelta("p2", "Final answer."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "p2", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final answer."}); err != nil {
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
		t.Fatalf("assistant text blocks = %d, want 1 (duplicate must be dropped): %v", len(text), blockKinds(blocks))
	}
	if text[0].AssistantText.Text != "Final answer." {
		t.Fatalf("assistant block text = %q, want %q", text[0].AssistantText.Text, "Final answer.")
	}
	assertMonotonicOrdinals(t, blocks)
}
