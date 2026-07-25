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
// runs one way. Every operation takes the ids trusted product code minted
// before the decision was committed, which is what makes a decision and the
// effect it authorized address the same turn after a crash.

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
	snapshot, err := service.store.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	failed, err := failedDirectorTurn(snapshot, failedTurnID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.sendTurn(ctx, workspaceID, conversationID, failed.AuthoredInput.Text, turnID)
}

func failedDirectorTurn(snapshot ConversationSnapshot, failedTurnID string) (ConversationTurn, error) {
	for _, turn := range snapshot.Turns.Turns {
		if turn.ID != failedTurnID {
			continue
		}
		if turn.Status != TurnStatusFailed {
			return ConversationTurn{}, stateConflict(
				"director recovery",
				failedTurnID,
				"recovered turn is not failed",
			)
		}
		return turn, nil
	}
	return ConversationTurn{}, stateConflict(
		"director recovery",
		failedTurnID,
		"recovered turn is outside the durable window",
	)
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
