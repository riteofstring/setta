package conversation

import (
	"context"
	"errors"
	"fmt"
)

// The durable operations the Director command center carries decisions out
// with.
//
// The Director owns its own execution port; this is the conversation service's
// side of it, stated in the conversation's own vocabulary so the dependency
// runs one way. Every operation takes identities minted by trusted product
// code, so provider output can only address durable records the app owns.

// DirectorWorkstreamStart creates the durable conversation one workstream runs
// on. Parentage is optional and independent of history: a root workstream has
// neither, a delegated child has a parent and no fork point, and a fork has
// both.
type DirectorWorkstreamStart struct {
	ConversationID string
	Title          string
	// WorkspaceID is the folder resource the conversation is scoped to. A nil
	// workspace is a folderless conversation, which is a first-class workstream
	// that cannot run work until a folder is bound.
	WorkspaceID *string
	// ParentConversationID is the authorized parent, empty for a root
	// workstream.
	ParentConversationID string
	// ForkedAtTurnID is the completed parent turn a fork carries forward, empty
	// for every other origin.
	ForkedAtTurnID string
}

// StartDirectorWorkstream creates the durable substrate for one new workstream.
// It starts no turn: a folderless workstream exists and is selectable before it
// can run anything, so creating it and delivering its first work are separate
// durable facts.
func (service *Service) StartDirectorWorkstream(
	ctx context.Context,
	request DirectorWorkstreamStart,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("director workstream conversation id", request.ConversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	if request.ForkedAtTurnID != "" {
		return service.startForkedDirectorWorkstream(ctx, request)
	}
	if request.ParentConversationID == "" {
		return service.createTopicWithBranch(ctx, request.WorkspaceID, request.Title, request.ConversationID, nil)
	}
	if err := validateIdentifier("director parent conversation id", request.ParentConversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	branch := ConversationBranch{
		ChildConversationID:  request.ConversationID,
		ParentConversationID: request.ParentConversationID,
		Kind:                 BranchKindChild,
		DecisionSource:       BranchDecisionSourceDirector,
		// A delegated child inherits no provider thread, so it carries no
		// provider metadata to describe one.
		ProviderMetadata: map[string]string{},
		CreatedAt:        service.timestamp(),
	}
	return service.createTopicWithBranch(ctx, request.WorkspaceID, request.Title, request.ConversationID, &branch)
}

// startForkedDirectorWorkstream carries one completed parent run forward. A
// fork resumes the parent's provider history, which only exists inside a folder
// resource, so a folderless parent reports the resource its fork is waiting on
// rather than failing.
func (service *Service) startForkedDirectorWorkstream(
	ctx context.Context,
	request DirectorWorkstreamStart,
) (ConversationSnapshot, error) {
	if request.WorkspaceID == nil {
		return ConversationSnapshot{}, &ResourceRequiredError{
			ConversationID: request.ParentConversationID,
			ResourceKind:   "folder",
		}
	}
	return service.ExecuteBranchDecision(
		ctx,
		*request.WorkspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: request.ParentConversationID,
			ChildConversationID:  &request.ConversationID,
			Source:               BranchDecisionSourceDirector,
		},
		BranchDecision{
			Kind: BranchDecisionKindForkConversation,
			ForkConversation: &ForkConversationBranchDecision{
				ForkedAtTurnID: request.ForkedAtTurnID,
				ProposedTitle:  request.Title,
			},
		},
	)
}

// SendDirectorTurn starts a run on a conversation with no active turn.
func (service *Service) SendDirectorTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
	turnID string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.sendTurn(ctx, workspaceID, conversationID, text, turnID)
}

// QueueDirectorTurn preserves the active turn and queues work behind it.
func (service *Service) QueueDirectorTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
	turnID string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.queueRoutedTurn(ctx, workspaceID, conversationID, text, turnID)
}

