package chat

import (
	"fmt"
	"strings"
)

func (service *Service) ListConversations(workspaceID string) (ConversationListResult, error) {
	if _, err := service.resolveWorkspaceForRequest(workspaceID); err != nil {
		return ConversationListResult{}, err
	}
	conversations, corruptConversations, err := service.store.ScanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, "", "")
		return ConversationListResult{}, err
	}
	runs, corruptRuns, err := service.validRunsForWorkspaceList(workspaceID)
	if err != nil {
		return ConversationListResult{}, err
	}
	findings := append([]CorruptStateFinding{}, corruptConversations...)
	findings = append(findings, corruptRuns...)
	items := make([]ConversationListItem, 0, len(conversations))
	for _, conversation := range conversations {
		if conversation.Internal {
			continue
		}
		count, corruptMessages, err := service.store.MessageCountAllowingCorrupt(workspaceID, conversation.ID)
		if err != nil {
			service.recordCorruptStateDiagnostic(err, workspaceID, conversation.ID, "")
			return ConversationListResult{}, err
		}
		findings = append(findings, corruptMessages...)
		readState, err := service.store.LoadConversationReadState(workspaceID, conversation.ID)
		if err != nil {
			service.recordCorruptStateDiagnostic(err, workspaceID, conversation.ID, "")
			return ConversationListResult{}, err
		}
		items = append(items, ConversationListItem{
			Conversation:             conversation,
			MessageCount:             count,
			ActiveRunID:              activeRunIDFromRuns(runs, conversation.ID),
			ReadMarker:               readState.ReadMarker,
			LatestReadRelevantMarker: readState.LatestReadRelevantMarker,
		})
	}
	diagnostics := service.recordCorruptStateFindings(findings)
	return ConversationListResult{
		Conversations: items,
		Corruption:    corruptionSummary(findings),
		Diagnostics:   diagnostics,
	}, nil
}

func (service *Service) CreateConversation(workspaceID string, title string) (Conversation, error) {
	if _, err := service.resolveWorkspaceForRequest(workspaceID); err != nil {
		return Conversation{}, err
	}
	now := timestamp(service.now())
	id, err := service.newID("conversation")
	if err != nil {
		return Conversation{}, fmt.Errorf("create conversation id: %w", err)
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "New chat"
	}
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            id,
		WorkspaceID:   workspaceID,
		Title:         title,
		CreatedAt:     now,
		UpdatedAt:     now,
		ArchivedAt:    "",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if err := service.publishConversationUpdated(workspaceID, conversation.ID, ""); err != nil {
		return Conversation{}, err
	}
	return conversation, nil
}

func (service *Service) MarkConversationRead(workspaceID string, conversationID string) (ConversationListItem, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return ConversationListItem{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	if _, err := service.store.LoadConversation(workspaceID, conversationID); err != nil {
		return ConversationListItem{}, err
	}
	if err := service.markConversationReadLocked(workspaceID, conversationID, timestamp(service.now())); err != nil {
		return ConversationListItem{}, err
	}
	item, err := service.conversationListItemLocked(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	if !item.Conversation.Internal {
		_, err = service.events.Publish(NewConversationUpdatedEvent(workspaceID, conversationID, "", item))
	}
	return item, err
}

func (service *Service) LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (MessagePage, error) {
	if limit == 0 {
		limit = defaultPageLimit
	}
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return MessagePage{}, err
	}
	service.mu.Lock()
	page, err := service.loadMessagePageLocked(workspaceID, conversationID, beforeOrdinal, limit)
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, conversationID, "")
		return MessagePage{}, err
	}
	return page, nil
}

func (service *Service) loadMessagePageLocked(workspaceID string, conversationID string, beforeOrdinal int, limit int) (MessagePage, error) {
	page, err := service.store.LoadMessagePage(workspaceID, conversationID, beforeOrdinal, limit)
	if err != nil {
		return MessagePage{}, err
	}
	page = service.overlayActiveAssistantMessageLocked(workspaceID, conversationID, beforeOrdinal, page)
	if err := service.attachPageState(workspaceID, conversationID, &page); err != nil {
		return MessagePage{}, err
	}
	return page, nil
}

func (service *Service) publishConversationUpdated(workspaceID string, conversationID string, runID string) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}

func (service *Service) publishConversationUpdatedLocked(workspaceID string, conversationID string, runID string) error {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	if conversation.Internal {
		return nil
	}
	item, err := service.conversationListItemFromConversationLocked(conversation)
	if err != nil {
		return err
	}
	_, err = service.events.Publish(NewConversationUpdatedEvent(workspaceID, conversationID, runID, item))
	return err
}

func (service *Service) conversationListItemLocked(workspaceID string, conversationID string) (ConversationListItem, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	return service.conversationListItemFromConversationLocked(conversation)
}

func (service *Service) conversationListItemFromConversationLocked(conversation Conversation) (ConversationListItem, error) {
	workspaceID := conversation.WorkspaceID
	conversationID := conversation.ID
	count, err := service.store.MessageCount(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	activeRunID := ""
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	if run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return ConversationListItem{}, err
	} else if ok {
		activeRunID = run.ID
	}
	readState, err := service.store.LoadConversationReadState(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	return ConversationListItem{
		ActiveRunID:              activeRunID,
		Conversation:             conversation,
		MessageCount:             count,
		ReadMarker:               readState.ReadMarker,
		LatestReadRelevantMarker: readState.LatestReadRelevantMarker,
	}, nil
}

func (service *Service) advanceReadRelevantMarkerLocked(workspaceID string, conversationID string, now string) error {
	state, err := service.store.LoadConversationReadState(workspaceID, conversationID)
	if err != nil {
		return err
	}
	state.LatestReadRelevantMarker += 1
	state.UpdatedAt = now
	return service.store.SaveConversationReadState(workspaceID, state)
}

func (service *Service) markConversationReadLocked(workspaceID string, conversationID string, now string) error {
	state, err := service.store.LoadConversationReadState(workspaceID, conversationID)
	if err != nil {
		return err
	}
	state.ReadMarker = state.LatestReadRelevantMarker
	state.UpdatedAt = now
	return service.store.SaveConversationReadState(workspaceID, state)
}
