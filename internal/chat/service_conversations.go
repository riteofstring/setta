package chat

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

func (service *Service) ListConversations(workspaceID string) (ConversationListResult, error) {
	if _, err := service.resolveWorkspaceForRequest(workspaceID); err != nil {
		return ConversationListResult{}, err
	}
	conversations, corruptConversations, err := service.store.scanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, "", "")
		return ConversationListResult{}, err
	}
	runs, corruptRuns, err := service.validRunsForWorkspaceList(workspaceID)
	if err != nil {
		return ConversationListResult{}, err
	}
	pins, err := service.store.LoadConversationPins(workspaceID)
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, "", "")
		return ConversationListResult{}, err
	}
	findings := append([]CorruptStateFinding{}, corruptConversations...)
	findings = append(findings, corruptRuns...)
	items := make([]ConversationListItem, 0, len(conversations))
	activeRunLivenessByConversation := service.activeRunLivenessForConversationList(workspaceID, runs)
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
		activeRunID := ""
		var activeRunLiveness *RunLiveness
		if run, ok := activeRunFromRuns(runs, conversation.ID); ok {
			activeRunID = run.ID
			if liveness, ok := activeRunLivenessByConversation[conversation.ID]; ok {
				snapshot := liveness
				activeRunLiveness = &snapshot
			}
		}
		items = append(items, ConversationListItem{
			Conversation:             conversation,
			MessageCount:             count,
			ActiveRunID:              activeRunID,
			ActiveRunLiveness:        activeRunLiveness,
			PinnedAt:                 pins[conversation.ID],
			ReadMarker:               readState.ReadMarker,
			LatestReadRelevantMarker: readState.LatestReadRelevantMarker,
		})
	}
	sortConversationListItems(items)
	diagnostics := service.recordCorruptStateFindings(findings)
	return ConversationListResult{
		Conversations: items,
		Corruption:    corruptionSummary(findings),
		Diagnostics:   diagnostics,
	}, nil
}

func (service *Service) CreateConversation(workspaceID string, title string) (Conversation, error) {
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
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
	codexDefaults := service.currentChatCodexDefaultSettings()
	conversation.CodexSettings = &codexDefaults
	conversation, err = service.conversationWithResolvedEffectiveSettings(context.Background(), workspaceSummary, conversation)
	if err != nil {
		return Conversation{}, err
	}
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if err := service.publishConversationUpdated(workspaceID, conversation.ID, ""); err != nil {
		return Conversation{}, err
	}
	return conversation, nil
}

func (service *Service) DeleteConversation(workspaceID string, conversationID string) (ConversationListResult, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return ConversationListResult{}, err
	}
	service.mu.Lock()
	if err := service.ensureConversationCanDeleteLocked(workspaceID, conversationID); err != nil {
		service.mu.Unlock()
		return ConversationListResult{}, err
	}
	err := service.store.DeleteConversation(workspaceID, conversationID)
	service.mu.Unlock()
	if err != nil {
		return ConversationListResult{}, err
	}
	return service.ListConversations(workspaceID)
}

func (service *Service) SetConversationPinned(workspaceID string, conversationID string, pinned bool) (ConversationListItem, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return ConversationListItem{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	if _, err := service.store.LoadConversation(workspaceID, conversationID); err != nil {
		return ConversationListItem{}, err
	}
	pinnedAt := ""
	if pinned {
		pinnedAt = timestamp(service.now())
	}
	if err := service.store.SetConversationPinnedAt(workspaceID, conversationID, pinnedAt); err != nil {
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

func (service *Service) LoadMessagePage(workspaceID string, conversationID string, beforeBlockOrdinal int, limit int) (MessagePage, error) {
	if limit == 0 {
		limit = defaultPageLimit
	}
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return MessagePage{}, err
	}
	service.mu.Lock()
	page, err := service.loadMessagePageLocked(workspaceID, conversationID, beforeBlockOrdinal, limit)
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, conversationID, "")
		return MessagePage{}, err
	}
	page.Conversation, err = service.conversationWithResolvedEffectiveSettings(context.Background(), workspaceSummary, page.Conversation)
	if err != nil {
		return MessagePage{}, err
	}
	return page, nil
}

