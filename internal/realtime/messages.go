package realtime

const (
	MessageTypeAllConnections          = "AllConnections"
	MessageTypeFrontendIdentity        = "FrontendIdentity"
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