// SteerDirectorTurn changes the instruction of the active turn.
func (service *Service) SteerDirectorTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
	targetTurnID string,
	decisionID string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.steerTurn(ctx, workspaceID, conversationID, text, targetTurnID, decisionID)
}

// CancelDirectorTurn stops the turn the user asked to stop. The turn is named,
// because the user cancelled the run they were shown and a conversation promotes
// queued work as soon as the previous turn ends.
func (service *Service) CancelDirectorTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	targetTurnID string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("director cancelled turn id", targetTurnID); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.stopTurn(ctx, workspaceID, conversationID, targetTurnID)
}

// SubmitDirectorApproval answers one approval the named turn is waiting on.
// Secret answers reach the provider path that requested them; the durable
// resolution this writes carries them redacted.
func (service *Service) SubmitDirectorApproval(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	targetTurnID string,
	response ConversationApprovalResponse,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("director approved turn id", targetTurnID); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.submitApproval(ctx, workspaceID, conversationID, targetTurnID, response)
}

// RecoverDirectorTurn restarts the work a failed turn was carrying. The failed
// turn's own authored input is the work: the Director recovers a path, so
// re-authoring the request the user already made would recover something else.
func (service *Service) RecoverDirectorTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	failedTurnID string,
	turnID string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("director recovered turn id", failedTurnID); err != nil {
		return ConversationSnapshot{}, err
	}
	failed, _, found, err := service.store.readConversationTurn(ctx, conversationID, failedTurnID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if !found {
		return ConversationSnapshot{}, stateConflict(
			"director recovery",
			failedTurnID,
			"recovered turn does not exist in the conversation",
		)
	}
	if failed.Status != TurnStatusFailed {
		return ConversationSnapshot{}, stateConflict(
			"director recovery",
			failedTurnID,
			"recovered turn is not failed",
		)
	}
	return service.sendTurn(ctx, workspaceID, conversationID, failed.AuthoredInput.Text, turnID)
}

// RenameDirectorWorkstream retitles the conversation one workstream runs on.
// It is addressed by conversation alone rather than by workspace, because a
// title belongs to a folderless workstream exactly as much as to a bound one.
// The new title reaches the app through the republished conversation record,
// which is also where the registry reads every other title from.
func (service *Service) RenameDirectorWorkstream(
	ctx context.Context,
	conversationID string,
	title string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("director renamed conversation id", conversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateTopicTitle(title); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.store.ReadSnapshotByID(ctx, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if snapshot.Conversation.ArchivedAt != nil {
		return ConversationSnapshot{}, stateConflict(
			"director workstream rename",
			conversationID,
			"archived conversations cannot be renamed",
		)
	}
	if snapshot.Conversation.Title == title {
		return snapshot, nil
	}
	renamed := snapshot.Conversation
	renamed.Title = title
	renamed.UpdatedAt = advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	publications, err := service.publications(
		conversationID,
		renamed.UpdatedAt,
		ConversationUpdatedEventPayload{
			Type:         ConversationEventTypeConversationUpdated,
			Conversation: renamed,
		},
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	_, err = service.store.Transact(ctx, "rename director workstream", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
			},
			renamed,
		); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshotByID(ctx, conversationID)
}

// ArchiveDirectorWorkstream retires the conversation one workstream runs on. It
// is addressed by conversation alone for the same reason a rename is: work the
// user no longer wants may never have been given a folder at all.
func (service *Service) ArchiveDirectorWorkstream(
	ctx context.Context,
	conversationID string,
) (ConversationSnapshot, error) {
	if err := validateDirectorRequest(service, ctx); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("director archived conversation id", conversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.store.ReadSnapshotByID(ctx, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.archiveConversationSnapshot(ctx, snapshot); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshotByID(ctx, conversationID)
}

func validateDirectorRequest(service *Service, ctx context.Context) error {
	if service == nil {
		return errors.New("conversation service is required")
	}
	if ctx == nil {
		return fmt.Errorf("director command context is required")
	}
	return service.requireOpen()
}
