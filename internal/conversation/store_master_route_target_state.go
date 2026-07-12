package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/conversationindex"
	"setta/internal/jsonio"
	"setta/internal/master"
)

func validateMasterRouteTargetIDs(conversationIDs []string) error {
	seen := map[string]bool{}
	for _, conversationID := range conversationIDs {
		if err := validateIdentifier("master route target conversation id", conversationID); err != nil {
			return err
		}
		if seen[conversationID] {
			return fmt.Errorf("master route target %s is duplicated", conversationID)
		}
		seen[conversationID] = true
	}
	return nil
}

func readMasterRouteTargetPanes(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
) ([]string, int, error) {
	rows, err := reader.QueryContext(ctx, `
WITH pane_activity AS (
  SELECT pane_id, COALESCE(last_focused_at, updated_at) AS focused_at
  FROM pane_bindings
  WHERE conversation_id = ?
), normalized_pane_activity AS (
  SELECT
    pane_id,
    substr(focused_at, 1, 19) || '.' ||
      substr(
        CASE
          WHEN instr(focused_at, '.') = 20
            THEN substr(focused_at, 21, length(focused_at) - 21)
          ELSE ''
        END || '000000000',
        1,
        9
      ) AS focused_sort_key
  FROM pane_activity
)
SELECT pane_id
FROM normalized_pane_activity
ORDER BY focused_sort_key DESC, pane_id
`, conversationID)
	if err != nil {
		return nil, 0, fmt.Errorf("read master route target panes: %w", err)
	}
	defer rows.Close()
	ids := []string{}
	count := 0
	for rows.Next() {
		var paneID string
		if err := rows.Scan(&paneID); err != nil {
			return nil, 0, err
		}
		count++
		if len(ids) < conversationindex.MaxOpenPaneIDs {
			ids = append(ids, paneID)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return ids, count, nil
}

func readMasterRouteActiveTurn(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
) (*string, error) {
	var turnID string
	err := reader.QueryRowContext(ctx, `
SELECT id
FROM conversation_turns
WHERE conversation_id = ? AND status = ?
ORDER BY accepted_at DESC, id DESC
LIMIT 1
`, conversationID, TurnStatusRunning).Scan(&turnID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read master route target active turn: %w", err)
	}
	return &turnID, nil
}

func readMasterRouteForkPoints(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
	limit int,
) ([]master.RouteForkPoint, error) {
	if limit == 0 {
		return []master.RouteForkPoint{}, nil
	}
	rows, err := reader.QueryContext(ctx, `
SELECT id, authored_input_json, ended_at
FROM conversation_turns
WHERE conversation_id = ? AND status = ?
ORDER BY ended_at DESC, id DESC
LIMIT ?
`, conversationID, TurnStatusCompleted, limit)
	if err != nil {
		return nil, fmt.Errorf("read master route fork points: %w", err)
	}
	defer rows.Close()
	points := []master.RouteForkPoint{}
	for rows.Next() {
		var turnID, authoredInputJSON, completedAt string
		if err := rows.Scan(&turnID, &authoredInputJSON, &completedAt); err != nil {
			return nil, err
		}
		var authoredInput AuthoredInput
		if err := jsonio.DecodeSingle(bytes.NewBufferString(authoredInputJSON), &authoredInput); err != nil {
			return nil, fmt.Errorf("decode master route fork point input: %w", err)
		}
		points = append(points, master.RouteForkPoint{
			TurnID:       turnID,
			InputExcerpt: conversationindex.NewTextExcerpt(authoredInput.Text).Text,
			CompletedAt:  completedAt,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return points, nil
}

func readMasterRouteAllowedKinds(
	ctx context.Context,
	reader masterRouteReader,
	conversation TopicConversation,
	openPaneIDs []string,
	activeTurnID *string,
	forkPoints []master.RouteForkPoint,
) ([]master.RouteDecisionKind, error) {
	allowed := []master.RouteDecisionKind{master.RouteDecisionKindFocusConversation}
	narratorAvailable, err := masterRouteNarratorAvailable(ctx, reader, conversation.ID)
	if err != nil {
		return nil, err
	}
	if narratorAvailable {
		allowed = append([]master.RouteDecisionKind{master.RouteDecisionKindAskNarrator}, allowed...)
	}
	agentAvailable, err := masterRouteAgentAvailable(ctx, reader, conversation.ID)
	if err != nil || !agentAvailable {
		return allowed, err
	}
	workKinds, err := masterRouteWorkKinds(ctx, reader, conversation, activeTurnID)
	if err != nil {
		return nil, err
	}
	allowed = append(allowed, workKinds...)
	if len(openPaneIDs) > 0 {
		allowed = append(allowed, master.RouteDecisionKindCreateSideConversation)
	}
	if len(forkPoints) > 0 {
		allowed = append(allowed, master.RouteDecisionKindForkConversation)
	}
	return allowed, nil
}

func masterRouteNarratorAvailable(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
) (bool, error) {
	var count int
	if err := reader.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM narrator_state
WHERE conversation_id = ?
`, conversationID).Scan(&count); err != nil {
		return false, fmt.Errorf("read master route target narrator capability: %w", err)
	}
	return count == 1, nil
}

func masterRouteAgentAvailable(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
) (bool, error) {
	var count int
	if err := reader.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM agent_thread_bindings
WHERE conversation_id = ? AND status = ?
`, conversationID, ThreadBindingStatusLinked).Scan(&count); err != nil {
		return false, fmt.Errorf("read master route target agent capability: %w", err)
	}
	return count > 0, nil
}

func masterRouteWorkKinds(
	ctx context.Context,
	reader masterRouteReader,
	conversation TopicConversation,
	activeTurnID *string,
) ([]master.RouteDecisionKind, error) {
	switch conversation.Status {
	case ConversationStatusIdle, ConversationStatusFailed:
		return []master.RouteDecisionKind{master.RouteDecisionKindSendToAgent}, nil
	case ConversationStatusWorking, ConversationStatusWaitingForApproval:
		return activeMasterRouteWorkKinds(ctx, reader, conversation.ID, activeTurnID)
	default:
		return nil, fmt.Errorf(
			"master route target %s has unsupported status %s",
			conversation.ID,
			conversation.Status,
		)
	}
}

func activeMasterRouteWorkKinds(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
	activeTurnID *string,
) ([]master.RouteDecisionKind, error) {
	if activeTurnID == nil {
		return []master.RouteDecisionKind{}, nil
	}
	var queued int
	if err := reader.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM conversation_queue
WHERE conversation_id = ?
`, conversationID).Scan(&queued); err != nil {
		return nil, fmt.Errorf("read master route target queue capacity: %w", err)
	}
	allowed := []master.RouteDecisionKind{}
	if queued < MaxSnapshotQueuedTurns {
		allowed = append(allowed, master.RouteDecisionKindQueueAgentTurn)
	}
	return append(allowed, master.RouteDecisionKindSteerActiveTurn), nil
}
