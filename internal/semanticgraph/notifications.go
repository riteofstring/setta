package semanticgraph

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	SemanticGraphChangeEventType     = "semantic_graph.changed"
	SemanticGraphChangeSchemaVersion = 1

	defaultSemanticGraphChangeStreamID         = "semantic_graph_changes"
	defaultSemanticGraphChangeSubscriberBuffer = 128
)

type SemanticGraphChangeCursor struct {
	StreamID string
	Sequence int
}

type SemanticGraphChangeEvent struct {
	SchemaVersion                   int                       `json:"schemaVersion"`
	StreamID                        string                    `json:"streamId"`
	Sequence                        int                       `json:"sequence"`
	EventID                         string                    `json:"eventId"`
	Type                            string                    `json:"type"`
	WorkspaceID                     string                    `json:"workspaceId"`
	ChangedAreas                    []SemanticGraphChangeArea `json:"changedAreas"`
	SemanticNodeIDs                 []string                  `json:"semanticNodeIds"`
	SemanticEdgeIDs                 []string                  `json:"semanticEdgeIds"`
	TargetEntityIDs                 []string                  `json:"targetEntityIds"`
	CreatedSemanticEventIDs         []string                  `json:"createdSemanticEventIds"`
	CartographerRunIDs              []string                  `json:"cartographerRunIds"`
	CartographerWindowIDs           []string                  `json:"cartographerWindowIds"`
	CartographerPatchIDs            []string                  `json:"cartographerPatchIds"`
	SemanticRuntimeRevision         int                       `json:"semanticRuntimeRevision"`
	SemanticRuntimeDelta            *SemanticRuntimeDelta     `json:"semanticRuntimeDelta"`
	SemanticRuntimeSnapshotRequired bool                      `json:"semanticRuntimeSnapshotRequired"`
	OccurredAt                      string                    `json:"occurredAt"`
}

type SemanticGraphChangeSubscription struct {
	Events <-chan SemanticGraphChangeEvent

	hub     *semanticGraphChangeHub
	channel chan SemanticGraphChangeEvent
}

type semanticGraphChangeDraft struct {
	WorkspaceID                     string
	ChangedAreas                    []SemanticGraphChangeArea
	SemanticNodeIDs                 []string
	SemanticEdgeIDs                 []string
	TargetEntityIDs                 []string
	CreatedSemanticEventIDs         []string
	CartographerRunIDs              []string
	CartographerWindowIDs           []string
	CartographerPatchIDs            []string
	SemanticRuntimeRevision         int
	SemanticRuntimeDelta            *SemanticRuntimeDelta
	SemanticRuntimeSnapshotRequired bool
	OccurredAt                      string
}

type semanticGraphChangeHub struct {
	now func() time.Time

	mu           sync.Mutex
	closed       bool
	nextSequence int
	streamID     string
	subscribers  map[chan SemanticGraphChangeEvent]struct{}
}

func newSemanticGraphChangeHub(streamID string, now func() time.Time) *semanticGraphChangeHub {
	if now == nil {
		now = time.Now
	}
	if streamID == "" {
		streamID = defaultSemanticGraphChangeStreamID
	}
	return &semanticGraphChangeHub{
		now:          now,
		nextSequence: 1,
		streamID:     streamID,
		subscribers:  map[chan SemanticGraphChangeEvent]struct{}{},
	}
}

func (service *Service) SubscribeSemanticGraphChanges(cursor SemanticGraphChangeCursor) (*SemanticGraphChangeSubscription, error) {
	if service.semanticGraphChanges == nil {
		return nil, errors.New("semantic graph change stream is not configured")
	}
	return service.semanticGraphChanges.subscribe(cursor)
}

func (subscription *SemanticGraphChangeSubscription) Unsubscribe() {
	if subscription == nil || subscription.hub == nil {
		return
	}
	subscription.hub.unsubscribe(subscription.channel)
}

func (hub *semanticGraphChangeHub) subscribe(cursor SemanticGraphChangeCursor) (*SemanticGraphChangeSubscription, error) {
	if err := validateSemanticGraphChangeCursor(cursor); err != nil {
		return nil, err
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	channel := make(chan SemanticGraphChangeEvent, defaultSemanticGraphChangeSubscriberBuffer)
	if hub.closed {
		close(channel)
		return &SemanticGraphChangeSubscription{Events: channel, hub: hub, channel: channel}, nil
	}
	hub.subscribers[channel] = struct{}{}
	return &SemanticGraphChangeSubscription{Events: channel, hub: hub, channel: channel}, nil
}

func validateSemanticGraphChangeCursor(cursor SemanticGraphChangeCursor) error {
	if cursor.Sequence < 0 {
		return fmt.Errorf("semantic graph change sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("semantic graph change stream id is required for non-zero sequence")
	}
	return nil
}

func (hub *semanticGraphChangeHub) unsubscribe(channel chan SemanticGraphChangeEvent) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if _, ok := hub.subscribers[channel]; !ok {
		return
	}
	delete(hub.subscribers, channel)
	close(channel)
}

func (hub *semanticGraphChangeHub) publish(draft semanticGraphChangeDraft) (SemanticGraphChangeEvent, bool) {
	event := hub.event(draft)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return SemanticGraphChangeEvent{}, false
	}
	event.Sequence = hub.nextSequence
	event.StreamID = hub.streamID
	event.EventID = fmt.Sprintf("%s:%d", hub.streamID, event.Sequence)
	hub.nextSequence++
	for subscriber := range hub.subscribers {
		select {
		case subscriber <- event:
		default:
			close(subscriber)
			delete(hub.subscribers, subscriber)
		}
	}
	return event, true
}

func (hub *semanticGraphChangeHub) event(draft semanticGraphChangeDraft) SemanticGraphChangeEvent {
	occurredAt := draft.OccurredAt
	if occurredAt == "" {
		occurredAt = timestamp(hub.now())
	}
	return SemanticGraphChangeEvent{
		SchemaVersion:                   SemanticGraphChangeSchemaVersion,
		Type:                            SemanticGraphChangeEventType,
		WorkspaceID:                     draft.WorkspaceID,
		ChangedAreas:                    uniqueSemanticGraphChangeAreas(draft.ChangedAreas),
		SemanticNodeIDs:                 uniqueStrings(draft.SemanticNodeIDs),
		SemanticEdgeIDs:                 uniqueStrings(draft.SemanticEdgeIDs),
		TargetEntityIDs:                 uniqueStrings(draft.TargetEntityIDs),
		CreatedSemanticEventIDs:         uniqueStrings(draft.CreatedSemanticEventIDs),
		CartographerRunIDs:              uniqueStrings(draft.CartographerRunIDs),
		CartographerWindowIDs:           uniqueStrings(draft.CartographerWindowIDs),
		CartographerPatchIDs:            uniqueStrings(draft.CartographerPatchIDs),
		SemanticRuntimeRevision:         draft.SemanticRuntimeRevision,
		SemanticRuntimeDelta:            draft.SemanticRuntimeDelta,
		SemanticRuntimeSnapshotRequired: draft.SemanticRuntimeSnapshotRequired,
		OccurredAt:                      occurredAt,
	}
}

func uniqueSemanticGraphChangeAreas(values []SemanticGraphChangeArea) []SemanticGraphChangeArea {
	seen := map[SemanticGraphChangeArea]bool{}
	result := make([]SemanticGraphChangeArea, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	if result == nil {
		return []SemanticGraphChangeArea{}
	}
	return result
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	if result == nil {
		return []string{}
	}
	return result
}
