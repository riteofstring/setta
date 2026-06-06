package chat

import (
	"errors"
	"fmt"
	"strings"
)

func (service *Service) DeleteConversation(workspaceID string, conversationID string) (ConversationListResult, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return ConversationListResult{}, err
	}
	if strings.TrimSpace(conversationID) == "" {
		return ConversationListResult{}, errors.New("conversation id is required")
	}

	if err := service.archiveConversation(workspaceID, conversationID); err != nil {
		return ConversationListResult{}, err
	}
	return service.listConversations(workspaceID)
}

func (service *Service) archiveConversation(workspaceID string, conversationID string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	runs, err := service.runsForConversationForArchiveLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	if err := service.rejectConversationArchiveWithLiveRunLocked(workspaceID, conversationID, runs); err != nil {
		return err
	}

	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, "")
		return err
	}
	if conversation.ArchivedAt != "" {
		return nil
	}

	now := timestamp(service.now())
	conversation.ArchivedAt = now
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, "")
}

func (service *Service) runsForConversationForArchiveLocked(workspaceID string, conversationID string) ([]Run, error) {
	runs, corrupt, err := service.store.ScanRunsForConversationAllowingCorrupt(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	for _, finding := range corrupt {
		service.recordCorruptStateFindingLocked(finding)
	}
	return runs, nil
}

func (service *Service) rejectConversationArchiveWithLiveRunLocked(workspaceID string, conversationID string, runs []Run) error {
	if active, ok := service.active[activeKey(workspaceID, conversationID)]; ok && active.workspaceID == workspaceID {
		return fmt.Errorf("cannot delete conversation %s while run %s is active", conversationID, active.runID)
	}
	for _, run := range runs {
		if run.Status == RunStatusQueued {
			return fmt.Errorf("cannot delete conversation %s while run %s is queued", conversationID, run.ID)
		}
	}
	if run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return err
	} else if ok {
		return fmt.Errorf("cannot delete conversation %s while run %s is active", conversationID, run.ID)
	}
	return nil
}
