package conversation

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

// A Setta conversation is a durable record before it is anything at the
// provider. Creating one reaches Codex nowhere; the first turn is what opens the
// ephemeral carrier its work runs on, and the carrier stays process-local even
// then.
func TestConversationCarrierStartsOnlyWhenTheFirstTurnRuns(t *testing.T) {
	store, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Carrier start")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if starts := runtime.startThreadRequests(); len(starts) != 0 {
		t.Fatalf("creating a conversation reached the provider: %+v", starts)
	}
	if carrier, ok := service.Carriers().Lookup(conversationID); ok {
		t.Fatalf("created conversation already holds a carrier: %+v", carrier)
	}

	sendCompletedTestTurn(t, ctx, service, runtime, workspaceID, conversationID, "carrier first request", 1)

	starts := runtime.startThreadRequests()
	if len(starts) != 1 {
		t.Fatalf("first-turn carrier starts = %+v, want one", starts)
	}
	if start := starts[0]; !start.Ephemeral ||
		start.DeveloperInstructions != topicAgentDeveloperInstructions() ||
		len(start.DynamicTools) == 0 {
		t.Fatalf("first-turn carrier start = %+v", starts[0])
	}
	carrier, ok := service.Carriers().Lookup(conversationID)
	if !ok || carrier.OwnerID != conversationID || carrier.ThreadID == "" {
		t.Fatalf("carrier registry entry = %+v, present = %t", carrier, ok)
	}
	requireDurableConversationOmitsCarrier(t, ctx, store, workspaceID, conversationID, carrier.ThreadID)
}

// The carrier outlives the turn, not the process. Every turn one app run makes
// for a conversation shares the thread its first turn opened, and after a
// restart the conversation reaches Codex again by replaying its own record into
// a fresh carrier rather than by resuming the dead one.
func TestConversationTurnsShareOneCarrierAndRestartReplaysSettaHistory(t *testing.T) {
	store, original, originalRuntime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := original.CreateTopic(ctx, workspaceID, "Carrier reuse")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	sendCompletedTestTurn(t, ctx, original, originalRuntime, workspaceID, conversationID, "carrier first request", 1)
	sendCompletedTestTurn(t, ctx, original, originalRuntime, workspaceID, conversationID, "carrier second request", 2)
	liveThreadID := requireOneCarrierAcrossTurns(t, originalRuntime)

	restartedRuntime := cloneServiceTestAgentRuntimeForRestart(originalRuntime)
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after restart: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)
	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}
	if carrier, ok := restarted.Carriers().Lookup(conversationID); ok {
		t.Fatalf("restart inherited carrier %+v", carrier)
	}

	sendCompletedTestTurn(t, ctx, restarted, restartedRuntime, workspaceID, conversationID, "carrier third request", 3)
	requireReplayedCarrierAfterRestart(t, restartedRuntime, liveThreadID)
}

func sendCompletedTestTurn(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
	text string,
	wantTurns int,
) {
	t.Helper()
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, text); err != nil {
		t.Fatalf("SendTurn %q: %v", text, err)
	}
	runtime.waitForStart(t, text)
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return len(snapshot.Turns.Turns) == wantTurns &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
}

// requireDurableConversationOmitsCarrier reads the conversation back the way a
// restarted process would. The record keeps the provider turn that identifies
// the call it made, and never the carrier that call ran on.
func requireDurableConversationOmitsCarrier(
	t *testing.T,
	ctx context.Context,
	store *Store,
	workspaceID string,
	conversationID string,
	threadID string,
) {
	t.Helper()
	reloaded, err := store.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	encoded, err := json.Marshal(reloaded)
	if err != nil {
		t.Fatalf("marshal reloaded snapshot: %v", err)
	}
	turn := latestSnapshotTurn(reloaded)
	if turn.ProviderTurnID == nil || !strings.Contains(string(encoded), *turn.ProviderTurnID) {
		t.Fatalf("durable conversation lost the provider turn it ran: %+v", turn)
	}
	if strings.Contains(string(encoded), threadID) {
		t.Fatalf("durable conversation recorded provider carrier %s: %s", threadID, encoded)
	}
}

func requireOneCarrierAcrossTurns(t *testing.T, runtime *serviceTestAgentRuntime) string {
	t.Helper()
	if starts := runtime.startThreadRequests(); len(starts) != 1 {
		t.Fatalf("carrier starts across two turns = %+v, want one", starts)
	}
	requests := runtime.turnRequests()
	if len(requests) != 2 || requests[0].ProviderThreadID != requests[1].ProviderThreadID {
		t.Fatalf("turn carriers = %+v, want one shared carrier", requests)
	}
	threadID := requests[0].ProviderThreadID
	replays := 0
	for _, injection := range runtime.injectedThreadItems() {
		if injection.threadID == threadID {
			replays++
		}
	}
	if replays != 1 {
		t.Fatalf("carrier %s replays = %d, want one at carrier start", threadID, replays)
	}
	return threadID
}

func requireReplayedCarrierAfterRestart(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	deadThreadID string,
) {
	t.Helper()
	starts := runtime.startThreadRequests()
	if len(starts) != 1 || !starts[0].Ephemeral {
		t.Fatalf("post-restart carrier starts = %+v, want one ephemeral carrier", starts)
	}
	requests := runtime.turnRequests()
	if len(requests) != 1 || requests[0].ProviderThreadID == deadThreadID {
		t.Fatalf("post-restart turn resumed the dead carrier %s: %+v", deadThreadID, requests)
	}
	replayed := carrierReplayText(runtime, requests[0].ProviderThreadID)
	for _, fact := range []string{
		"carrier first request",
		"completed carrier first request",
		"carrier second request",
		"completed carrier second request",
		"Setta turn outcome: completed.",
	} {
		if !strings.Contains(replayed, fact) {
			t.Fatalf("post-restart replay omitted %q: %q", fact, replayed)
		}
	}
}

// carrierReplayText is the Setta history one carrier was started with, in the
// order the provider received it.
func carrierReplayText(runtime *serviceTestAgentRuntime, threadID string) string {
	var replayed strings.Builder
	for _, injection := range runtime.injectedThreadItems() {
		if injection.threadID != threadID {
			continue
		}
		for _, item := range injection.items {
			replayed.WriteString(item.Text)
			replayed.WriteByte('\n')
		}
	}
	return replayed.String()
}

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
