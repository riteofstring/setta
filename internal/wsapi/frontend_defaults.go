package wsapi

func FrontendDefaultCurrentAddressUpdateMessage() CurrentAddressUpdateMessage {
	return CurrentAddressUpdateMessage{
		MessageType: FrontendMessageTypeCurrentAddressUpdate,
		Content:     "",
	}
}
