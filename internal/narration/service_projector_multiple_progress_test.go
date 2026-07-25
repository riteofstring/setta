package narration

import (
	"reflect"
	"sync"
	"testing"
	"time"

	"setta/internal/conversation"
)

func TestServiceCommitsMultipleProgressMilestonesForSameTurn(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID := "conversation-multiple-progress-milestones"
	seedStatusServiceConversation(t, store, conversationID)
	turnID := "primary-agent-turn"
	provider := &projectorTestAgentRuntime{
		emitProjectionMilestones:          true,
		emitProjectionMilestonesWithPrior: true,
	}
	clock := newProjectorTestClock(t, "2026-07-12T12:00:20Z")
	service := newProjectorTestService(t, store, provider, WithServiceCallerClock(clock.Now))

	firstPlan := appendProjectorPlanTrajectoryAt(
		t,
		store,
		conversationID,
		turnID,
		"multiple-progress-plan-one",
		"Finish the first meaningful step.",
		"2026-07-12T12:00:20Z",
	)
	service.ObserveCommittedTrajectory(projectorPlanObservation(conversationID, turnID, firstPlan))
	waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return reflect.DeepEqual(milestoneSourceEnds(current, turnID), []int{firstPlan.Sequence})
	})
	clock.Set(t, "2026-07-12T12:00:55Z")

	secondPlan := appendProjectorPlanTrajectoryAt(
		t,
		store,
		conversationID,
		turnID,
		"multiple-progress-plan-two",
		"Finish the second meaningful step.",
		"2026-07-12T12:00:55Z",
	)
	service.ObserveCommittedTrajectory(projectorPlanObservation(conversationID, turnID, secondPlan))
	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return reflect.DeepEqual(
			milestoneSourceEnds(current, turnID),
			[]int{firstPlan.Sequence, secondPlan.Sequence},
		)
	})
	ends := milestoneSourceEnds(snapshot, turnID)
	if !reflect.DeepEqual(ends, []int{firstPlan.Sequence, secondPlan.Sequence}) {
		t.Fatalf("milestone source ends = %v, want [%d %d]", ends, firstPlan.Sequence, secondPlan.Sequence)
	}
	calls := provider.snapshotCalls()
	if len(calls) != 2 ||
		calls[0].priorMilestoneCount != 0 ||
		calls[1].priorMilestoneCount != 1 ||
		!reflect.DeepEqual(calls[0].semanticSequences, []int{firstPlan.Sequence}) ||
		!reflect.DeepEqual(calls[1].semanticSequences, []int{secondPlan.Sequence}) {
		t.Fatalf("multiple progress calls = %+v", calls)
	}
}

func milestoneSourceEnds(
	snapshot conversation.ConversationSnapshot,
	turnID string,
) []int {
	result := []int{}
	for _, event := range snapshot.Narration.Events {
		if event.Kind != conversation.NarrationEventKindMilestone ||
			event.TurnID == nil ||
			*event.TurnID != turnID {
			continue
		}
		result = append(result, event.SourceSequenceEnd)
	}
	return result
}

type projectorTestClock struct {
	mu  sync.Mutex
	now time.Time
}

func newProjectorTestClock(t *testing.T, value string) *projectorTestClock {
	t.Helper()
	clock := &projectorTestClock{}
	clock.Set(t, value)
	return clock
}

func (clock *projectorTestClock) Set(t *testing.T, value string) {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse projector test clock: %v", err)
	}
	clock.mu.Lock()
	defer clock.mu.Unlock()
	clock.now = parsed
}

func (clock *projectorTestClock) Now() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}
