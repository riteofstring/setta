package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// executeBranchDecision creates a child conversation that continues the parent
// from one completed Setta turn.
//
// The branch point is a Setta turn id and nothing else. The child gets no
// provider thread here: its first turn starts an ephemeral carrier and replays
// the parent's Setta history up to this boundary, so branching costs the product
// no provider history and works the same whether or not the parent ever ran in
// this process.
func (service *Service) executeBranchDecision(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	forkedAtTurnID string,
	title string,
	requestedChildConversationID *string,
	decisionSource BranchDecisionSource,
) (ConversationSnapshot, error) {
	sourceTrajectorySequence, err := service.branchSourceTrajectorySequence(
		ctx,
		workspaceID,
		parentConversationID,
		forkedAtTurnID,
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	childConversationID, err := service.branchConversationID(
		requestedChildConversationID,
		"conversation",
		"routed child conversation id",
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}

	now := service.timestamp()
	conversation := TopicConversation{
		ID:              childConversationID,
		WorkspaceID:     &workspaceID,
		Title:           title,
		TopicDescriptor: title,
		Status:          ConversationStatusIdle,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	narrator := NarratorState{
		ConversationID:  childConversationID,
		TopicDescriptor: title,
		Status:          NarratorStatusReady,
		UpdatedAt:       now,
	}
	branch := ConversationBranch{
		ChildConversationID:      childConversationID,
		ParentConversationID:     parentConversationID,
		Kind:                     BranchKindFork,
		DecisionSource:           decisionSource,
		ForkedAtTurnID:           forkedAtTurnID,
		SourceTrajectorySequence: sourceTrajectorySequence,
		CreatedAt:                now,
	}

	service.createMu.Lock()
	var presentation ConversationPresentationProfile
	err = service.store.withPresentationConfigurationLock(func() error {
		var presentationErr error
		presentation, presentationErr = service.initialPresentationProfile(
			ctx,
			childConversationID,
			now,
		)
		if presentationErr != nil {
			return presentationErr
		}
		return service.persistCreatedConversation(
			ctx,
			conversation,
			narrator,
			presentation,
			&branch,
		)
	})
	service.createMu.Unlock()
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, childConversationID)
}

// branchSourceTrajectorySequence proves the branch point is a completed turn of
// the parent and reports where in the parent's trajectory the child inherits up
// to.
func (service *Service) branchSourceTrajectorySequence(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	forkedAtTurnID string,
) (int, error) {
	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()

	if _, err := service.snapshotLocked(ctx, workspaceID, parentConversationID); err != nil {
		return 0, err
	}
	turn, sourceTrajectorySequence, found, err := service.store.readConversationTurn(
		ctx,
		parentConversationID,
		forkedAtTurnID,
	)
	if err != nil {
		return 0, err
	}
	if !found || turn.Status != TurnStatusCompleted {
		return 0, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         "fork source must be a completed turn of the parent conversation",
		}
	}
	return sourceTrajectorySequence, nil
}

func (store *Store) readConversationTurn(
	ctx context.Context,
	conversationID string,
	turnID string,
) (ConversationTurn, int, bool, error) {
	if store == nil {
		return ConversationTurn{}, 0, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationTurn{}, 0, false, errors.New("conversation turn read context is required")
	}
	var turn ConversationTurn
	trajectorySequence := 0
	found := false
	err := store.read(ctx, "read conversation turn", func(ctx context.Context, connection *sql.Conn) error {
		row := connection.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE id = ? AND conversation_id = ?
`, turnID, conversationID)
		var scanErr error
		turn, scanErr = scanConversationTurn(row)
		if errors.Is(scanErr, sql.ErrNoRows) {
			return nil
		}
		if scanErr != nil {
			return scanErr
		}
		if err := connection.QueryRowContext(ctx, `
SELECT COALESCE(MAX(sequence), 0)
FROM trajectory_events
WHERE conversation_id = ? AND turn_id = ?
`, conversationID, turnID).Scan(&trajectorySequence); err != nil {
			return fmt.Errorf("read branch source trajectory sequence: %w", err)
		}
		found = true
		return nil
	})
	return turn, trajectorySequence, found, err
}
