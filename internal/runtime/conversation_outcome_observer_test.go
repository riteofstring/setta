package runtime

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"setta/internal/conversation"
)

func TestConversationOutcomeObserverWritesOnlyContentFreeTiming(t *testing.T) {
	var output bytes.Buffer
	observer := newConversationOutcomeObserver(&output)
	startedAt := time.Date(2026, 7, 25, 18, 0, 0, 0, time.UTC)
	observer.ObserveConversationOutcomeTiming(conversation.OutcomeTiming{
		Kind:        conversation.OutcomeTimingApproval,
		StartedAt:   startedAt,
		CompletedAt: startedAt.Add(125 * time.Millisecond),
		Duration:    125 * time.Millisecond,
	})
	if err := observer.Err(); err != nil {
		t.Fatal(err)
	}
	var measurement map[string]any
	if err := json.Unmarshal(output.Bytes(), &measurement); err != nil {
		t.Fatal(err)
	}
	if len(measurement) != 5 ||
		measurement["event"] != "conversation_outcome_timing" ||
		measurement["kind"] != string(conversation.OutcomeTimingApproval) ||
		measurement["duration_ms"] != float64(125) ||
		measurement["started_at"] != startedAt.Format(time.RFC3339) ||
		measurement["completed_at"] != startedAt.Add(125*time.Millisecond).Format(time.RFC3339Nano) {
		t.Fatalf("conversation outcome measurement = %v", measurement)
	}
}
