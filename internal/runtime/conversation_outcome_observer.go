package runtime

import (
	"encoding/json"
	"io"
	"sync"
	"time"

	"setta/internal/conversation"
)

type conversationOutcomeMeasurement struct {
	CompletedAt          time.Time                      `json:"completed_at"`
	DurationMilliseconds float64                        `json:"duration_ms"`
	Event                string                         `json:"event"`
	Kind                 conversation.OutcomeTimingKind `json:"kind"`
	StartedAt            time.Time                      `json:"started_at"`
}

type conversationOutcomeObserver struct {
	encoder *json.Encoder
	mu      sync.Mutex
	err     error
}

func newConversationOutcomeObserver(writer io.Writer) *conversationOutcomeObserver {
	return &conversationOutcomeObserver{encoder: json.NewEncoder(writer)}
}

func (observer *conversationOutcomeObserver) ObserveConversationOutcomeTiming(
	timing conversation.OutcomeTiming,
) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	observer.err = observer.encoder.Encode(conversationOutcomeMeasurement{
		CompletedAt:          timing.CompletedAt,
		DurationMilliseconds: float64(timing.Duration) / float64(time.Millisecond),
		Event:                "conversation_outcome_timing",
		Kind:                 timing.Kind,
		StartedAt:            timing.StartedAt,
	})
}

func (observer *conversationOutcomeObserver) Err() error {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.err
}

var _ conversation.OutcomeTimingObserver = (*conversationOutcomeObserver)(nil)
