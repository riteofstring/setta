package orchestrator

import "sync"

const defaultSubscriberBufferSize = 128

type EventHub struct {
	mu          sync.Mutex
	closed      bool
	subscribers map[chan WorkflowEvent]struct{}
}

type EventSubscription struct {
	Events <-chan WorkflowEvent

	hub     *EventHub
	channel chan WorkflowEvent
}

func NewEventHub() *EventHub {
	return &EventHub{subscribers: map[chan WorkflowEvent]struct{}{}}
}

func (hub *EventHub) Subscribe() *EventSubscription {
	channel := make(chan WorkflowEvent, defaultSubscriberBufferSize)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}
	}
	hub.subscribers[channel] = struct{}{}
	return &EventSubscription{Events: channel, hub: hub, channel: channel}
}

func (hub *EventHub) Publish(events []WorkflowEvent) {
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
