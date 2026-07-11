package conversationindex

import (
	"errors"
	"strings"

	"setta/internal/conversation"
)

const (
	MaxCandidateCount = 50
	recentTextCount   = 3
)

type TopicCard struct {
	ConversationID       string                           `json:"conversationId"`
	WorkspaceID          string                           `json:"workspaceId"`
	WorkspaceName        string                           `json:"workspaceName"`
	Title                string                           `json:"title"`
	TopicDescriptor      string                           `json:"topicDescriptor"`
	RecentUserRequests   []string                         `json:"recentUserRequests"`
	RecentFinalSummaries []string                         `json:"recentFinalSummaries"`
	UpdatedAt            string                           `json:"updatedAt"`
	Status               conversation.ConversationStatus  `json:"status"`
	OpenPaneIDs          []string                         `json:"openPaneIds"`
	Branch               *conversation.ConversationBranch `json:"branch"`
}

type TopicCandidate struct {
	Card        TopicCard `json:"card"`
	LexicalRank *float64  `json:"lexicalRank"`
	RecencyRank int       `json:"recencyRank"`
}

type TopicCardPage struct {
	Cards      []TopicCard `json:"cards"`
	NextCursor *string     `json:"nextCursor"`
}

type SearchRequest struct {
	Query       string  `json:"query"`
	WorkspaceID *string `json:"workspaceId"`
	Limit       int     `json:"limit"`
}

type ListRequest struct {
	WorkspaceID *string `json:"workspaceId"`
	Cursor      *string `json:"cursor"`
	Limit       int     `json:"limit"`
}

func (request SearchRequest) Validate() error {
	if strings.TrimSpace(request.Query) == "" || strings.TrimSpace(request.Query) != request.Query {
		return errors.New("topic search query must be non-empty and trimmed")
	}
	return validateLimit(request.Limit)
}

func (request ListRequest) Validate() error {
	return validateLimit(request.Limit)
}

func validateLimit(limit int) error {
	if limit <= 0 || limit > MaxCandidateCount {
		return errors.New("topic index limit must be between 1 and 50")
	}
	return nil
}
