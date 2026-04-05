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
	MessageType FrontendMessageType `json:"messageType" ts_type:"typeof MessageTypeEnum.CurrentAddressUpdate"`
	Content     string              `json:"content"`
}

type RealtimeUIChangeContent struct {
	ProjectConfigID string          `json:"projectConfigId"`
	DependencyKey   json.RawMessage `json:"dependencyKey" ts_type:"BaseDependencyKeyUnion"`
	Value           json.RawMessage `json:"value" ts_type:"BaseDependencyValueUnion"`
}

type RealtimeUIChangeMessage struct {
	ID          *string                 `json:"id,omitempty"`
	MessageType FrontendMessageType     `json:"messageType" ts_type:"typeof MessageTypeEnum.RealtimeUIChange"`
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
	DependencyEvent RealtimeDependencyEventPayload `json:"dependencyEvent" ts_type:"DependencyEvent"`
}

type RealtimeDependencyEventMessage struct {
	ID          *string                        `json:"id,omitempty"`
	MessageType FrontendMessageType            `json:"messageType" ts_type:"typeof MessageTypeEnum.RealtimeDependencyEvent"`
	Content     RealtimeDependencyEventContent `json:"content"`
}
