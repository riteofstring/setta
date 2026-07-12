package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ConversationRouteCommandApplied reports whether the exact durable effect
// carried by a committed route decision already exists. It is intentionally a
// store read rather than executor memory: the result remains authoritative
// across process restart and closes the effect/acknowledgement crash window.
func (store *Store) ConversationRouteCommandApplied(
	ctx context.Context,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	if err := validateConversationRouteCommandEffectRead(store, ctx, record); err != nil {
		return false, err
	}

	applied := false
	err := store.read(ctx, "read conversation route command effect", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		applied, err = readConversationRouteCommandEffect(ctx, reader, store.dbPath, record)
		return err
	})
	return applied, err
}

func validateConversationRouteCommandEffectRead(
	store *Store,
	ctx context.Context,
	record ConversationRouteDecisionRecord,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation route command effect context is required")
	}
	if err := record.Validate(); err != nil {
		return fmt.Errorf("validate conversation route command effect: %w", err)
	}
	return nil
}

func readConversationRouteCommandEffect(
	ctx context.Context,
	reader *sql.Conn,
	dbPath string,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	switch record.ResultingCommand.Kind {
	case ConversationRouteDecisionKindSendToParent:
		command := record.ResultingCommand.SendToParent
		return readConversationRouteTurnEffect(
			ctx,
			reader,
			record.ConversationID,
			command.TurnID,
			command.AuthoredInput,
			TurnDeliveryNormal,
		)
	case ConversationRouteDecisionKindQueueParentTurn:
		command := record.ResultingCommand.QueueParentTurn
		return readConversationRouteTurnEffect(
			ctx,
			reader,
			record.ConversationID,
			command.TurnID,
			command.AuthoredInput,
			TurnDeliveryQueued,
		)
	case ConversationRouteDecisionKindSteerParentTurn:
		return readConversationRouteSteeringEffect(ctx, reader, dbPath, record)
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return readConversationRouteNarratorEffect(ctx, reader, record)
	case ConversationRouteDecisionKindCreateSideConversation:
		return readConversationRouteSideEffect(ctx, reader, record)
	case ConversationRouteDecisionKindForkConversation:
		return readConversationRouteForkEffect(ctx, reader, record)
	case ConversationRouteDecisionKindEscalateToMaster:
		return readConversationRouteMasterEffect(ctx, reader, record)
	case ConversationRouteDecisionKindClarify:
		// The clarification status and question are committed in the same
		// transaction as the decision itself.
		return true, nil
	default:
		return false, fmt.Errorf("unsupported conversation route command %q", record.ResultingCommand.Kind)
	}
}

func readConversationRouteTurnEffect(
	ctx context.Context,
	reader *sql.Conn,
	conversationID string,
	turnID string,
	input AuthoredInput,
	delivery TurnDelivery,
) (bool, error) {
	turn, err := scanConversationTurn(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE id = ?
`, turnID))
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := turn.Validate(); err != nil {
		return false, err
	}
	if turn.ConversationID != conversationID || turn.AuthoredInput != input || turn.Delivery != delivery {
		return false, stateConflict("conversation route turn", turnID, "stored effect does not match its command")
	}
	return true, nil
}

func readConversationRouteSteeringEffect(
	ctx context.Context,
	reader *sql.Conn,
	dbPath string,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	ids, err := conversationRouteSteeringTrajectoryEventIDs(record.ID)
	if err != nil {
		return false, err
	}
	events := make([]TrajectoryEvent, len(ids))
	found := make([]bool, len(ids))
	for index, id := range ids {
		event, scanErr := scanTrajectoryEvent(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE id = ?
`, id))
		if errors.Is(scanErr, sql.ErrNoRows) {
			continue
		}
		if scanErr != nil {
			return false, scanErr
		}
		events[index], found[index] = event, true
	}
	if !found[0] && !found[1] {
		return false, nil
	}
	if !found[0] || !found[1] {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("conversation route steering effect %s is only partially committed", record.ID),
		}
	}
	command := record.ResultingCommand.SteerParentTurn
	if err := validateConversationRouteSteeringEvent(
		events[0],
		record.ConversationID,
		command.TargetTurnID,
		TrajectoryEventUserInputAccepted,
		command.AuthoredInput,
	); err != nil {
		return false, err
	}
	if err := validateConversationRouteSteeringEvent(
		events[1],
		record.ConversationID,
		command.TargetTurnID,
		TrajectoryEventTurnSteered,
		command.AuthoredInput,
	); err != nil {
		return false, err
	}
	return true, nil
}

