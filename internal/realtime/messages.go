package realtime

import "setta/internal/projectstate"

const (
	MessageTypeNotification            = "Notification"
	MessageTypeAllConnections          = "AllConnections"
	MessageTypeFrontendIdentity        = "FrontendIdentity"
	MessageTypeLSPDiagnostics          = "LSPDiagnostics"
	MessageTypeRealtimeUIChange        = "RealtimeUIChange"
	MessageTypeRealtimeDependencyEvent = "RealtimeDependencyEvent"
)

type NotificationType string

const (
	NotificationTypeError   NotificationType = "error"
	NotificationTypeWarning NotificationType = "warning"
	NotificationTypeInfo    NotificationType = "info"
	NotificationTypeSave    NotificationType = "save"
)

type FrontendIdentityContent struct {
	FrontendAffinityToken string `json:"frontendAffinityToken"`
}

type NotificationContent struct {
	ID              string           `json:"id"`
	ProjectConfigID string           `json:"projectConfigId"`
	Type            NotificationType `json:"type"`
	Message         string           `json:"message"`
	Temporary       bool             `json:"temporary"`
	Timestamp       string           `json:"timestamp"`
	Metadata        map[string]any   `json:"metadata"`
	ReadStatus      bool             `json:"read_status"`
}

type NotificationMessage struct {
	ID          *string             `json:"id"`
	MessageType string              `json:"messageType"`
	Content     NotificationContent `json:"content"`
}

type FrontendIdentityMessage struct {
	MessageType string                  `json:"messageType"`
	Content     FrontendIdentityContent `json:"content"`
}

type AllConnectionsMessage struct {
	MessageType string       `json:"messageType"`
	Content     []Connection `json:"content"`
}

type LSPDiagnosticsMessage struct {
	MessageType string                             `json:"messageType"`
	Content     projectstate.LSPDiagnosticsPayload `json:"content"`
}

func NewFrontendIdentityMessage(frontendAffinityToken string) FrontendIdentityMessage {
	return FrontendIdentityMessage{
		MessageType: MessageTypeFrontendIdentity,
		Content: FrontendIdentityContent{
			FrontendAffinityToken: frontendAffinityToken,
		},
	}
}

func NewNotificationMessage(content NotificationContent) NotificationMessage {
	return NotificationMessage{
		MessageType: MessageTypeNotification,
		Content:     content,
	}
}

func NewAllConnectionsMessage(connections []Connection) AllConnectionsMessage {
	return AllConnectionsMessage{
		MessageType: MessageTypeAllConnections,
		Content:     connections,
	}
}

func NewLSPDiagnosticsMessage(content projectstate.LSPDiagnosticsPayload) LSPDiagnosticsMessage {
	return LSPDiagnosticsMessage{
		MessageType: MessageTypeLSPDiagnostics,
		Content:     content,
	}
}
