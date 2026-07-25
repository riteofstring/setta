package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"setta/internal/master"
)

func resolveMasterRouteClarificationForClaim(
	transaction *WriteTransaction,
	dbPath string,
	accepted master.AcceptedMasterInput,
) (*master.RouteDecisionRecord, error) {
	if accepted.Input.Source != master.MasterInputSourceShell {
		return nil, nil
	}
	linked, found, err := readMasterRouteClarificationForReply(
		transaction.ctx,
		transaction.tx,
		accepted.Input.ID,
		dbPath,
	)
	if err != nil || found {
		return linked, err
	}
	prior, found, err := readPendingMasterRouteClarificationBeforeInput(
		transaction.ctx,
		transaction.tx,
		accepted.Sequence,
		dbPath,
	)
	if err != nil || !found {
		return nil, err
	}
	if err := insertMasterRouteClarificationReply(
		transaction,
		accepted.Input.ID,
		prior.ID,
	); err != nil {
		return nil, err
	}
	return &prior, nil
}

func readMasterRouteClarificationForReply(
	ctx context.Context,
	reader masterInputQuery,
	replyInputID string,
	dbPath string,
) (*master.RouteDecisionRecord, bool, error) {
	var decisionID string
	err := reader.QueryRowContext(ctx, `
SELECT clarification_decision_id
FROM master_route_clarification_replies
WHERE reply_input_id = ?
`, replyInputID).Scan(&decisionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("read master route clarification reply %s: %w", replyInputID, err)
	}
	record, found, err := readMasterRouteDecisionByID(ctx, reader, decisionID, dbPath)
	if err != nil || !found {
		return nil, false, err
	}
	if err := validateMasterRouteClarificationRecord(record); err != nil {
		return nil, false, &CorruptStateError{Path: dbPath, Err: err}
	}
	return &record, true, nil
}

func readPendingMasterRouteClarificationBeforeInput(
	ctx context.Context,
	reader masterInputQuery,
	inputSequence int,
	dbPath string,
) (master.RouteDecisionRecord, bool, error) {
	record, err := scanMasterRouteDecision(reader.QueryRowContext(ctx, masterRouteDecisionSelect+`
WHERE input_id IN (
    SELECT id
    FROM master_inputs
    WHERE input_source = ?
      AND sequence < ?
  )
  AND json_extract(master_route_decisions.resulting_command_json, '$.kind') = ?
  AND NOT EXISTS (
    SELECT 1
    FROM master_route_clarification_replies AS reply
    JOIN master_inputs AS reply_input
      ON reply_input.id = reply.reply_input_id
    WHERE reply.clarification_decision_id = master_route_decisions.id
      AND reply_input.routing_status = ?
  )
ORDER BY (
  SELECT sequence
  FROM master_inputs
  WHERE id = master_route_decisions.input_id
) DESC
LIMIT 1
`,
		master.MasterInputSourceShell,
		inputSequence,
		master.RouteDecisionKindClarify,
		master.InputRoutingStatusDecided,
	), dbPath)
	if errors.Is(err, sql.ErrNoRows) {
		return master.RouteDecisionRecord{}, false, nil
	}
	if err != nil {
		return master.RouteDecisionRecord{}, false, err
	}
	if err := validateMasterRouteClarificationRecord(record); err != nil {
		return master.RouteDecisionRecord{}, false, &CorruptStateError{Path: dbPath, Err: err}
	}
	return record, true, nil
}

func insertMasterRouteClarificationReply(
	transaction *WriteTransaction,
	replyInputID string,
	clarificationDecisionID string,
) error {
	if _, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO master_route_clarification_replies(reply_input_id, clarification_decision_id)
VALUES (?, ?)
ON CONFLICT(reply_input_id) DO NOTHING
`, replyInputID, clarificationDecisionID); err != nil {
		return fmt.Errorf("record master route clarification reply %s: %w", replyInputID, err)
	}
	return transaction.recordStateMutation()
}

func validateMasterRouteClarificationRecord(record master.RouteDecisionRecord) error {
	if err := record.Validate(); err != nil {
		return err
	}
	if record.Decision.Kind != master.RouteDecisionKindClarify ||
		record.ResultingCommand.Kind != master.RouteDecisionKindClarify ||
		record.ResultingCommand.Clarify == nil {
		return fmt.Errorf("master route decision %s is not a clarification", record.ID)
	}
	return nil
}

func requireMasterRouteClarificationReplyState(
	transaction *WriteTransaction,
	dbPath string,
	commit master.RouteDecisionCommit,
) error {
	prior, found, err := readMasterRouteClarificationForReply(
		transaction.ctx,
		transaction.tx,
		commit.InputID,
		dbPath,
	)
	if err != nil {
		return err
	}
	if !found {
		if commit.Context.Clarification != nil {
			return stateConflict(
				"master route decision",
				commit.ID,
				"clarification context is not linked to the durable input",
			)
		}
		return nil
	}
	if commit.Context.Clarification == nil ||
		commit.Context.Clarification.DecisionID != prior.ID ||
		commit.Context.Clarification.InputSequence != prior.Context.InputSequence ||
		!slices.Equal(
			commit.Context.Clarification.CandidateTargetIDs,
			prior.ResultingCommand.Clarify.CandidateTargetIDs,
		) {
		return stateConflict(
			"master route decision",
			commit.ID,
			"clarification context does not match the durable reply link",
		)
	}
	return nil
}