func validateConversationRouteSteeringEvent(
	event TrajectoryEvent,
	conversationID string,
	turnID string,
	kind TrajectoryEventKind,
	input AuthoredInput,
) error {
	if err := event.Validate(); err != nil {
		return err
	}
	if event.ConversationID != conversationID || event.TurnID == nil ||
		*event.TurnID != turnID || event.Kind != kind {
		return stateConflict("conversation route steering event", event.ID, "stored effect does not match its command")
	}
	return validateConversationRouteSteeringPayload(event, kind, input)
}

func validateConversationRouteSteeringPayload(
	event TrajectoryEvent,
	kind TrajectoryEventKind,
	input AuthoredInput,
) error {
	switch kind {
	case TrajectoryEventUserInputAccepted:
		if event.UserInputAccepted == nil || event.UserInputAccepted.Input != input ||
			event.UserInputAccepted.Delivery != TurnDeliverySteering {
			return stateConflict("conversation route steering event", event.ID, "accepted input does not match its command")
		}
	case TrajectoryEventTurnSteered:
		if event.TurnSteered == nil || event.TurnSteered.Input != input {
			return stateConflict("conversation route steering event", event.ID, "steered input does not match its command")
		}
	}
	return nil
}

func readConversationRouteNarratorEffect(
	ctx context.Context,
	reader *sql.Conn,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	command := record.ResultingCommand.AnswerAsNarrator
	var conversationID string
	var kind NarrationEventKind
	var payloadJSON string
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, kind, payload_json
FROM narration_events
WHERE json_extract(resolved_invocation_json, '$.providerReferences.requestId') = ?
LIMIT 1
`, command.RequestID).Scan(&conversationID, &kind, &payloadJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var reply NarrationStatusReply
	if err := decodeJSON("routed narrator status reply", payloadJSON, &reply); err != nil {
		return false, err
	}
	if conversationID != record.ConversationID || kind != NarrationEventKindStatusReply ||
		reply.Question != command.Question {
		return false, stateConflict("conversation route narrator request", command.RequestID, "stored effect does not match its command")
	}
	return true, nil
}

func readConversationRouteSideEffect(
	ctx context.Context,
	reader *sql.Conn,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	command := record.ResultingCommand.CreateSideConversation
	metadata, found, err := readConversationRouteSideMetadata(ctx, reader, command.SideConversationID)
	if err != nil || !found {
		return false, err
	}
	if err := validateConversationRouteSideMetadata(metadata, record, command); err != nil {
		return false, err
	}
	if metadata.status == SideConversationStatusFailed {
		// Side setup failures are persisted as the terminal outcome of this
		// command; replaying them would replace an auditable failure with a
		// different provider operation.
		return true, nil
	}

	event, err := scanSideConversationEventEffect(ctx, reader, command.SideConversationID, command.TurnID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, validateConversationRouteSideTurnEffect(event, command)
}

type conversationRouteSideMetadata struct {
	parentConversationID string
	parentPaneID         string
	source               BranchDecisionSource
	status               SideConversationStatus
}

func readConversationRouteSideMetadata(
	ctx context.Context,
	reader *sql.Conn,
	sideConversationID string,
) (conversationRouteSideMetadata, bool, error) {
	var metadata conversationRouteSideMetadata
	err := reader.QueryRowContext(ctx, `
SELECT parent_conversation_id, parent_pane_id, decision_source, status
FROM side_conversations
WHERE id = ?
`, sideConversationID).Scan(
		&metadata.parentConversationID,
		&metadata.parentPaneID,
		&metadata.source,
		&metadata.status,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return conversationRouteSideMetadata{}, false, nil
	}
	return metadata, err == nil, err
}

func validateConversationRouteSideMetadata(
	metadata conversationRouteSideMetadata,
	record ConversationRouteDecisionRecord,
	command *CreateSideConversationRouteCommand,
) error {
	expectedSource, err := routeBranchDecisionSource(record.Source)
	if err != nil {
		return err
	}
	if metadata.parentConversationID != record.ConversationID ||
		metadata.parentPaneID != command.ParentPaneID || metadata.source != expectedSource {
		return stateConflict(
			"conversation route side conversation",
			command.SideConversationID,
			"stored effect does not match its command",
		)
	}
	return nil
}

func validateConversationRouteSideTurnEffect(
	event TrajectoryEvent,
	command *CreateSideConversationRouteCommand,
) error {
	if err := event.Validate(); err != nil {
		return err
	}
	if event.ConversationID != command.SideConversationID || event.TurnID == nil ||
		*event.TurnID != command.TurnID || event.Kind != TrajectoryEventUserInputAccepted ||
		event.UserInputAccepted == nil || event.UserInputAccepted.Input != command.Input ||
		event.UserInputAccepted.Delivery != TurnDeliveryNormal {
		return stateConflict("conversation route side turn", command.TurnID, "stored effect does not match its command")
	}
	return nil
}

func scanSideConversationEventEffect(
	ctx context.Context,
	reader *sql.Conn,
	sideConversationID string,
	turnID string,
) (TrajectoryEvent, error) {
	var event TrajectoryEvent
	var payloadJSON string
	err := reader.QueryRowContext(ctx, `
SELECT id, sequence, emitted_at, event_json
FROM side_conversation_events
WHERE side_conversation_id = ? AND turn_id = ?
ORDER BY sequence
LIMIT 1
`, sideConversationID, turnID).Scan(&event.ID, &event.Sequence, &event.EmittedAt, &payloadJSON)
	if err != nil {
		return TrajectoryEvent{}, err
	}
	event.ConversationID = sideConversationID
	event.TurnID = &turnID
	event.Kind = TrajectoryEventUserInputAccepted
	event.Actor = TrajectoryActorUser
	if err := decodeJSON("routed side turn event", payloadJSON, &event); err != nil {
		return TrajectoryEvent{}, err
	}
	return event, nil
}

func readConversationRouteForkEffect(
	ctx context.Context,
	reader *sql.Conn,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	command := record.ResultingCommand.ForkConversation
	var parentConversationID string
	var source BranchDecisionSource
	var forkedAtTurnID string
	err := reader.QueryRowContext(ctx, `
SELECT parent_conversation_id, decision_source, forked_at_turn_id
FROM conversation_branches
WHERE child_conversation_id = ?
`, command.ChildConversationID).Scan(&parentConversationID, &source, &forkedAtTurnID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	expectedSource, err := routeBranchDecisionSource(record.Source)
	if err != nil {
		return false, err
	}
	if parentConversationID != record.ConversationID || source != expectedSource || forkedAtTurnID != command.ForkedAtTurnID {
		return false, stateConflict("conversation route fork", command.ChildConversationID, "stored effect does not match its command")
	}
	return readConversationRouteTurnEffect(
		ctx,
		reader,
		command.ChildConversationID,
		command.TurnID,
		command.Input,
		TurnDeliveryNormal,
	)
}

func readConversationRouteMasterEffect(
	ctx context.Context,
	reader *sql.Conn,
	record ConversationRouteDecisionRecord,
) (bool, error) {
	command := record.ResultingCommand.EscalateToMaster
	var text string
	var originConversationID sql.NullString
	var originInputID sql.NullString
	err := reader.QueryRowContext(ctx, `
SELECT input_text, originating_conversation_id, originating_conversation_input_id
FROM master_inputs
WHERE id = ?
`, command.MasterInputID).Scan(&text, &originConversationID, &originInputID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if text != command.Input.Text || !originConversationID.Valid ||
		originConversationID.String != record.ConversationID || !originInputID.Valid ||
		originInputID.String != record.InputID {
		return false, stateConflict("conversation route master input", command.MasterInputID, "stored effect does not match its command")
	}
	return true, nil
}
