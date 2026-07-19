package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var ErrConversationHasNoWorkspace = errors.New("topic conversation has no workspace resource")

func (store *Store) ReadConversationWorkspaceID(
	ctx context.Context,
	conversationID string,
) (string, error) {
	workspaceID, err := store.ReadConversationWorkspaceBindingID(ctx, conversationID)
	if err != nil {
		return "", err
	}
	if workspaceID == nil {
		return "", fmt.Errorf("%w: %s", ErrConversationHasNoWorkspace, conversationID)
	}
	return *workspaceID, nil
}

func (store *Store) ReadConversationWorkspaceBindingID(
	ctx context.Context,
	conversationID string,
) (*string, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("conversation workspace read context is required")
	}
	if err := validateIdentifier("conversation workspace read conversation id", conversationID); err != nil {
		return nil, err
	}
	var workspaceID sql.NullString
	err := store.read(ctx, "read conversation workspace", func(ctx context.Context, reader *sql.Conn) error {
		err := reader.QueryRowContext(ctx, `SELECT workspace_id FROM conversations WHERE id = ?`, conversationID).Scan(&workspaceID)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
		}
		return err
	})
	return optionalScannedString(workspaceID), err
}

func (store *Store) ReadConversationRouterContextSource(
	ctx context.Context,
	request ConversationRouterContextReadRequest,
) (ConversationRouterContextSource, error) {
	if store == nil {
		return ConversationRouterContextSource{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationRouterContextSource{}, errors.New("conversation router context is required")
	}
	if err := request.Validate(); err != nil {
		return ConversationRouterContextSource{}, err
	}
	var source ConversationRouterContextSource
	err := store.read(ctx, "read conversation router context", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		source, err = readConversationRouterContextSource(ctx, reader, store.dbPath, request)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return ConversationRouterContextSource{}, err
	}
	if err := source.Validate(request); err != nil {
		return ConversationRouterContextSource{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return cloneConversationRouterContextSource(source), nil
}

func readConversationRouterContextSource(
	ctx context.Context,
	reader *sql.Tx,
	dbPath string,
	request ConversationRouterContextReadRequest,
) (ConversationRouterContextSource, error) {
	if err := requireConversationRouterWork(ctx, reader, dbPath, request.Work); err != nil {
		return ConversationRouterContextSource{}, err
	}
	narrator, err := readNarratorContextSource(ctx, reader, NarratorContextReadRequest{
		ConversationID:      request.Work.Input.Input.ConversationID,
		Kind:                NarratorContextReadStatus,
		MaxTrajectoryEvents: request.MaxTrajectoryEvents,
		MaxFinalSummaries:   0,
	})
	if err != nil {
		return ConversationRouterContextSource{}, err
	}
	priorNarration, err := readConversationRouterPriorNarration(
		ctx,
		reader,
		narrator.Conversation.ID,
		request.MaxPriorNarration,
	)
	if err != nil {
		return ConversationRouterContextSource{}, err
	}
	priorDecisions, err := readConversationRouterPriorDecisions(
		ctx,
		reader,
		dbPath,
		narrator.Conversation.ID,
		request.Work.Input.Sequence,
		request.MaxPriorDecisions,
	)
	if err != nil {
		return ConversationRouterContextSource{}, err
	}
	forkPoints, err := readConversationRouterForkPoints(
		ctx,
		reader,
		narrator.Conversation.ID,
		request.MaxForkPoints,
	)
	if err != nil {
		return ConversationRouterContextSource{}, err
	}
	allowed, err := readConversationRouterAllowedDecisionKinds(
		ctx,
		reader,
		request.Work,
		narrator,
		forkPoints,
	)
	if err != nil {
		return ConversationRouterContextSource{}, err
	}
	return ConversationRouterContextSource{
		Work:                     cloneConversationInputRoutingWork(request.Work),
		Conversation:             narrator.Conversation,
		NarratorState:            narrator.NarratorState,
		CurrentTurn:              narrator.CurrentTurn,
		Trajectory:               narrator.Trajectory,
		PriorNarration:           priorNarration,
		PriorRouteDecisions:      priorDecisions,
		ValidCompletedForkPoints: forkPoints,
		AllowedDecisionKinds:     allowed,
	}, nil
}

func requireConversationRouterWork(
	ctx context.Context,
	reader *sql.Tx,
	dbPath string,
	work ConversationInputRoutingWork,
) error {
	activeID := conversationRouterActiveWorkID(work)
	record, found, err := readConversationInputRecord(ctx, reader, activeID, dbPath)
	if err != nil {
		return err
	}
	if err := validateConversationRouterClaim(record, found, work, activeID); err != nil {
		return err
	}
	return validateConversationRouterClaimPayload(record, work, activeID)
}

func conversationRouterActiveWorkID(work ConversationInputRoutingWork) string {
	if work.ClarificationReply != nil {
		return work.ClarificationReply.Input.ID
	}
	return work.Input.Input.ID
}

func validateConversationRouterClaim(
	record conversationInputRecord,
	found bool,
	work ConversationInputRoutingWork,
	activeID string,
) error {
	if !found || record.Accepted.Status != ConversationInputStatusRouting ||
		record.RoutingAttempt != work.RoutingAttempt || record.RoutingStartedAt == nil ||
		*record.RoutingStartedAt != work.RoutingStartedAt {
		return stateConflict("conversation input", activeID, "claimed router work changed before context materialization")
	}
	return nil
}

func validateConversationRouterClaimPayload(
	record conversationInputRecord,
	work ConversationInputRoutingWork,
	activeID string,
) error {
	if work.ClarificationReply == nil {
		if !EqualConversationInputs(record.Accepted.Input, work.Input.Input) ||
			record.Accepted.Sequence != work.Input.Sequence {
			return stateConflict("conversation input", activeID, "claimed router input changed")
		}
		return nil
	}
	if !EqualConversationInputs(record.Accepted.Input, work.ClarificationReply.Input) ||
		record.Accepted.Sequence != work.ClarificationReply.Sequence {
		return stateConflict("conversation input", activeID, "claimed router clarification changed")
	}
	return nil
}

func readConversationRouterPriorNarration(
	ctx context.Context,
	reader *sql.Tx,
	conversationID string,
	limit int,
) ([]NarrationEvent, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, stream_sequence, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events
WHERE conversation_id = ?
ORDER BY stream_sequence DESC
LIMIT ?
`, conversationID, limit)
	if err != nil {
		return nil, fmt.Errorf("read conversation router prior narration: %w", err)
	}
	defer rows.Close()
	events, err := scanNarrationEvents(rows)
	if err != nil {
		return nil, err
	}
	reverseSlice(events)
	return events, nil
}

func readConversationRouterPriorDecisions(
	ctx context.Context,
	reader *sql.Tx,
	dbPath string,
	conversationID string,
	beforeInputSequence int,
	limit int,
) ([]ConversationRouterPriorDecision, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT input.sequence, decision.decision_ordinal, input.input_text,
       decision.route_decision_json, decision.decided_at
FROM conversation_route_decisions AS decision
JOIN conversation_inputs AS input
  ON input.conversation_id = decision.conversation_id
 AND input.id = decision.input_id
WHERE decision.conversation_id = ? AND input.sequence < ?
ORDER BY decision.stream_sequence DESC
LIMIT ?
`, conversationID, beforeInputSequence, limit)
	if err != nil {
		return nil, fmt.Errorf("read conversation router prior decisions: %w", err)
	}
	defer rows.Close()
	decisions := make([]ConversationRouterPriorDecision, 0, limit)
	for rows.Next() {
		var prior ConversationRouterPriorDecision
		var decisionJSON string
		if err := rows.Scan(
			&prior.InputSequence,
			&prior.DecisionOrdinal,
			&prior.InputText,
			&decisionJSON,
			&prior.DecidedAt,
		); err != nil {
			return nil, err
		}
		if err := decodeConversationRouteJSON(decisionJSON, &prior.Decision); err != nil {
			return nil, &CorruptStateError{Path: dbPath, Err: err}
		}
		decisions = append(decisions, prior)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	reverseSlice(decisions)
	return decisions, nil
}

func readConversationRouterForkPoints(
	ctx context.Context,
	reader *sql.Tx,
	conversationID string,
	limit int,
) ([]ConversationRouterForkPoint, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE conversation_id = ? AND status = ?
ORDER BY ended_at DESC, id DESC
LIMIT ?
`, conversationID, TurnStatusCompleted, limit)
	if err != nil {
		return nil, fmt.Errorf("read conversation router fork points: %w", err)
	}
	defer rows.Close()
	points := make([]ConversationRouterForkPoint, 0, limit)
	for rows.Next() {
		turn, err := scanConversationTurn(rows)
		if err != nil {
			return nil, err
		}
		if turn.EndedAt == nil {
			return nil, errors.New("completed conversation router fork point has no end time")
		}
		points = append(points, ConversationRouterForkPoint{
			TurnID:      turn.ID,
			Objective:   turn.AuthoredInput,
			CompletedAt: *turn.EndedAt,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	reverseSlice(points)
	return points, nil
}

func readConversationRouterAllowedDecisionKinds(
	ctx context.Context,
	reader *sql.Tx,
	work ConversationInputRoutingWork,
	narrator NarratorContextSource,
	forkPoints []ConversationRouterForkPoint,
) ([]ConversationRouteDecisionKind, error) {
	allowed, err := readConversationRouterParentDecisionKinds(ctx, reader, work, narrator)
	if err != nil {
		return nil, err
	}
	allowed = append(allowed, ConversationRouteDecisionKindAnswerAsNarrator)
	sideAllowed, err := conversationRouterSideAllowed(ctx, reader, work)
	if err != nil {
		return nil, err
	}
	if sideAllowed {
		allowed = append(allowed, ConversationRouteDecisionKindCreateSideConversation)
	}
	if len(forkPoints) > 0 {
		allowed = append(allowed, ConversationRouteDecisionKindForkConversation)
	}
	allowed = append(allowed, ConversationRouteDecisionKindEscalateToMaster)
	if work.ClarificationReply == nil {
		allowed = append(allowed, ConversationRouteDecisionKindClarify)
	}
	return allowed, nil
}

func readConversationRouterParentDecisionKinds(
	ctx context.Context,
	reader *sql.Tx,
	work ConversationInputRoutingWork,
	narrator NarratorContextSource,
) ([]ConversationRouteDecisionKind, error) {
	allowed := make([]ConversationRouteDecisionKind, 0, 2)
	switch narrator.Conversation.Status {
	case ConversationStatusIdle:
		allowed = append(allowed, ConversationRouteDecisionKindSendToParent)
	case ConversationStatusWorking, ConversationStatusWaitingForApproval:
		if narrator.CurrentTurn.Turn != nil && narrator.CurrentTurn.Turn.Status == TurnStatusRunning {
			queueAvailable, err := conversationRouterQueueAvailable(ctx, reader, work.Input.Input.ConversationID)
			if err != nil {
				return nil, err
			}
			if queueAvailable {
				allowed = append(allowed, ConversationRouteDecisionKindQueueParentTurn)
			}
			allowed = append(allowed, ConversationRouteDecisionKindSteerParentTurn)
		}
	case ConversationStatusFailed:
	}
	return allowed, nil
}

func conversationRouterQueueAvailable(
	ctx context.Context,
	reader *sql.Tx,
	conversationID string,
) (bool, error) {
	var queued int
	if err := reader.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM conversation_queue
WHERE conversation_id = ?
`, conversationID).Scan(&queued); err != nil {
		return false, fmt.Errorf("read conversation router queue capacity: %w", err)
	}
	return queued < MaxSnapshotQueuedTurns, nil
}

func conversationRouterSideAllowed(
	ctx context.Context,
	reader *sql.Tx,
	work ConversationInputRoutingWork,
) (bool, error) {
	paneID := work.Input.Input.SourcePaneID
	if paneID == nil {
		return false, nil
	}
	var boundConversationID string
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id
FROM pane_bindings
WHERE pane_id = ?
`, *paneID).Scan(&boundConversationID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read conversation router pane binding: %w", err)
	}
	if boundConversationID != work.Input.Input.ConversationID {
		return false, nil
	}
	open, err := readOpenSideConversationForPane(
		ctx,
		reader,
		work.Input.Input.ConversationID,
		*paneID,
	)
	if err != nil {
		return false, fmt.Errorf("read conversation router side state: %w", err)
	}
	return !open, nil
}

func cloneConversationRouterContextSource(
	source ConversationRouterContextSource,
) ConversationRouterContextSource {
	source.Work = cloneConversationInputRoutingWork(source.Work)
	source.Conversation.ArchivedAt = cloneStringPointer(source.Conversation.ArchivedAt)
	source.NarratorState.LastInvocationAt = cloneStringPointer(source.NarratorState.LastInvocationAt)
	if source.NarratorState.Degradation != nil {
		degradation := *source.NarratorState.Degradation
		source.NarratorState.Degradation = &degradation
	}
	source.Trajectory.AvailableRange = cloneTrajectorySequenceRange(source.Trajectory.AvailableRange)
	source.Trajectory.IncludedRange = cloneTrajectorySequenceRange(source.Trajectory.IncludedRange)
	source.Trajectory.Events = append([]TrajectoryEvent{}, source.Trajectory.Events...)
	source.PriorNarration = append([]NarrationEvent{}, source.PriorNarration...)
	source.PriorRouteDecisions = append([]ConversationRouterPriorDecision{}, source.PriorRouteDecisions...)
	for index := range source.PriorRouteDecisions {
		source.PriorRouteDecisions[index].Decision = cloneConversationRouteDecision(
			source.PriorRouteDecisions[index].Decision,
		)
	}
	source.ValidCompletedForkPoints = append(
		[]ConversationRouterForkPoint{},
		source.ValidCompletedForkPoints...,
	)
	source.AllowedDecisionKinds = append(
		[]ConversationRouteDecisionKind{},
		source.AllowedDecisionKinds...,
	)
	return source
}
