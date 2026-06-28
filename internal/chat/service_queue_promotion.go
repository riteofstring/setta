package chat

import (
	"context"

	"setta/internal/workspace"
)

type queuedPromotionCandidate struct {
	Conversation Conversation
	Run          Run
	UserMessage  ChatMessage
}

func (service *Service) promoteQueuedIfIdle(workspaceSummary workspace.WorkspaceSummary, conversationID string) error {
	candidate, ok, err := service.nextQueuedPromotionCandidateIfIdle(workspaceSummary.ID, conversationID)
	if err != nil || !ok {
		return err
	}
	input, err := inputFromMessage(candidate.UserMessage)
	if err != nil {
		return err
	}
	if err := service.ensureImageInputSupported(context.Background(), workspaceSummary, candidate.Conversation, input); err != nil {
		return err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	runs, err := service.queuedPromotionRunsIfIdleLocked(workspaceSummary.ID, conversationID)
	if err != nil || runs == nil {
		return err
	}
	current, ok, err := service.nextQueuedPromotionCandidateLocked(workspaceSummary.ID, conversationID, runs)
	if err != nil || !ok {
		return err
	}
	if current.Run.ID != candidate.Run.ID || current.UserMessage.ID != candidate.UserMessage.ID {
		return nil
	}
	return service.promoteNextQueuedRunLocked(workspaceSummary, conversationID, runs)
}

func (service *Service) nextQueuedPromotionCandidateIfIdle(workspaceID string, conversationID string) (queuedPromotionCandidate, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	runs, err := service.queuedPromotionRunsIfIdleLocked(workspaceID, conversationID)
	if err != nil || runs == nil {
		return queuedPromotionCandidate{}, false, err
	}
	return service.nextQueuedPromotionCandidateLocked(workspaceID, conversationID, runs)
}

func (service *Service) queuedPromotionRunsIfIdleLocked(workspaceID string, conversationID string) ([]Run, error) {
	if service.shuttingDown {
		return nil, nil
	}
	if service.hasActiveTurnLocked(workspaceID, conversationID) {
		return nil, nil
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	if _, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return nil, err
	} else if ok {
		return nil, nil
	}
	return runs, nil
}

func (service *Service) nextQueuedPromotionCandidateLocked(workspaceID string, conversationID string, runs []Run) (queuedPromotionCandidate, bool, error) {
	run, userMessage, ok, err := service.nextQueuedRunFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil || !ok {
		return queuedPromotionCandidate{}, ok, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return queuedPromotionCandidate{}, false, err
	}
	return queuedPromotionCandidate{
		Conversation: conversation,
		Run:          run,
		UserMessage:  userMessage,
	}, true, nil
}
