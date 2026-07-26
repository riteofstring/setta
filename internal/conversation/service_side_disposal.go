package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/agent"
)

type recoverableSideConversation struct {
	Side        SideConversation
	WorkspaceID string
}

func (service *Service) DisposeSideConversation(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateSideDisposalRequest(parentConversationID, sideConversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	if _, err := service.workspaces.ResolveActiveWorkspace(workspaceID); err != nil {
		return ConversationSnapshot{}, err
	}

	side, err := service.prepareSideDisposal(ctx, workspaceID, parentConversationID, sideConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if side.DisposedAt != nil {
		return service.store.ReadSnapshot(ctx, workspaceID, parentConversationID)
	}
	if err := service.disposePreparedSide(ctx, workspaceID, side); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, parentConversationID)
}

func validateSideDisposalRequest(parentConversationID string, sideConversationID string) error {
	if err := validateSideConversationRequest(parentConversationID); err != nil {
		return err
	}
	return validateIdentifier("side disposal side conversation id", sideConversationID)
}

func (service *Service) disposePreparedSide(
	ctx context.Context,
	workspaceID string,
	side SideConversation,
) error {
	carrier, live := service.carriers.Lookup(side.ID)
	if !live {
		return service.finalizeSideDisposal(ctx, workspaceID, side, TurnInterruptionUserRequested)
	}
	hadLocalTurn, activeProviderTurnID, localErr := service.stopLocalSideTurn(ctx, side, carrier)
	cleanupSide := side
	if hadLocalTurn {
		current, refreshErr := service.readSideAfterLocalTurn(workspaceID, side)
		if refreshErr != nil {
			cause := errors.Join(localErr, refreshErr)
			return service.persistSideCleanupFailure(workspaceID, side, cause)
		}
		if current.DisposedAt != nil {
			return nil
		}
		cleanupSide = current
		if current.ActiveTurnID == nil {
			// A durable terminal event is stronger evidence than an interrupt
			// rejection racing that terminal transition.
			localErr = nil
			activeProviderTurnID = ""
		}
	}
	cleanupErr := service.cleanupSideCarrier(ctx, cleanupSide, carrier, activeProviderTurnID)
	if cleanupErr != nil {
		cause := errors.Join(localErr, cleanupErr)
		return service.persistSideCleanupFailure(workspaceID, side, cause)
	}
	service.carriers.Forget(side.ID)
	return service.finalizeSideDisposal(ctx, workspaceID, side, TurnInterruptionUserRequested)
}

func (service *Service) readSideAfterLocalTurn(
	workspaceID string,
	side SideConversation,
) (SideConversation, error) {
	lock := service.conversationLock(side.ParentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.store.ReadSnapshot(
		context.Background(),
		workspaceID,
		side.ParentConversationID,
	)
	if err != nil {
		return SideConversation{}, fmt.Errorf("read side conversation %s after local turn: %w", side.ID, err)
	}
	current, err := service.readSideConversation(context.Background(), snapshot, side.ID)
	if err != nil {
		return SideConversation{}, fmt.Errorf("read side conversation %s after local turn: %w", side.ID, err)
	}
	return current, nil
}

func (service *Service) persistSideCleanupFailure(
	workspaceID string,
	side SideConversation,
	cause error,
) error {
	if persistErr := service.failSideDisposal(
		workspaceID,
		side.ParentConversationID,
		side.ID,
		"side_disposal_failed",
		cause,
	); persistErr != nil {
		return errors.Join(cause, persistErr)
	}
	return cause
}

func (service *Service) prepareSideDisposal(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
) (SideConversation, error) {
	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, parentConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	side, err := service.readSideConversation(ctx, snapshot, sideConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	if side.DisposedAt != nil {
		return side, nil
	}
	switch side.Status {
	case SideConversationStatusActive:
		expected := SideConversationExpectation{Status: side.Status, UpdatedAt: side.UpdatedAt}
		side.Status = SideConversationStatusDisposing
		side.ParentStatus = snapshot.Conversation.Status
		side.UpdatedAt = advanceTimestamp(side.UpdatedAt, service.timestamp())
		if err := service.persistSideConversation(ctx, &expected, side); err != nil {
			return SideConversation{}, err
		}
	case SideConversationStatusDisposing:
	case SideConversationStatusFailed:
	case SideConversationStatusPreparing:
		return SideConversation{}, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         fmt.Sprintf("side conversation %s is still preparing", side.ID),
		}
	default:
		return SideConversation{}, fmt.Errorf("side conversation %s has unsupported status %q", side.ID, side.Status)
	}
	return side, nil
}

// stopLocalSideTurn ends the attachment this process holds for a side turn. It
// reports whether there was one and, if the provider had already named the run,
// which provider turn is still outstanding for carrier cleanup.
func (service *Service) stopLocalSideTurn(
	ctx context.Context,
	side SideConversation,
	carrier Carrier,
) (bool, string, error) {
	service.activeMu.Lock()
	active := service.activeSides[side.ID]
	providerTurnID := ""
	if active != nil {
		providerTurnID = active.providerTurnID
	}
	service.activeMu.Unlock()
	if active == nil {
		return false, "", nil
	}
	var interruptErr error
	if providerTurnID != "" {
		interruptErr = service.agent.InterruptTurn(ctx, agent.TurnControlRequest{
			ConversationID:   side.ID,
			ProviderThreadID: carrier.ThreadID,
			ProviderTurnID:   providerTurnID,
			ClientInputID:    active.turnID,
		})
	}
	if interruptErr != nil || providerTurnID == "" {
		active.cancel()
	}
	select {
	case <-active.done:
		return true, providerTurnID, interruptErr
	case <-ctx.Done():
		active.cancel()
		return true, providerTurnID, errors.Join(interruptErr, ctx.Err())
	}
}

func (service *Service) cleanupSideCarrier(
	ctx context.Context,
	side SideConversation,
	carrier Carrier,
	activeProviderTurnID string,
) error {
	if side.Status == SideConversationStatusFailed &&
		side.Failure != nil &&
		side.Failure.Code == "side_carrier_start_failed" {
		if err := service.agent.UnsubscribeThread(ctx, carrier.ThreadID); err != nil {
			return fmt.Errorf("unsubscribe rejected side carrier %s: %w", carrier.ThreadID, err)
		}
		return nil
	}
	var interruptErr error
	if activeProviderTurnID != "" {
		interruptErr = service.agent.InterruptProviderTurn(ctx, carrier.ThreadID, activeProviderTurnID)
	}
	unsubscribeStatus, unsubscribeErr := service.agent.UnsubscribeThreadWithStatus(ctx, carrier.ThreadID)
	if unsubscribeErr != nil {
		return errors.Join(interruptErr, fmt.Errorf("unsubscribe side carrier %s: %w", carrier.ThreadID, unsubscribeErr))
	}
	if interruptErr != nil && unsubscribeStatus != agent.ThreadUnsubscribeStatusNotLoaded {
		return interruptErr
	}
	return nil
}

func (service *Service) finalizeSideDisposal(
	ctx context.Context,
	workspaceID string,
	known SideConversation,
	reason TurnInterruptionReason,
) error {
	lock := service.conversationLock(known.ParentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, known.ParentConversationID)
	if err != nil {
		return err
	}
	side, err := service.readSideConversation(ctx, snapshot, known.ID)
	if err != nil {
		return err
	}
	if side.DisposedAt != nil {
		return nil
	}
	now := advanceTimestamp(side.UpdatedAt, service.timestamp())
	expected := SideConversationExpectation{Status: side.Status, UpdatedAt: side.UpdatedAt}
	activeTurnID := cloneStringPointer(side.ActiveTurnID)
	side.ParentStatus = snapshot.Conversation.Status
	side.ActiveTurnID = nil
	side.UpdatedAt = now
	side.DisposedAt = &now
	if side.ResolvedSideAgentInvocation.Outcome == InvocationOutcomeRunning {
		side.ResolvedSideAgentInvocation = terminalInvocation(
			side.ResolvedSideAgentInvocation,
			InvocationOutcomeCancelled,
			now,
			nil,
		)
	}
	if activeTurnID == nil {
		return service.persistSideConversation(ctx, &expected, side)
	}
	eventID, err := service.newID("side_event")
	if err != nil {
		return err
	}
	side.LastEventSequence++
	event := TrajectoryEvent{
		ID:              eventID,
		ConversationID:  side.ID,
		TurnID:          activeTurnID,
		Sequence:        side.LastEventSequence,
		EmittedAt:       now,
		Kind:            TrajectoryEventTurnInterrupted,
		Actor:           TrajectoryActorSystem,
		TurnInterrupted: &TrajectoryTurnInterrupted{Reason: reason},
	}
	return service.persistSideConversationEvent(ctx, expected, side, event)
}

func (service *Service) failSideDisposal(
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
	code string,
	cause error,
) error {
	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.store.ReadSnapshot(context.Background(), workspaceID, parentConversationID)
	if err != nil {
		return err
	}
	side, err := service.readSideConversation(context.Background(), snapshot, sideConversationID)
	if err != nil {
		return err
	}
	if side.DisposedAt != nil {
		return nil
	}
	diagnosticID, err := service.newID("side_diagnostic")
	if err != nil {
		return err
	}
	now := advanceTimestamp(side.UpdatedAt, service.timestamp())
	expected := SideConversationExpectation{Status: side.Status, UpdatedAt: side.UpdatedAt}
	failure := Failure{
		Code:                code,
		Message:             cause.Error(),
		Retryable:           true,
		DiagnosticReference: diagnosticID,
	}
	side.ParentStatus = snapshot.Conversation.Status
	side.Status = SideConversationStatusFailed
	side.UpdatedAt = now
	side.Failure = &failure
	side.ResolvedSideAgentInvocation = terminalInvocation(
		side.ResolvedSideAgentInvocation,
		InvocationOutcomeFailed,
		now,
		&failure,
	)
	// Leave the side undisposed while its carrier is still registered. A local
	// cleanup error is not evidence that the provider turn stopped; restart
	// recovery settles the Setta record without contacting the expired carrier.
	return service.persistSideConversation(context.Background(), &expected, side)
}

// RecoverSideConversations settles side work that outlived the previous Setta
// process.
//
// A side conversation runs on an ephemeral carrier, so the restart already took
// its provider thread with it. There is nothing to interrupt and nothing to
// unsubscribe: what is left is the Setta record, which is closed here so a side
// nobody can talk to stops presenting itself as open.
func (service *Service) RecoverSideConversations(ctx context.Context) error {
	recoverable, err := service.store.readRecoverableSideConversations(ctx)
	if err != nil {
		return err
	}
	var persistenceErrors []error
	for _, record := range recoverable {
		side := record.Side
		if side.Status == SideConversationStatusPreparing {
			cause := errors.New("side conversation preparation was interrupted by restart")
			if err := service.failSideDisposal(record.WorkspaceID, side.ParentConversationID, side.ID, "side_restart_interrupted", cause); err != nil {
				persistenceErrors = append(persistenceErrors, err)
				continue
			}
		}
		if side.Status == SideConversationStatusActive {
			prepared, err := service.prepareSideDisposal(
				ctx,
				record.WorkspaceID,
				side.ParentConversationID,
				side.ID,
			)
			if err != nil {
				persistenceErrors = append(persistenceErrors, err)
				continue
			}
			side = prepared
		}
		if err := service.finalizeSideDisposal(ctx, record.WorkspaceID, side, TurnInterruptionRuntimeRestarted); err != nil {
			persistenceErrors = append(persistenceErrors, err)
		}
	}
	return errors.Join(persistenceErrors...)
}

func (store *Store) readRecoverableSideConversations(ctx context.Context) ([]recoverableSideConversation, error) {
	var records []recoverableSideConversation
	err := store.read(ctx, "read recoverable side conversations", func(ctx context.Context, connection *sql.Conn) error {
		rows, err := connection.QueryContext(ctx, `
SELECT parent.workspace_id, parent.status,
       side.id, side.parent_conversation_id,
       side.decision_source, side.source_turn_id,
       side.source_trajectory_sequence, side.last_event_sequence,
       side.active_turn_id, side.status,
       side.resolved_side_agent_invocation_json,
       side.created_at, side.updated_at, side.disposed_at, side.failure_json
FROM side_conversations AS side
JOIN conversations AS parent ON parent.id = side.parent_conversation_id
WHERE side.disposed_at IS NULL
ORDER BY side.created_at, side.id
`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var record recoverableSideConversation
			var sourceTurnID, activeTurnID sql.NullString
			var disposedAt, failureJSON sql.NullString
			var invocationJSON string
			if err := rows.Scan(
				&record.WorkspaceID,
				&record.Side.ParentStatus,
				&record.Side.ID,
				&record.Side.ParentConversationID,
				&record.Side.DecisionSource,
				&sourceTurnID,
				&record.Side.SourceTrajectorySequence,
				&record.Side.LastEventSequence,
				&activeTurnID,
				&record.Side.Status,
				&invocationJSON,
				&record.Side.CreatedAt,
				&record.Side.UpdatedAt,
				&disposedAt,
				&failureJSON,
			); err != nil {
				return err
			}
			record.Side.SourceTurnID = optionalScannedString(sourceTurnID)
			record.Side.ActiveTurnID = optionalScannedString(activeTurnID)
			record.Side.DisposedAt = optionalScannedString(disposedAt)
			if err := decodeJSON("recoverable side invocation", invocationJSON, &record.Side.ResolvedSideAgentInvocation); err != nil {
				return err
			}
			if err := decodeOptionalJSON("recoverable side failure", failureJSON, &record.Side.Failure); err != nil {
				return err
			}
			if err := record.Side.Validate(); err != nil {
				return err
			}
			records = append(records, record)
		}
		return rows.Err()
	})
	return records, err
}
