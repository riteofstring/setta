package orchestrator

import "sync"

const (
	WorkflowEventStreamID       = "workflow_events"
	defaultSubscriberBufferSize = 128
)

type WorkflowEventCursor struct {
	StreamID string
	Sequence int
}

type WorkflowEventEnvelope struct {
	StreamID string
	Sequence int
	Event    WorkflowEvent
}

type EventHub struct {
	mu          sync.Mutex
	closed      bool
	subscribers map[chan WorkflowEventEnvelope]struct{}
}

type EventSubscription struct {
	Events <-chan WorkflowEventEnvelope

	hub     *EventHub
	channel chan WorkflowEventEnvelope
}

func NewEventHub() *EventHub {
	return &EventHub{subscribers: map[chan WorkflowEventEnvelope]struct{}{}}
}

func (hub *EventHub) Subscribe(replay []WorkflowEventEnvelope) *EventSubscription {
	channel := make(chan WorkflowEventEnvelope, defaultSubscriberBufferSize+len(replay))
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}
	}
	for _, event := range replay {
		channel <- event
	}
	hub.subscribers[channel] = struct{}{}
	return &EventSubscription{Events: channel, hub: hub, channel: channel}
}

func (hub *EventHub) Publish(events []WorkflowEventEnvelope) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	for _, event := range events {
		for subscriber := range hub.subscribers {
			select {
			case subscriber <- event:
			default:
				close(subscriber)
				delete(hub.subscribers, subscriber)
			}
		}
	}
}

func (hub *EventHub) Close() {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	hub.closed = true
	for subscriber := range hub.subscribers {
		close(subscriber)
		delete(hub.subscribers, subscriber)
	}
}

func (subscription *EventSubscription) Unsubscribe() {
	subscription.hub.mu.Lock()
	defer subscription.hub.mu.Unlock()
	if _, ok := subscription.hub.subscribers[subscription.channel]; ok {
		delete(subscription.hub.subscribers, subscription.channel)
		close(subscription.channel)
	}
}
