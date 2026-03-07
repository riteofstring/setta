package realtime

import "encoding/json"

const (
	MessageTypeListenerRealtimeEvent = "ListenerRealtimeEvent"
	MessageTypeListenerForceRefresh  = "ListenerForceRefresh"
)

type ListenerRealtimeDelta struct {
	Dependency string          `json:"dependency"`
	Value      json.RawMessage `json:"value"`
}

type ListenerRealtimeEventContent struct {
	ProjectID      string                  `json:"projectId"`
	ShareSessionID string                  `json:"shareSessionId,omitempty"`
	Deltas         []ListenerRealtimeDelta `json:"deltas"`
	Sequence       uint64                  `json:"sequence"`
}

type ListenerRealtimeEventMessage struct {
	MessageType string                       `json:"messageType"`
	Content     ListenerRealtimeEventContent `json:"content"`
}

type ListenerForceRefreshContent struct {
	ProjectID      string          `json:"projectId"`
	ShareSessionID string          `json:"shareSessionId,omitempty"`
	ProjectState   json.RawMessage `json:"projectState,omitempty"`
}

type ListenerForceRefreshMessage struct {
	MessageType string                      `json:"messageType"`
	Content     ListenerForceRefreshContent `json:"content"`
}

func NewListenerRealtimeEventMessage(content ListenerRealtimeEventContent) ListenerRealtimeEventMessage {
	return ListenerRealtimeEventMessage{
		MessageType: MessageTypeListenerRealtimeEvent,
		Content:     content,
	}
}

func NewListenerForceRefreshMessage(content ListenerForceRefreshContent) ListenerForceRefreshMessage {
	return ListenerForceRefreshMessage{
		MessageType: MessageTypeListenerForceRefresh,
		Content:     content,
	}
}
