package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"setta/internal/master"
)

func (store *Store) ReadPendingMasterRouteCommand(
	ctx context.Context,
) (master.RouteDecisionRecord, *string, bool, error) {
	if store == nil {
		return master.RouteDecisionRecord{}, nil, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.RouteDecisionRecord{}, nil, false, errors.New("master route command context is required")
	}
	var record master.RouteDecisionRecord
	var resolvedPaneID *string
	found := false
	err := store.read(ctx, "read pending master route command", func(ctx context.Context, reader *sql.Conn) error {
		var scanErr error
		record, scanErr = scanMasterRouteDecision(reader.QueryRowContext(ctx, masterRouteDecisionSelect+`
WHERE NOT EXISTS (
  SELECT 1
  FROM master_route_command_completions AS completion
  WHERE completion.decision_id = master_route_decisions.id
)
AND (
  json_extract(resulting_command_json, '$.kind') <> ?
  OR EXISTS (
    SELECT 1
    FROM master_presentation_resolutions AS resolution
    WHERE resolution.decision_id = master_route_decisions.id
  )
)
ORDER BY stream_sequence
LIMIT 1
`, master.RouteDecisionKindCreateSideConversation), store.dbPath)
		if errors.Is(scanErr, sql.ErrNoRows) {
			return nil
		}
		if scanErr != nil {
			return scanErr
		}
		if record.ResultingCommand.Kind == master.RouteDecisionKindCreateSideConversation {
			resolution, resolved, readErr := readMasterPresentationResolution(
				ctx,
				reader,
				store.dbPath,
				record.ID,
				record.InputID,
			)
			if readErr != nil {
				return readErr
			}
			if !resolved {
				return &CorruptStateError{Path: store.dbPath, Err: errors.New("executable master side command has no presentation resolution")}
			}
			paneID := resolution.PaneID
			resolvedPaneID = &paneID
		}
		found = true
		return nil
	})
	return master.CloneRouteDecisionRecord(record), cloneStringPointer(resolvedPaneID), found, err
}

func (store *Store) MasterRouteCommandApplied(
	ctx context.Context,
	record master.RouteDecisionRecord,
) (bool, error) {
	if store == nil {
		return false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return false, errors.New("master route command effect context is required")
	}
	if err := record.Validate(); err != nil {
		return false, fmt.Errorf("validate master route command effect: %w", err)
	}
	applied := false
	err := store.read(ctx, "read master route command effect", func(ctx context.Context, reader *sql.Conn) error {
		var readErr error
		applied, readErr = readMasterRouteCommandEffect(ctx, reader, store.dbPath, record)
		return readErr
	})
	return applied, err
}

func readMasterRouteCommandEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	record master.RouteDecisionRecord,
) (bool, error) {
	command := record.ResultingCommand
	switch command.Kind {
	case master.RouteDecisionKindSendToAgent:
		payload := command.SendToAgent
		return readConversationRouteTurnEffect(ctx, reader, payload.Target.ConversationID, payload.TurnID, AuthoredInput{Text: payload.AuthoredInput}, TurnDeliveryNormal)
	case master.RouteDecisionKindQueueAgentTurn:
		payload := command.QueueAgentTurn
		return readConversationRouteTurnEffect(ctx, reader, payload.Target.ConversationID, payload.TurnID, AuthoredInput{Text: payload.AuthoredInput}, TurnDeliveryQueued)
	case master.RouteDecisionKindSteerActiveTurn:
		return readMasterRouteSteeringEffect(ctx, reader, dbPath, record)
	case master.RouteDecisionKindAskNarrator:
		payload := command.AskNarrator
		return readMasterRouteNarratorEffect(ctx, reader, payload.Target.ConversationID, payload.RequestID, payload.Question)
	case master.RouteDecisionKindFocusConversation,
		master.RouteDecisionKindClarify,
		master.RouteDecisionKindAnswerGlobal:
		return true, nil
	case master.RouteDecisionKindCreateConversation:
		return readMasterRouteCreateConversationEffect(ctx, reader, dbPath, command.CreateConversation)
	case master.RouteDecisionKindCreateSideConversation:
		return readMasterRouteSideEffect(ctx, reader, dbPath, record)
	case master.RouteDecisionKindForkConversation:
		return readMasterRouteForkEffect(ctx, reader, command.ForkConversation)
	default:
		return false, fmt.Errorf("unsupported master route command %q", command.Kind)
	}
}

func readMasterRouteSteeringEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	record master.RouteDecisionRecord,
) (bool, error) {
	payload := record.ResultingCommand.SteerActiveTurn
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
		return false, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("master route steering effect %s is only partially committed", record.ID)}
	}
	input := AuthoredInput{Text: payload.AuthoredInput}
	if err := validateConversationRouteSteeringEvent(events[0], payload.Target.ConversationID, payload.TargetTurnID, TrajectoryEventUserInputAccepted, input); err != nil {
		return false, err
	}
	if err := validateConversationRouteSteeringEvent(events[1], payload.Target.ConversationID, payload.TargetTurnID, TrajectoryEventTurnSteered, input); err != nil {
		return false, err
	}
	return true, nil
}

func readMasterRouteNarratorEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	conversationID string,
	requestID string,
	question string,
) (bool, error) {
	var storedConversationID string
	var kind NarrationEventKind
	var payloadJSON string
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, kind, payload_json
FROM narration_events
WHERE json_extract(resolved_invocation_json, '$.providerReferences.requestId') = ?
LIMIT 1
`, requestID).Scan(&storedConversationID, &kind, &payloadJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var reply NarrationStatusReply
	if err := decodeJSON("master-routed narrator status reply", payloadJSON, &reply); err != nil {
		return false, err
	}
	if storedConversationID != conversationID || kind != NarrationEventKindStatusReply || reply.Question != question {
		return false, stateConflict("master route narrator request", requestID, "stored effect does not match its command")
	}
	return true, nil
}

func readMasterRouteCreateConversationEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	command *master.MasterCreateConversationRouteCommand,
) (bool, error) {
	targetWorkspaceID, folderScoped, err := masterRouteCommandFolderWorkspaceScope(command.Target)
	if err != nil {
		return false, err
	}
	var workspaceID sql.NullString
	var title string
	err = reader.QueryRowContext(ctx, `
SELECT workspace_id, title
FROM conversations
WHERE id = ?
`, command.Target.ConversationID).Scan(&workspaceID, &title)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if title != command.Target.Title ||
		(folderScoped && (!workspaceID.Valid || workspaceID.String != targetWorkspaceID)) ||
		(!folderScoped && workspaceID.Valid) {
		return false, stateConflict("master route conversation", command.Target.ConversationID, "stored effect does not match its command")
	}
	return readMasterRouteInitialInputEffect(ctx, reader, dbPath, command)
}

func readMasterRouteInitialInputEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	command *master.MasterCreateConversationRouteCommand,
) (bool, error) {
	input, err := masterRouteInitialConversationInput(command)
	if err != nil {
		return false, err
	}
	accepted, found, err := readConversationInputRow(ctx, reader, input.ID, dbPath)
	if err != nil || !found {
		return false, err
	}
	if !EqualConversationInputs(accepted.Input, input) {
		return false, stateConflict("master route conversation input", input.ID, "stored effect does not match its command")
	}
	return true, nil
}

func readMasterRouteSideEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	record master.RouteDecisionRecord,
) (bool, error) {
	command := record.ResultingCommand.CreateSideConversation
	resolution, found, err := readMasterPresentationResolution(
		ctx,
		reader,
		dbPath,
		record.ID,
		record.InputID,
	)
	if err != nil || !found {
		return false, err
	}
	metadata, found, err := readConversationRouteSideMetadata(ctx, reader, command.SideConversationID)
	if err != nil || !found {
		return false, err
	}
	if metadata.parentConversationID != command.Target.ConversationID || metadata.parentPaneID != resolution.PaneID || metadata.source != BranchDecisionSourceMaster {
		return false, stateConflict("master route side conversation", command.SideConversationID, "stored effect does not match its command")
	}
	if metadata.status == SideConversationStatusFailed {
		return true, nil
	}
	event, err := scanSideConversationEventEffect(ctx, reader, command.SideConversationID, command.TurnID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, validateConversationRouteSideTurnEffect(event, &CreateSideConversationRouteCommand{
		SideConversationID: command.SideConversationID,
		ParentPaneID:       resolution.PaneID,
		TurnID:             command.TurnID,
		Input:              AuthoredInput{Text: command.Input},
	})
}

func readMasterRouteForkEffect(
	ctx context.Context,
	reader routeCommandEffectReader,
	command *master.MasterForkConversationRouteCommand,
) (bool, error) {
	var parentConversationID string
	var source BranchDecisionSource
	var forkedAtTurnID sql.NullString
	err := reader.QueryRowContext(ctx, `
SELECT parent_conversation_id, decision_source, forked_at_turn_id
FROM conversation_branches
WHERE child_conversation_id = ?
`, command.Target.ConversationID).Scan(&parentConversationID, &source, &forkedAtTurnID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if parentConversationID != command.ParentConversationID ||
		source != BranchDecisionSourceMaster ||
		!forkedAtTurnID.Valid ||
		forkedAtTurnID.String != command.ForkedAtTurnID {
		return false, stateConflict("master route fork", command.Target.ConversationID, "stored effect does not match its command")
	}
	return readConversationRouteTurnEffect(ctx, reader, command.Target.ConversationID, command.TurnID, AuthoredInput{Text: command.Input}, TurnDeliveryNormal)
}

func (store *Store) CompleteMasterRouteCommand(
	ctx context.Context,
	decisionID string,
	completedAt string,
) error {
	completedTime, err := validateMasterRouteCommandCompletionRequest(store, ctx, decisionID, completedAt)
	if err != nil {
		return err
	}
	appendedEvent := false
	err = store.write(ctx, "complete master route command", func(ctx context.Context, tx *sql.Tx) error {
		transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
		defer func() {
			transaction.active = false
		}()
		var completeErr error
		appendedEvent, completeErr = completeMasterRouteCommandTransaction(
			transaction,
			store.dbPath,
			decisionID,
			completedAt,
			completedTime,
		)
		return completeErr
	})
	if err == nil && appendedEvent {
		store.notifyCommittedEvents()
	}
	return err
}

func validateMasterRouteCommandCompletionRequest(
	store *Store,
	ctx context.Context,
	decisionID string,
	completedAt string,
) (time.Time, error) {
	if store == nil {
		return time.Time{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return time.Time{}, errors.New("master route command completion context is required")
	}
	if err := validateIdentifier("master route command decision id", decisionID); err != nil {
		return time.Time{}, err
	}
	return validateTimestamp("master route command completedAt", completedAt)
}

func completeMasterRouteCommandTransaction(
	transaction *WriteTransaction,
	dbPath string,
	decisionID string,
	completedAt string,
	completedTime time.Time,
) (bool, error) {
	record, found, err := readMasterRouteDecisionByID(
		transaction.ctx,
		transaction.tx,
		decisionID,
		dbPath,
	)
	if err != nil {
		return false, err
	}
	if !found {
		return false, stateConflict("master route decision", decisionID, "decision was not found")
	}
	decidedTime, _ := validateTimestamp("master route decision decidedAt", record.DecidedAt)
	if completedTime.Before(decidedTime) {
		return false, errors.New("master route command cannot complete before its decision")
	}
	alreadyCompleted, err := readMasterRouteCommandCompletion(
		transaction.ctx,
		transaction.tx,
		dbPath,
		decisionID,
	)
	if err != nil || alreadyCompleted {
		return false, err
	}
	if _, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO master_route_command_completions(decision_id, completed_at)
VALUES (?, ?)
`, decisionID, completedAt); err != nil {
		return false, fmt.Errorf("complete master route command %s: %w", decisionID, err)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return false, err
	}
	if err := appendMasterTranscriptRouteCommand(transaction, dbPath, record, completedAt); err != nil {
		return false, err
	}
	return true, nil
}

