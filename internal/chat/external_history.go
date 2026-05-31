package chat

import (
	"errors"
	"os"
	"sort"

	"setta/internal/workspace"
)

type ExternalHistoryProvider interface {
	ListConversations(workspace workspace.WorkspaceSummary) ([]ConversationListItem, error)
	LoadConversation(workspace workspace.WorkspaceSummary, conversationID string) (ExternalConversation, error)
	OwnsConversation(conversationID string) bool
}

type ExternalConversation struct {
	Conversation Conversation
	Messages     []ChatMessage
}

func (service *Service) externalConversationItems(workspace workspace.WorkspaceSummary, stored []Conversation) ([]ConversationListItem, error) {
	if service.externalHistory == nil {
		return []ConversationListItem{}, nil
	}
	external, err := service.externalHistory.ListConversations(workspace)
	if err != nil {
		return nil, err
	}
	if len(external) == 0 {
		return []ConversationListItem{}, nil
	}
	storedIDs := make(map[string]bool, len(stored))
	storedThreadIDs := map[string]bool{}
	for _, conversation := range stored {
		storedIDs[conversation.ID] = true
		for _, ref := range conversation.HarnessRefs {
			if ref.ThreadID != "" {
				storedThreadIDs[ref.ThreadID] = true
			}
		}
	}
	items := make([]ConversationListItem, 0, len(external))
	for _, item := range external {
		if storedIDs[item.Conversation.ID] || hasStoredThreadRef(item.Conversation, storedThreadIDs) {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

func hasStoredThreadRef(conversation Conversation, storedThreadIDs map[string]bool) bool {
	for _, ref := range conversation.HarnessRefs {
		if ref.ThreadID != "" && storedThreadIDs[ref.ThreadID] {
			return true
		}
	}
	return false
}

func sortConversationListItems(items []ConversationListItem) []ConversationListItem {
	sorted := append([]ConversationListItem{}, items...)
	sort.SliceStable(sorted, func(left int, right int) bool {
		leftConversation := sorted[left].Conversation
		rightConversation := sorted[right].Conversation
		if leftConversation.UpdatedAt == rightConversation.UpdatedAt {
			return leftConversation.ID < rightConversation.ID
		}
		return leftConversation.UpdatedAt > rightConversation.UpdatedAt
	})
	return sorted
}

func (service *Service) ownsExternalConversation(conversationID string) bool {
	return service.externalHistory != nil && service.externalHistory.OwnsConversation(conversationID)
}

func (service *Service) materializeExternalConversationLocked(workspace workspace.WorkspaceSummary, conversationID string) error {
	if !service.ownsExternalConversation(conversationID) {
		return nil
	}
	if _, err := service.store.LoadConversation(workspace.ID, conversationID); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	external, err := service.externalHistory.LoadConversation(workspace, conversationID)
	if err != nil {
		return err
	}
	if err := service.store.SaveConversation(external.Conversation); err != nil {
		return err
	}
	for _, message := range external.Messages {
		if err := service.store.SaveMessage(workspace.ID, message); err != nil {
			return err
		}
	}
	return nil
}
