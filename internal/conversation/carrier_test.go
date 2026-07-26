package conversation

import (
	"strings"
	"testing"

	"setta/internal/agent"
)

func TestCarrierReplayPreservesSettaHistoryFactsInOrder(t *testing.T) {
	turnID := "turn-replay"
	snapshot := ConversationSnapshot{
		Turns: ConversationTurnWindow{Turns: []ConversationTurn{{
			ID:            turnID,
			AuthoredInput: AuthoredInput{Text: "Create the report."},
			Status:        TurnStatusCompleted,
		}}},
		Trajectory: ConversationTrajectoryWindow{Events: []TrajectoryEvent{
			{
				TurnID:      &turnID,
				Kind:        TrajectoryEventTurnSteered,
				TurnSteered: &TrajectoryTurnSteered{Input: AuthoredInput{Text: "Use the revised scope."}},
			},
			{
				TurnID: &turnID,
				Kind:   TrajectoryEventActivityCompleted,
				ActivityCompleted: &TrajectoryActivityCompleted{
					Activity: TrajectoryActivity{
						Kind:  TrajectoryActivityCommand,
						Title: "generate report",
					},
					Summary: "Generated the report.",
				},
			},
			{
				TurnID: &turnID,
				Kind:   TrajectoryEventArtifactEmitted,
				ArtifactEmitted: &TrajectoryArtifactEmitted{
					ArtifactID: "artifact-report",
					Kind:       ArtifactKindMarkdown,
					Title:      "Revised report",
				},
			},
			{
				TurnID: &turnID,
				Kind:   TrajectoryEventApprovalResolved,
				ApprovalResolved: &TrajectoryApprovalResolved{
					Resolution: TrajectoryApprovalResolution{
						ApprovalID: "approval-report",
						Decision:   TrajectoryApprovalDecisionApproved,
					},
				},
			},
			{
				TurnID: &turnID,
				Kind:   TrajectoryEventAgentMessageCompleted,
				AgentMessageCompleted: &TrajectoryAgentMessageCompleted{
					Text: "The revised report is ready.",
				},
			},
			{
				TurnID:        &turnID,
				Kind:          TrajectoryEventTurnCompleted,
				TurnCompleted: &TrajectoryTurnCompleted{},
			},
		}},
	}

	turns := replayedConversationTurns(snapshot)
	if len(turns) != 1 {
		t.Fatalf("replayed turns = %d, want 1", len(turns))
	}
	items := turns[0].items
	wantRoles := []string{"user", "user", "developer", "developer", "developer", "assistant", "developer"}
	if len(items) != len(wantRoles) {
		t.Fatalf("replayed items = %+v", items)
	}
	for index, role := range wantRoles {
		if items[index].Role != role {
			t.Fatalf("replayed item %d role = %q, want %q", index, items[index].Role, role)
		}
	}
	for _, text := range []string{
		"Create the report.",
		"Use the revised scope.",
		"generate report",
		"artifact-report",
		"approval-report",
		"The revised report is ready.",
		"completed",
	} {
		if !carrierReplayItemsContain(items, text) {
			t.Fatalf("replayed items omitted %q: %+v", text, items)
		}
	}
}

func TestCarrierReplayHeaderIncludesSettaCurrentFocus(t *testing.T) {
	header := carrierReplayHeaderItem(ConversationSnapshot{
		Conversation: TopicConversation{
			Title:           "Release",
			TopicDescriptor: "Prepare the release",
		},
		NarratorState: NarratorState{CurrentFocus: "Verify the final package"},
	})
	if header.Role != "developer" ||
		!strings.Contains(header.Text, "Prepare the release") ||
		!strings.Contains(header.Text, "Verify the final package") {
		t.Fatalf("carrier replay header = %+v", header)
	}
}

func carrierReplayItemsContain(items []agent.InjectedTextItem, text string) bool {
	for _, item := range items {
		if strings.Contains(item.Text, text) {
			return true
		}
	}
	return false
}
