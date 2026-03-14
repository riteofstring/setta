package realtime

import "encoding/json"

const (
	MessageTypeListenerInit            = "ListenerInit"
	MessageTypeListenerRegister        = "ListenerRegister"
	MessageTypeListenerRegisterAck     = "ListenerRegisterAck"
	MessageTypeListenerRouterCall      = "ListenerRouterEndpointCall"
	MessageTypeListenerRouterResult    = "ListenerRouterEndpointResult"
	MessageTypeListenerRealtimeEvent   = "ListenerRealtimeEvent"
	MessageTypeListenerDependencyEvent = "ListenerDependencyEvent"
	MessageTypeListenerForceRefresh    = "ListenerForceRefresh"
	MessageTypeListenerError           = "ListenerError"
)

type ListenerInitContent struct {
	ProjectConfigID string `json:"projectConfigId,omitempty"`
	ProjectName     string `json:"projectName,omitempty"`
	UseTemporaryIDs bool   `json:"useTemporaryIds,omitempty"`
}

type ListenerInitMessage struct {
	MessageType string              `json:"messageType"`
	Content     ListenerInitContent `json:"content"`
}

type ListenerErrorContent struct {
	Error   string         `json:"error"`
	Details map[string]any `json:"details,omitempty"`
}

type ListenerErrorMessage struct {
	MessageType string               `json:"messageType"`
	Content     ListenerErrorContent `json:"content"`
}

type ListenerRealtimeDelta struct {
	Dependency    string          `json:"dependency"`
	Value         json.RawMessage `json:"value"`
	BinaryPayload []byte          `json:"-"`
}

type ListenerRegisterCallbackSpec struct {
	Dependencies   []string               `json:"dependencies"`
	DependencyMode ListenerDependencyMode `json:"dependencyMode"`
}

type ListenerRegisterContent struct {
	Callbacks map[string]ListenerRegisterCallbackSpec `json:"callbacks"`
}

type ListenerRegisterMessage struct {
	MessageType string                  `json:"messageType"`
	Content     ListenerRegisterContent `json:"content"`
}

type ListenerRegisterAckStatus struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type ListenerRegisterAckContent struct {
	ProjectConfigID string                               `json:"projectConfigId"`
	ShareSessionID  string                               `json:"shareSessionId,omitempty"`
	Callbacks       map[string]ListenerRegisterAckStatus `json:"callbacks"`
}

type ListenerRegisterAckMessage struct {
	MessageType string                     `json:"messageType"`
	Content     ListenerRegisterAckContent `json:"content"`
}

type ListenerRouterEndpointCallContent struct {
	ProjectConfigID string         `json:"projectConfigId"`
	CallID          string         `json:"callId"`
	EndpointName    string         `json:"endpointName"`
	Payload         map[string]any `json:"payload"`
}

type ListenerRouterEndpointCallMessage struct {
	MessageType string                            `json:"messageType"`
	Content     ListenerRouterEndpointCallContent `json:"content"`
}

type ListenerRouterEndpointResultContent struct {
	ProjectConfigID string         `json:"projectConfigId"`
	CallID          string         `json:"callId"`
	OK              bool           `json:"ok"`
	Result          any            `json:"result,omitempty"`
	Error           string         `json:"error,omitempty"`
	Details         map[string]any `json:"details,omitempty"`
}

type ListenerRouterEndpointResultMessage struct {
	MessageType string                              `json:"messageType"`
	Content     ListenerRouterEndpointResultContent `json:"content"`
}

type ListenerDependencyEvent struct {
	DependencyKey string          `json:"dependencyKey"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	TimestampMS   int64           `json:"timestampMs"`
	BinaryPayload []byte          `json:"-"`
}

type ListenerRealtimeEventContent struct {
	ProjectConfigID string                  `json:"projectConfigId"`
	ShareSessionID  string                  `json:"shareSessionId,omitempty"`
	Deltas          []ListenerRealtimeDelta `json:"deltas"`
	Sequence        uint64                  `json:"sequence"`
}

type ListenerRealtimeEventMessage struct {
	MessageType string                       `json:"messageType"`
	Content     ListenerRealtimeEventContent `json:"content"`
}

type ListenerDependencyEventContent struct {
	ProjectConfigID  string                    `json:"projectConfigId"`
	ShareSessionID   string                    `json:"shareSessionId,omitempty"`
	DependencyEvents []ListenerDependencyEvent `json:"dependencyEvents"`
	Sequence         uint64                    `json:"sequence"`
}

type ListenerDependencyEventMessage struct {
	MessageType string                         `json:"messageType"`
	Content     ListenerDependencyEventContent `json:"content"`
}

type ListenerForceRefreshContent struct {
	ProjectConfigID string          `json:"projectConfigId"`
	ShareSessionID  string          `json:"shareSessionId,omitempty"`
	ProjectState    json.RawMessage `json:"projectState,omitempty"`
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

func NewListenerErrorMessage(content ListenerErrorContent) ListenerErrorMessage {
	return ListenerErrorMessage{
		MessageType: MessageTypeListenerError,
		Content:     content,
	}
}

func NewListenerRegisterAckMessage(content ListenerRegisterAckContent) ListenerRegisterAckMessage {
	return ListenerRegisterAckMessage{
		MessageType: MessageTypeListenerRegisterAck,
		Content:     content,
	}
}

func NewListenerRouterEndpointResultMessage(content ListenerRouterEndpointResultContent) ListenerRouterEndpointResultMessage {
	return ListenerRouterEndpointResultMessage{
		MessageType: MessageTypeListenerRouterResult,
		Content:     content,
	}
}

func NewListenerDependencyEventMessage(content ListenerDependencyEventContent) ListenerDependencyEventMessage {
	return ListenerDependencyEventMessage{
		MessageType: MessageTypeListenerDependencyEvent,
		Content:     content,
	}
}

func NewListenerForceRefreshMessage(content ListenerForceRefreshContent) ListenerForceRefreshMessage {
	return ListenerForceRefreshMessage{
		MessageType: MessageTypeListenerForceRefresh,
		Content:     content,
	}
}
