package frontendbindings

func frontendDefaultWebsocketConnectionInfo() WebsocketConnectionInfo {
	return WebsocketConnectionInfo{
		ID:             "",
		ConnectionType: WebsocketConnectionTypeServer,
		CurrentAddress: nil,
		ShareSessionID: nil,
	}
}

func frontendDefaultWebsocketMsgCurrentAddressUpdate() map[string]any {
	return map[string]any{
		"id":          nil,
		"messageType": WebsocketMsgTypeForBackendCurrentAddressUpdate,
		"content":     "",
	}
}
