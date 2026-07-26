package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
)

func (store *Store) ReadNarratorContextSource(
	ctx context.Context,
	request NarratorContextReadRequest,
) (NarratorContextSource, error) {
	if store == nil {
		return NarratorContextSource{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorContextSource{}, errors.New("narrator context read context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorContextSource{}, err
	}
	var source NarratorContextSource
	err := store.read(ctx, "read narrator context source", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		source, err = readNarratorContextSource(ctx, reader, request)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return NarratorContextSource{}, err
	}
	if err := source.validate(request); err != nil {
		return NarratorContextSource{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return source, nil
}

func readNarratorContextSource(
	ctx context.Context,
	reader snapshotReader,
	request NarratorContextReadRequest,
) (NarratorContextSource, error) {
	conversation, err := readNarratorConversation(ctx, reader, request.ConversationID)
	if err != nil {
		return NarratorContextSource{}, err
	}
	if request.Kind == NarratorContextReadProjection &&
		request.ProjectionThroughSequence > conversation.LastTrajectorySequence {
		return NarratorContextSource{}, fmt.Errorf(
			"narrator projection through sequence %d exceeds conversation %s latest trajectory %d",
			request.ProjectionThroughSequence,
			request.ConversationID,
			conversation.LastTrajectorySequence,
		)
	}
	narratorState, err := readSnapshotNarrator(ctx, reader, request.ConversationID)
	if err != nil {
		return NarratorContextSource{}, err
	}
	turn, err := readNarratorTargetTurn(ctx, reader, request.ConversationID, request.TurnID)
	if err != nil {
		return NarratorContextSource{}, err
	}
	currentTurn, err := readNarratorCurrentTurnProjection(ctx, reader, request.ConversationID, turn)
	if err != nil {
		return NarratorContextSource{}, err
	}
	trajectory, err := readNarratorTrajectoryWindow(ctx, reader, conversation, narratorState, request)
	if err != nil {
		return NarratorContextSource{}, err
	}
	milestones, err := readNarratorProjectionMilestones(ctx, reader, request, turn)
	if err != nil {
		return NarratorContextSource{}, err
	}
	currentTurnFinalSummary, err := readNarratorProjectionFinalSummary(ctx, reader, request, turn)
	if err != nil {
		return NarratorContextSource{}, err
	}
	finalSummaries, err := readNarratorRecentFinalSummaries(ctx, reader, request, turn)
	if err != nil {
		return NarratorContextSource{}, err
	}
	return NarratorContextSource{
		Conversation:            conversation,
		NarratorState:           narratorState,
		CurrentTurn:             currentTurn,
		Trajectory:              trajectory,
		PriorMilestones:         milestones,
		CurrentTurnFinalSummary: currentTurnFinalSummary,
		RecentFinalSummaries:    finalSummaries,
	}, nil
}

func readNarratorProjectionMilestones(
	ctx context.Context,
	reader snapshotReader,
	request NarratorContextReadRequest,
	turn *ConversationTurn,
) ([]NarrationEvent, error) {
	if request.Kind != NarratorContextReadProjection {
		return []NarrationEvent{}, nil
	}
	return readNarratorPriorMilestones(ctx, reader, request.ConversationID, turn)
}

func readNarratorProjectionFinalSummary(
	ctx context.Context,
	reader snapshotReader,
	request NarratorContextReadRequest,
	turn *ConversationTurn,
) (*NarrationEvent, error) {
	if request.Kind != NarratorContextReadProjection {
		return nil, nil
	}
	return readNarratorCurrentTurnFinalSummary(ctx, reader, request.ConversationID, turn)
}

func readNarratorConversation(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
) (TopicConversation, error) {
	conversation, err := scanTopicConversation(reader.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ?
`, conversationID))
	if errors.Is(err, sql.ErrNoRows) {
		return TopicConversation{}, fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	return conversation, err
}

func readNarratorTargetTurn(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turnID *string,
) (*ConversationTurn, error) {
	if turnID != nil {
		turn, err := scanConversationTurn(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE conversation_id = ? AND id = ?
`, conversationID, *turnID))
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: turn %s in conversation %s", ErrConversationNotFound, *turnID, conversationID)
		}
		if err != nil {
			return nil, err
		}
		return &turn, nil
	}
	turn, err := scanConversationTurn(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE conversation_id = ?
ORDER BY CASE status
           WHEN 'running' THEN 0
           WHEN 'queued' THEN 1
           ELSE 2
         END,
         accepted_at DESC, id DESC
LIMIT 1
`, conversationID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &turn, nil
}

func readNarratorCurrentTurnProjection(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turn *ConversationTurn,
) (NarratorCurrentTurnProjection, error) {
	projection := NarratorCurrentTurnProjection{
		Turn:             turn,
		AcceptedSteering: []NarratorAcceptedSteering{},
		ActiveActivities: []NarratorActiveActivity{},
		PendingApprovals: []NarratorPendingApproval{},
		ActiveSubagents:  []NarratorActiveSubagent{},
		Artifacts:        []Artifact{},
	}
	if turn == nil {
		return projection, nil
	}
	if err := foldNarratorTurnTrajectory(ctx, reader, turn.ID, &projection); err != nil {
		return NarratorCurrentTurnProjection{}, err
	}
	artifacts, err := readNarratorTurnArtifacts(ctx, reader, conversationID, turn.ID)
	if err != nil {
		return NarratorCurrentTurnProjection{}, err
	}
	projection.Artifacts = artifacts
	return projection, nil
}

type narratorTurnFold struct {
	activities map[string]NarratorActiveActivity
	approvals  map[string]NarratorPendingApproval
	subagents  map[string]NarratorActiveSubagent
}

func foldNarratorTurnTrajectory(
	ctx context.Context,
	reader snapshotReader,
	turnID string,
	projection *NarratorCurrentTurnProjection,
) error {
	return foldNarratorTurnTrajectoryBounded(ctx, reader, turnID, nil, projection)
}

func foldNarratorTurnTrajectoryThroughSequence(
	ctx context.Context,
	reader snapshotReader,
	turnID string,
	throughSequence int,
	projection *NarratorCurrentTurnProjection,
) error {
	return foldNarratorTurnTrajectoryBounded(ctx, reader, turnID, &throughSequence, projection)
}

func foldNarratorTurnTrajectoryBounded(
	ctx context.Context,
	reader snapshotReader,
	turnID string,
	throughSequence *int,
	projection *NarratorCurrentTurnProjection,
) error {
	query := `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE turn_id = ?
`
	arguments := []any{turnID}
	if throughSequence != nil {
		query += " AND sequence <= ?\n"
		arguments = append(arguments, *throughSequence)
	}
	query += "ORDER BY sequence ASC\n"
	rows, err := reader.QueryContext(ctx, query, arguments...)
	if err != nil {
		return err
	}
	defer rows.Close()
	fold := narratorTurnFold{
		activities: map[string]NarratorActiveActivity{},
		approvals:  map[string]NarratorPendingApproval{},
		subagents:  map[string]NarratorActiveSubagent{},
	}
	for rows.Next() {
		event, scanErr := scanTrajectoryEvent(rows)
		if scanErr != nil {
			return scanErr
		}
		if err := fold.apply(event, projection); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	projection.ActiveActivities = sortedNarratorActivities(fold.activities)
	projection.PendingApprovals = sortedNarratorApprovals(fold.approvals)
	projection.ActiveSubagents = sortedNarratorSubagents(fold.subagents)
	return nil
}

func (fold *narratorTurnFold) apply(event TrajectoryEvent, projection *NarratorCurrentTurnProjection) error {
	for _, apply := range []func(TrajectoryEvent, *NarratorCurrentTurnProjection) (bool, error){
		fold.applyInstructions,
		fold.applyActivity,
		fold.applyApproval,
		fold.applySubagent,
	} {
		handled, err := apply(event, projection)
		if err != nil || handled {
			return err
		}
	}
	return nil
}

func (fold *narratorTurnFold) applyInstructions(
	event TrajectoryEvent,
	projection *NarratorCurrentTurnProjection,
) (bool, error) {
	switch event.Kind {
	case TrajectoryEventTurnSteered:
		projection.AcceptedSteering = append(projection.AcceptedSteering, NarratorAcceptedSteering{
			Sequence: event.Sequence,
			Input:    event.TurnSteered.Input,
		})
		return true, nil
	case TrajectoryEventAgentMessageCompleted:
		message := NarratorSemanticAssistantMessage{
			ProviderItemID: event.AgentMessageCompleted.ProviderItemID,
			Text:           event.AgentMessageCompleted.Text,
		}
		projection.LatestAssistantMessage = &message
		return true, nil
	case TrajectoryEventPlanChanged:
		projection.Plan = &NarratorCurrentPlan{Sequence: event.Sequence, Plan: *event.PlanChanged}
		return true, nil
	default:
		return false, nil
	}
}

func (fold *narratorTurnFold) applyActivity(
	event TrajectoryEvent,
	_ *NarratorCurrentTurnProjection,
) (bool, error) {
	switch event.Kind {
	case TrajectoryEventActivityStarted:
		activity := event.ActivityStarted.Activity
		fold.activities[activity.ID] = NarratorActiveActivity{
			StartedAtSequence:     event.Sequence,
			LastUpdatedAtSequence: event.Sequence,
			Activity:              activity,
		}
		return true, nil
	case TrajectoryEventActivityProgressed:
		active, ok := fold.activities[event.ActivityProgressed.ActivityID]
		if !ok {
			return true, fmt.Errorf(
				"activity progress %s at sequence %d has no active start",
				event.ActivityProgressed.ActivityID,
				event.Sequence,
			)
		}
		active.LastUpdatedAtSequence = event.Sequence
		active.LatestProgress = event.ActivityProgressed.Progress
		active.LatestOutput = event.ActivityProgressed.Output
		fold.activities[active.Activity.ID] = active
		return true, nil
	case TrajectoryEventActivityCompleted:
		delete(fold.activities, event.ActivityCompleted.Activity.ID)
		return true, nil
	case TrajectoryEventActivityFailed:
		delete(fold.activities, event.ActivityFailed.Activity.ID)
		return true, nil
	default:
		return false, nil
	}
}

func (fold *narratorTurnFold) applyApproval(
	event TrajectoryEvent,
	_ *NarratorCurrentTurnProjection,
) (bool, error) {
	switch event.Kind {
	case TrajectoryEventApprovalRequested:
		approval := event.ApprovalRequested.Approval
		fold.approvals[approval.ID] = NarratorPendingApproval{
			RequestedAtSequence: event.Sequence,
			Approval:            approval,
		}
		return true, nil
	case TrajectoryEventApprovalResolved:
		delete(fold.approvals, event.ApprovalResolved.Resolution.ApprovalID)
		return true, nil
	default:
		return false, nil
	}
}

func (fold *narratorTurnFold) applySubagent(
	event TrajectoryEvent,
	_ *NarratorCurrentTurnProjection,
) (bool, error) {
	switch event.Kind {
	case TrajectoryEventSubagentStarted:
		fold.upsertSubagent(event.Sequence, event.SubagentStarted.Subagent)
		return true, nil
	case TrajectoryEventSubagentUpdated:
		fold.upsertSubagent(event.Sequence, event.SubagentUpdated.Subagent)
		return true, nil
	case TrajectoryEventSubagentCompleted:
		delete(fold.subagents, event.SubagentCompleted.Subagent.ID)
		return true, nil
	default:
		return false, nil
	}
}

func (fold *narratorTurnFold) upsertSubagent(sequence int, subagent Subagent) {
	if subagentStatusTerminal(subagent.Status) {
		delete(fold.subagents, subagent.ID)
		return
	}
	active, ok := fold.subagents[subagent.ID]
	if !ok {
		active.StartedAtSequence = sequence
	}
	active.LastUpdatedAtSequence = sequence
	active.Subagent = subagent
	fold.subagents[subagent.ID] = active
}

func sortedNarratorActivities(values map[string]NarratorActiveActivity) []NarratorActiveActivity {
	result := make([]NarratorActiveActivity, 0, len(values))
	for _, value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		if result[left].StartedAtSequence != result[right].StartedAtSequence {
			return result[left].StartedAtSequence < result[right].StartedAtSequence
		}
		return result[left].Activity.ID < result[right].Activity.ID
	})
	return result
}

func sortedNarratorApprovals(values map[string]NarratorPendingApproval) []NarratorPendingApproval {
	result := make([]NarratorPendingApproval, 0, len(values))
	for _, value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		if result[left].RequestedAtSequence != result[right].RequestedAtSequence {
			return result[left].RequestedAtSequence < result[right].RequestedAtSequence
		}
		return result[left].Approval.ID < result[right].Approval.ID
	})
	return result
}

func sortedNarratorSubagents(values map[string]NarratorActiveSubagent) []NarratorActiveSubagent {
	result := make([]NarratorActiveSubagent, 0, len(values))
	for _, value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		if result[left].StartedAtSequence != result[right].StartedAtSequence {
			return result[left].StartedAtSequence < result[right].StartedAtSequence
		}
		return result[left].Subagent.ID < result[right].Subagent.ID
	})
	return result
}
