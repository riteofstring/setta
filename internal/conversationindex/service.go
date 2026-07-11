package conversationindex

import (
	"context"
	"errors"
	"sort"

	"setta/internal/conversation"
	"setta/internal/workspace"
)

type Store interface {
	SearchTopicIndex(context.Context, string, *string, int) ([]conversation.TopicIndexMatch, error)
	ListTopicIndexDocuments(context.Context, *string, *string, int) ([]conversation.TopicIndexDocument, *string, error)
	ReadConversation(context.Context, string) (conversation.TopicConversation, error)
	ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error)
	ListPaneBindings(context.Context, *string) ([]conversation.PaneBinding, error)
}

type WorkspaceResolver interface {
	ResolveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	store      Store
	workspaces WorkspaceResolver
}

func NewService(store Store, workspaces WorkspaceResolver) (*Service, error) {
	if store == nil || workspaces == nil {
		return nil, errors.New("conversation index store and workspace resolver are required")
	}
	return &Service{store: store, workspaces: workspaces}, nil
}

func (service *Service) Search(ctx context.Context, request SearchRequest) ([]TopicCandidate, error) {
	if err := request.Validate(); err != nil {
		return nil, err
	}
	matches, err := service.store.SearchTopicIndex(ctx, request.Query, request.WorkspaceID, request.Limit)
	if err != nil {
		return nil, err
	}
	result := make([]TopicCandidate, 0, len(matches))
	for index, match := range matches {
		card, err := service.materialize(ctx, match.Document)
		if err != nil {
			return nil, err
		}
		rank := match.Rank
		result = append(result, TopicCandidate{Card: card, LexicalRank: &rank, RecencyRank: index + 1})
	}
	return result, nil
}

func (service *Service) List(ctx context.Context, request ListRequest) (TopicCardPage, error) {
	if err := request.Validate(); err != nil {
		return TopicCardPage{}, err
	}
	documents, next, err := service.store.ListTopicIndexDocuments(ctx, request.WorkspaceID, request.Cursor, request.Limit)
	if err != nil {
		return TopicCardPage{}, err
	}
	cards := make([]TopicCard, 0, len(documents))
	for _, document := range documents {
		card, err := service.materialize(ctx, document)
		if err != nil {
			return TopicCardPage{}, err
		}
		cards = append(cards, card)
	}
	return TopicCardPage{Cards: cards, NextCursor: next}, nil
}

func (service *Service) Read(ctx context.Context, conversationID string) (TopicCard, error) {
	record, err := service.store.ReadConversation(ctx, conversationID)
	if err != nil {
		return TopicCard{}, err
	}
	document := conversation.TopicIndexDocument{
		ConversationID:  record.ID,
		WorkspaceID:     record.WorkspaceID,
		Title:           record.Title,
		TopicDescriptor: record.TopicDescriptor,
		UpdatedAt:       record.UpdatedAt,
	}
	return service.materialize(ctx, document)
}

func (service *Service) materialize(ctx context.Context, document conversation.TopicIndexDocument) (TopicCard, error) {
	snapshot, err := service.store.ReadSnapshot(ctx, document.WorkspaceID, document.ConversationID)
	if err != nil {
		return TopicCard{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveWorkspace(document.WorkspaceID)
	if err != nil {
		return TopicCard{}, err
	}
	bindings, err := service.store.ListPaneBindings(ctx, &document.ConversationID)
	if err != nil {
		return TopicCard{}, err
	}
	return TopicCard{
		ConversationID:       document.ConversationID,
		WorkspaceID:          document.WorkspaceID,
		WorkspaceName:        workspaceSummary.DisplayName,
		Title:                document.Title,
		TopicDescriptor:      document.TopicDescriptor,
		RecentUserRequests:   recentRequests(snapshot),
		RecentFinalSummaries: recentSummaries(snapshot),
		UpdatedAt:            document.UpdatedAt,
		Status:               snapshot.Conversation.Status,
		OpenPaneIDs:          paneIDs(bindings),
		Branch:               cloneBranch(snapshot.Branch),
	}, nil
}

func recentRequests(snapshot conversation.ConversationSnapshot) []string {
	result := make([]string, 0, recentTextCount)
	for index := len(snapshot.Turns.Turns) - 1; index >= 0 && len(result) < recentTextCount; index-- {
		result = append(result, snapshot.Turns.Turns[index].AuthoredInput.Text)
	}
	reverse(result)
	return result
}

func recentSummaries(snapshot conversation.ConversationSnapshot) []string {
	result := make([]string, 0, recentTextCount)
	for index := len(snapshot.Narration.Events) - 1; index >= 0 && len(result) < recentTextCount; index-- {
		if summary := snapshot.Narration.Events[index].FinalSummary; summary != nil {
			result = append(result, summary.Text)
		}
	}
	reverse(result)
	return result
}

func paneIDs(bindings []conversation.PaneBinding) []string {
	result := make([]string, 0, len(bindings))
	for _, binding := range bindings {
		result = append(result, binding.PaneID)
	}
	sort.Strings(result)
	return result
}

func cloneBranch(branch *conversation.ConversationBranch) *conversation.ConversationBranch {
	if branch == nil {
		return nil
	}
	copy := *branch
	copy.ProviderMetadata = cloneStringMap(branch.ProviderMetadata)
	return &copy
}

func cloneStringMap(values map[string]string) map[string]string {
	result := make(map[string]string, len(values))
	for key, value := range values {
		result[key] = value
	}
	return result
}

func reverse(values []string) {
	for left, right := 0, len(values)-1; left < right; left, right = left+1, right-1 {
		values[left], values[right] = values[right], values[left]
	}
}
