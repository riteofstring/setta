package chat

import "encoding/json"

type RunTranscriptPage struct {
	WorkspaceID             string            `json:"workspaceId"`
	ConversationID          string            `json:"conversationId"`
	RunID                   string            `json:"runId"`
	LastChatEventStreamID   string            `json:"lastChatEventStreamId"`
	LastChatEventSequence   int               `json:"lastChatEventSequence"`
	Blocks                  []TranscriptBlock `json:"blocks"`
	HasMoreOlder            bool              `json:"hasMoreOlder"`
	OlderBeforeBlockOrdinal int               `json:"olderBeforeBlockOrdinal"`
}

func (page RunTranscriptPage) MarshalJSON() ([]byte, error) {
	type pageAlias RunTranscriptPage
	if page.Blocks == nil {
		page.Blocks = []TranscriptBlock{}
	}
	return json.Marshal(pageAlias(page))
}