func (service *Service) LoadRunTranscriptPage(workspaceID string, runID string, beforeBlockOrdinal int, limit int) (RunTranscriptPage, error) {
	if limit == 0 {
		limit = defaultPageLimit
	}
	if limit < 0 {
		return RunTranscriptPage{}, fmt.Errorf("run transcript page limit must not be negative: %d", limit)
	}
	if _, err := service.validateRunRequest(workspaceID, runID); err != nil {
		return RunTranscriptPage{}, err
	}
	service.mu.Lock()
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunTranscriptPage{}, err
	}
	activeRunID := service.activeBlockRunIDLocked(workspaceID, run.ConversationID)
	refs, err := service.runBlockRefsLocked(workspaceID, run.ConversationID, runID, runID == activeRunID)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, runID)
		return RunTranscriptPage{}, err
	}
	start, end := transcriptBlockWindow(len(refs), beforeBlockOrdinal, limit)
	blocks, err := service.materializeTranscriptBlockRefs(workspaceID, refs[start:end])
	cursor := service.events.Cursor()
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, runID)
		return RunTranscriptPage{}, err
	}
	olderBeforeBlockOrdinal := 0
	if len(blocks) > 0 {
		olderBeforeBlockOrdinal = start + 1
	}
	return RunTranscriptPage{
		WorkspaceID:             workspaceID,
		ConversationID:          run.ConversationID,
		RunID:                   runID,
		LastChatEventStreamID:   cursor.StreamID,
		LastChatEventSequence:   cursor.Sequence,
		Blocks:                  blocks,
		HasMoreOlder:            start > 0,
		OlderBeforeBlockOrdinal: olderBeforeBlockOrdinal,
	}, nil
}

// loadMessagePageLocked composes the message page. The transcript is the ordered
// block stream paged by block ordinal; beforeOrdinal is the conversation-sequential
// block cursor. Messages remain the latest window for non-transcript surfaces
// (queue, commands) and are not load-bearing for transcript rendering.
func (service *Service) loadMessagePageLocked(workspaceID string, conversationID string, beforeBlockOrdinal int, limit int) (MessagePage, error) {
	page, err := service.store.LoadMessagePage(workspaceID, conversationID, 0, limit)
	if err != nil {
		return MessagePage{}, err
	}
	page = service.overlayActiveAssistantMessageLocked(workspaceID, conversationID, 0, page)
	blocks, hasMoreOlder, olderBeforeBlockOrdinal, err := service.loadTranscriptBlockWindowLocked(workspaceID, conversationID, beforeBlockOrdinal, limit)
	if err != nil {
		return MessagePage{}, err
	}
	page.Blocks = blocks
	page.HasMoreOlder = hasMoreOlder
	page.OlderBeforeBlockOrdinal = olderBeforeBlockOrdinal
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
	draft, ok, err := service.conversationUpdatedEventLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	_, err = service.events.Publish(draft)
	return err
}

func (service *Service) conversationUpdatedEventLocked(workspaceID string, conversationID string, runID string) (EventDraft, bool, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return EventDraft{}, false, err
	}
	if conversation.Internal {
		return EventDraft{}, false, nil
	}
	item, err := service.conversationListItemFromConversationLocked(conversation)
	if err != nil {
		return EventDraft{}, false, err
	}
	return NewConversationUpdatedEvent(workspaceID, conversationID, runID, item), true, nil
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
	var activeRunLiveness *RunLiveness
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	if run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return ConversationListItem{}, err
	} else if ok {
		activeRunID = run.ID
		activeRunLiveness = service.activeRunLivenessLocked(workspaceID, conversationID, run)
	}
	readState, err := service.store.LoadConversationReadState(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	pins, err := service.store.LoadConversationPins(workspaceID)
	if err != nil {
		return ConversationListItem{}, err
	}
	return ConversationListItem{
		ActiveRunID:              activeRunID,
		ActiveRunLiveness:        activeRunLiveness,
		Conversation:             conversation,
		MessageCount:             count,
		PinnedAt:                 pins[conversationID],
		ReadMarker:               readState.ReadMarker,
		LatestReadRelevantMarker: readState.LatestReadRelevantMarker,
	}, nil
}

func (service *Service) ensureConversationCanDeleteLocked(workspaceID string, conversationID string) error {
	key := activeKey(workspaceID, conversationID)
	if _, ok := service.active[key]; ok {
		return fmt.Errorf("conversation %s has an active run", conversationID)
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	for _, run := range runs {
		if run.Status == RunStatusRunning || run.Status == RunStatusQueued {
			return fmt.Errorf("conversation %s has %s run %s", conversationID, run.Status, run.ID)
		}
	}
	return nil
}

func sortConversationListItems(items []ConversationListItem) {
	sort.SliceStable(items, func(left int, right int) bool {
		leftItem := items[left]
		rightItem := items[right]
		if leftItem.PinnedAt != "" || rightItem.PinnedAt != "" {
			if leftItem.PinnedAt == rightItem.PinnedAt {
				if leftItem.Conversation.UpdatedAt == rightItem.Conversation.UpdatedAt {
					return leftItem.Conversation.ID < rightItem.Conversation.ID
				}
				return leftItem.Conversation.UpdatedAt > rightItem.Conversation.UpdatedAt
			}
			if leftItem.PinnedAt == "" {
				return false
			}
			if rightItem.PinnedAt == "" {
				return true
			}
			return leftItem.PinnedAt > rightItem.PinnedAt
		}
		if leftItem.Conversation.UpdatedAt == rightItem.Conversation.UpdatedAt {
			return leftItem.Conversation.ID < rightItem.Conversation.ID
		}
		return leftItem.Conversation.UpdatedAt > rightItem.Conversation.UpdatedAt
	})
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