func readMasterRouteCommandCompletion(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	decisionID string,
) (bool, error) {
	var completedAt string
	err := reader.QueryRowContext(ctx, `
SELECT completed_at
FROM master_route_command_completions
WHERE decision_id = ?
`, decisionID).Scan(&completedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if _, err := validateTimestamp("master route command stored completedAt", completedAt); err != nil {
		return false, &CorruptStateError{Path: dbPath, Err: err}
	}
	return true, nil
}

func (store *Store) WaitForMasterPresentationIntent(
	ctx context.Context,
	inputID string,
) (master.PresentationIntent, error) {
	if store == nil {
		return master.PresentationIntent{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.PresentationIntent{}, errors.New("master presentation wait context is required")
	}
	if err := master.ValidateInputID(inputID); err != nil {
		return master.PresentationIntent{}, err
	}
	for {
		wake := store.committedEventWakeChannel()
		intent, ready, err := store.readMasterPresentationIntent(ctx, inputID)
		if err != nil {
			return master.PresentationIntent{}, err
		}
		if ready {
			return intent, nil
		}
		select {
		case <-ctx.Done():
			return master.PresentationIntent{}, ctx.Err()
		case <-store.closing:
			return master.PresentationIntent{}, ErrStoreClosed
		case <-wake:
		}
	}
}

func (store *Store) readMasterPresentationIntent(
	ctx context.Context,
	inputID string,
) (master.PresentationIntent, bool, error) {
	var intent master.PresentationIntent
	ready := false
	err := store.read(ctx, "read master presentation intent", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		state, err := readMasterInputRoutingStateTransaction(ctx, reader, inputID, store.dbPath)
		if err != nil {
			return err
		}
		if state.Status == master.InputRoutingStatusFailed {
			return fmt.Errorf("master input %s failed before producing a presentation intent", inputID)
		}
		if state.Status == master.InputRoutingStatusCancelled {
			return fmt.Errorf("master input %s was cancelled before producing a presentation intent", inputID)
		}
		if state.Decision == nil {
			return nil
		}
		intent, err = master.PresentationIntentForCommand(state.Input.Input, state.Decision.ResultingCommand)
		if err != nil {
			return &CorruptStateError{Path: store.dbPath, Err: err}
		}
		if intent.Kind != master.PresentationIntentKindOpenSideConversation {
			completed, err := readMasterRouteCommandCompletion(ctx, reader, store.dbPath, state.Decision.ID)
			if err != nil || !completed {
				return err
			}
		}
		ready = true
		return reader.Commit()
	})
	return intent, ready, err
}
