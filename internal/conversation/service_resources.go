package conversation

import (
	"context"
)

func (service *Service) BindFolderResource(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if _, err := service.workspaces.ResolveActiveWorkspace(workspaceID); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.store.ReadSnapshotByID(ctx, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if snapshot.Conversation.WorkspaceID != nil {
		if *snapshot.Conversation.WorkspaceID != workspaceID {
			return ConversationSnapshot{}, stateConflict(
				"conversation folder binding",
				conversationID,
				"conversation already belongs to another workspace",
			)
		}
		return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
	}
	conversation := snapshot.Conversation
	conversation.WorkspaceID = cloneStringPointer(&workspaceID)
	conversation.UpdatedAt = advanceTimestamp(conversation.UpdatedAt, service.timestamp())
	publications, err := service.publications(
		conversation.ID,
		conversation.UpdatedAt,
		ConversationUpdatedEventPayload{
			Type:         ConversationEventTypeConversationUpdated,
			Conversation: conversation,
		},
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	_, err = service.store.Transact(ctx, "bind conversation folder resource", func(transaction *WriteTransaction) error {
		if err := transaction.BindConversationWorkspace(ConversationExpectation{
			UpdatedAt:              snapshot.Conversation.UpdatedAt,
			LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
		}, conversation); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}
