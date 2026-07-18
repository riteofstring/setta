package chat

type ComposerPromptHistoryEntry struct {
	MessageID      string            `json:"messageId"`
	ConversationID string            `json:"conversationId"`
	Ordinal        int               `json:"ordinal"`
	CreatedAt      string            `json:"createdAt"`
	Input          ChatInput         `json:"input"`
	Attachments    []ImageAttachment `json:"attachments"`
}

type ComposerPromptHistoryPage struct {
	ConversationID     string                       `json:"conversationId"`
	Entries            []ComposerPromptHistoryEntry `json:"entries"`
	HasMoreOlder       bool                         `json:"hasMoreOlder"`
	OlderBeforeOrdinal int                          `json:"olderBeforeOrdinal"`
}
