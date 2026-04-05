package wsapi

import (
	"encoding/json"

	"setta/internal/realtime"
)

type FrontendMessageType string

const (
	FrontendMessageTypeCurrentAddressUpdate    FrontendMessageType = "CurrentAddressUpdate"
	FrontendMessageTypeUISettingRevealResult   FrontendMessageType = FrontendMessageType(realtime.MessageTypeUISettingRevealResult)
	FrontendMessageTypeRealtimeUIChange        FrontendMessageType = FrontendMessageType(realtime.MessageTypeRealtimeUIChange)
	FrontendMessageTypeRealtimeDependencyEvent FrontendMessageType = FrontendMessageType(realtime.MessageTypeRealtimeDependencyEvent)
)

type CurrentAddressUpdateMessage struct {
	ID          *string             `json:"id,omitempty"`
	MessageType FrontendMessageType `json:"messageType"`
	Content     string              `json:"content"`
}

type RealtimeUIChangeContent struct {
	ProjectConfigID string          `json:"projectConfigId"`
	DependencyKey   json.RawMessage `json:"dependencyKey"`
	Value           json.RawMessage `json:"value"`
}

type RealtimeUIChangeMessage struct {
	ID          *string                 `json:"id,omitempty"`
	MessageType FrontendMessageType     `json:"messageType"`
	Content     RealtimeUIChangeContent `json:"content"`
}

// setta-go-type-discovery: skip
type RealtimeDependencyEventPayload struct {
	DependencyKey json.RawMessage `json:"dependencyKey"`
	Payload       json.RawMessage `json:"payload"`
	TimestampMS   int64           `json:"timestampMs"`
}

type RealtimeDependencyEventContent struct {
	ProjectConfigID string                         `json:"projectConfigId"`
	DependencyEvent RealtimeDependencyEventPayload `json:"dependencyEvent"`
}

type RealtimeDependencyEventMessage struct {
	ID          *string                        `json:"id,omitempty"`
	MessageType FrontendMessageType            `json:"messageType"`
	Content     RealtimeDependencyEventContent `json:"content"`
}
