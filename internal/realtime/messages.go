package realtime

import "setta/internal/projectstate"

const (
	MessageTypeAllConnections          = "AllConnections"
	MessageTypeFrontendIdentity        = "FrontendIdentity"
	MessageTypeLSPDiagnostics          = "LSPDiagnostics"
	MessageTypeRealtimeUIChange        = "RealtimeUIChange"
	MessageTypeRealtimeDependencyEvent = "RealtimeDependencyEvent"
)

type FrontendIdentityContent struct {
	FrontendAffinityToken string `json:"frontendAffinityToken"`
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
