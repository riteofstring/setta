package conversation

import (
	"context"
	"fmt"
)

func (service *Service) ArchiveTopic(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()

	snapshot, err := service.store.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.archiveConversationSnapshot(ctx, snapshot); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

// archiveConversationSnapshot retires one conversation the caller already read
// and locked. Archiving an archived conversation is the state the caller asked
// for, so it is a no-op rather than a conflict.
func (service *Service) archiveConversationSnapshot(
	ctx context.Context,
	snapshot ConversationSnapshot,
) error {
	conversationID := snapshot.Conversation.ID
	if snapshot.Conversation.ArchivedAt != nil {
		return nil
	}
	if err := service.validateArchiveSnapshot(snapshot); err != nil {
		return err
	}

	archivedAt := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	archived := snapshot.Conversation
	archived.ArchivedAt = &archivedAt
	archived.UpdatedAt = archivedAt
	publications, err := service.publications(
		conversationID,
		archivedAt,
		ConversationUpdatedEventPayload{
			Type:         ConversationEventTypeConversationUpdated,
			Conversation: archived,
		},
	)
	if err != nil {
		return err
	}
	_, err = service.store.transactPresentationAware(ctx, "archive topic conversation", func(transaction *WriteTransaction) error {
		if err := requireArchiveRoutingSettled(transaction, conversationID); err != nil {
			return err
		}
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
			},
			archived,
		); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	return err
}

func requireArchiveRoutingSettled(transaction *WriteTransaction, conversationID string) error {
	var pending bool
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT
  EXISTS(
    SELECT 1
    FROM conversation_inputs
    WHERE conversation_id = ? AND status IN (?, ?)
  )
  OR EXISTS(
    SELECT 1
    FROM conversation_route_decisions AS decision
    LEFT JOIN conversation_route_command_completions AS completion
      ON completion.decision_id = decision.id
    WHERE decision.conversation_id = ? AND completion.decision_id IS NULL
  )
`,
		conversationID,
		ConversationInputStatusAccepted,
		ConversationInputStatusRouting,
		conversationID,
	).Scan(&pending)
	if err != nil {
		return fmt.Errorf("read conversation input routing state before archive: %w", err)
	}
	if pending {
		return &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "conversation input routing must settle before archiving",
		}
	}
	return nil
}

func (service *Service) validateArchiveSnapshot(snapshot ConversationSnapshot) error {
	conversationID := snapshot.Conversation.ID
	if service.activeFor(conversationID) != nil ||
		snapshot.Conversation.Status == ConversationStatusWorking ||
		snapshot.Conversation.Status == ConversationStatusWaitingForApproval {
		return &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "active conversation work must finish or be stopped before archiving",
		}
	}
	if len(snapshot.Queue) != 0 {
		return &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "queued conversation work must finish before archiving",
		}
	}
	for _, side := range snapshot.SideConversations {
		if side.DisposedAt == nil {
			return &CommandConflictError{
				ConversationID: conversationID,
				Reason:         fmt.Sprintf("side conversation %s must be disposed before archiving", side.ID),
			}
		}
	}
	return nil
}
