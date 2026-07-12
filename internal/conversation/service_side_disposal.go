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
	parentPaneID string,
	sideConversationID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateSideDisposalRequest(parentConversationID, parentPaneID, sideConversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	if _, err := service.workspaces.ResolveActiveWorkspace(workspaceID); err != nil {
		return ConversationSnapshot{}, err
	}

	side, err := service.prepareSideDisposal(ctx, workspaceID, parentConversationID, parentPaneID, sideConversationID)
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

func validateSideDisposalRequest(parentConversationID string, parentPaneID string, sideConversationID string) error {
	if err := validateSideConversationRequest(parentConversationID, parentPaneID); err != nil {
		return err
	}
	return validateIdentifier("side disposal side conversation id", sideConversationID)
}

func (service *Service) disposePreparedSide(
	ctx context.Context,
	workspaceID string,
	side SideConversation,
) error {
	if side.ProviderThreadID == nil {
		return service.finalizeSideDisposal(ctx, workspaceID, side, TurnInterruptionUserRequested)
	}
	hadLocalTurn, localErr := service.stopLocalSideTurn(ctx, side)
	cleanupSide := side
	if hadLocalTurn && localErr == nil {
		cleanupSide.ActiveProviderTurnID = nil
	}
	cleanupErr := service.cleanupSideProviderThread(ctx, cleanupSide)
	if cleanupErr != nil {
		cause := errors.Join(localErr, cleanupErr)
		return service.persistSideCleanupFailure(workspaceID, side, cause)
	}
	return service.finalizeSideDisposal(ctx, workspaceID, side, TurnInterruptionUserRequested)
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
	parentPaneID string,
	sideConversationID string,
) (SideConversation, error) {
	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, parentConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	side, err := findSideConversation(snapshot, sideConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	if side.ParentPaneID != parentPaneID {
		return SideConversation{}, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         fmt.Sprintf("side conversation %s belongs to pane %s", side.ID, side.ParentPaneID),
		}
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

func (service *Service) stopLocalSideTurn(
	ctx context.Context,
	side SideConversation,
) (bool, error) {
	service.activeMu.Lock()
	active := service.activeSides[side.ID]
	service.activeMu.Unlock()
	if active == nil {
		return false, nil
	}
	var interruptErr error
	if side.ActiveProviderTurnID != nil && side.ProviderThreadID != nil {
		interruptErr = service.agent.InterruptTurn(ctx, agentTurnControl(side, active.turnID))
	}
	if interruptErr != nil || side.ActiveProviderTurnID == nil {
		active.cancel()
	}
	select {
	case <-active.done:
		return true, interruptErr
	case <-ctx.Done():
		active.cancel()
		return true, errors.Join(interruptErr, ctx.Err())
	}
}

func agentTurnControl(side SideConversation, turnID string) agent.TurnControlRequest {
	return agent.TurnControlRequest{
		ConversationID:   side.ID,
		ProviderThreadID: *side.ProviderThreadID,
		ProviderTurnID:   *side.ActiveProviderTurnID,
		ClientInputID:    turnID,
	}
}

func (service *Service) cleanupSideProviderThread(ctx context.Context, side SideConversation) error {
	if side.ProviderThreadID == nil {
		return nil
	}
	threadID := *side.ProviderThreadID
	if side.Status == SideConversationStatusFailed &&
		side.Failure != nil &&
		side.Failure.Code == "side_thread_fork_failed" {
		if err := service.agent.UnsubscribeThread(ctx, threadID); err != nil {
			return fmt.Errorf("unsubscribe rejected side provider thread %s: %w", threadID, err)
		}
		return nil
	}
	var interruptErr error
	if side.ActiveProviderTurnID != nil {
		interruptErr = service.agent.InterruptProviderTurn(ctx, threadID, *side.ActiveProviderTurnID)
	}
	unsubscribeStatus, unsubscribeErr := service.agent.UnsubscribeThreadWithStatus(ctx, threadID)
	if unsubscribeErr != nil {
		return errors.Join(interruptErr, fmt.Errorf("unsubscribe side provider thread %s: %w", threadID, unsubscribeErr))
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
	side, err := findSideConversation(snapshot, known.ID)
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
	side.ActiveProviderTurnID = nil
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
		ID:               eventID,
		ConversationID:   side.ID,
		TurnID:           activeTurnID,
		Sequence:         side.LastEventSequence,
		EmittedAt:        now,
		Kind:             TrajectoryEventTurnInterrupted,
		Actor:            TrajectoryActorSystem,
		ProviderThreadID: side.ProviderThreadID,
		TurnInterrupted:  &TrajectoryTurnInterrupted{Reason: reason},
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
	side, err := findSideConversation(snapshot, sideConversationID)
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
	// Keep the exact active provider identity until cleanup succeeds. A local
	// cleanup error is not evidence that the provider turn stopped, and the
	// durable ids are what make the failure genuinely retryable after restart.
	return service.persistSideConversation(context.Background(), &expected, side)
}

// RecoverSideConversations disposes every interrupted ephemeral child before
// normal app workflows resume. Provider cleanup failures are made durable and
// retryable; only failures to record that state abort startup.
func (service *Service) RecoverSideConversations(ctx context.Context) error {
	recoverable, err := service.store.readRecoverableSideConversations(ctx)
	if err != nil {
		return err
	}
	var persistenceErrors []error
	for _, record := range recoverable {
		side := record.Side
		if side.Status == SideConversationStatusPreparing && side.ProviderThreadID == nil {
			cause := errors.New("side conversation preparation was interrupted by restart")
			if err := service.failSideDisposal(record.WorkspaceID, side.ParentConversationID, side.ID, "side_restart_interrupted", cause); err != nil {
				persistenceErrors = append(persistenceErrors, err)
			}
			continue
		}
		if side.Status == SideConversationStatusActive {
			prepared, err := service.prepareSideDisposal(
				ctx,
				record.WorkspaceID,
				side.ParentConversationID,
				side.ParentPaneID,
				side.ID,
			)
			if err != nil {
				persistenceErrors = append(persistenceErrors, err)
				continue
			}
			side = prepared
		}
		cleanupErr := service.cleanupSideProviderThread(ctx, side)
		if cleanupErr != nil {
			if err := service.failSideDisposal(
				record.WorkspaceID,
				side.ParentConversationID,
				side.ID,
				"side_restart_cleanup_failed",
				cleanupErr,
			); err != nil {
				persistenceErrors = append(persistenceErrors, errors.Join(cleanupErr, err))
			}
			continue
		}
		if err := service.finalizeSideDisposal(ctx, record.WorkspaceID, side, TurnInterruptionReconciliation); err != nil {
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
       side.id, side.parent_conversation_id, side.parent_pane_id,
       side.provider_thread_id, side.source_provider_thread_id,
       side.source_provider_turn_id, side.source_trajectory_sequence,
       side.last_event_sequence, side.active_turn_id, side.active_provider_turn_id,
       side.status, side.resolved_side_agent_invocation_json,
       side.created_at, side.updated_at, side.disposed_at, side.failure_json
FROM side_conversations AS side
JOIN conversations AS parent ON parent.id = side.parent_conversation_id
WHERE side.disposed_at IS NULL
  AND (
    side.status IN ('preparing', 'active', 'disposing')
    OR (side.status = 'failed' AND side.provider_thread_id IS NOT NULL)
  )
ORDER BY side.created_at, side.id
`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var record recoverableSideConversation
			var providerThreadID, sourceProviderTurnID, activeTurnID, activeProviderTurnID sql.NullString
			var disposedAt, failureJSON sql.NullString
			var invocationJSON string
			if err := rows.Scan(
				&record.WorkspaceID,
				&record.Side.ParentStatus,
				&record.Side.ID,
				&record.Side.ParentConversationID,
				&record.Side.ParentPaneID,
				&providerThreadID,
				&record.Side.SourceProviderThreadID,
				&sourceProviderTurnID,
				&record.Side.SourceTrajectorySequence,
				&record.Side.LastEventSequence,
				&activeTurnID,
				&activeProviderTurnID,
				&record.Side.Status,
				&invocationJSON,
				&record.Side.CreatedAt,
				&record.Side.UpdatedAt,
				&disposedAt,
				&failureJSON,
			); err != nil {
				return err
			}
			record.Side.ProviderThreadID = optionalScannedString(providerThreadID)
			record.Side.SourceProviderTurnID = optionalScannedString(sourceProviderTurnID)
			record.Side.ActiveTurnID = optionalScannedString(activeTurnID)
			record.Side.ActiveProviderTurnID = optionalScannedString(activeProviderTurnID)
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
