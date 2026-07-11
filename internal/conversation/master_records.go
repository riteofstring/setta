package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type MasterSessionRecord struct {
	ID                 string             `json:"id"`
	Provider           Provider           `json:"provider"`
	ProviderThreadID   *string            `json:"providerThreadId"`
	Status             string             `json:"status"`
	ResolvedInvocation ResolvedInvocation `json:"resolvedInvocation"`
	DurableContext     json.RawMessage    `json:"durableContext"`
	CreatedAt          string             `json:"createdAt"`
	UpdatedAt          string             `json:"updatedAt"`
	Degradation        *Failure           `json:"degradation"`
}

type MasterRouteDecisionRecord struct {
	StreamSequence        int                `json:"streamSequence"`
	ID                    string             `json:"id"`
	MasterSessionID       string             `json:"masterSessionId"`
	InputID               string             `json:"inputId"`
	InputModality         string             `json:"inputModality"`
	InputText             string             `json:"inputText"`
	InputSubmittedAt      string             `json:"inputSubmittedAt"`
	FocusedWorkspaceID    *string            `json:"focusedWorkspaceId"`
	FocusedConversationID *string            `json:"focusedConversationId"`
	FocusedPaneID         *string            `json:"focusedPaneId"`
	CandidateContext      json.RawMessage    `json:"candidateContext"`
	RouteDecision         json.RawMessage    `json:"routeDecision"`
	ResultingCommand      json.RawMessage    `json:"resultingCommand"`
	ResolvedInvocation    ResolvedInvocation `json:"resolvedInvocation"`
	Outcome               string             `json:"outcome"`
	Error                 *Failure           `json:"error"`
	CreatedAt             string             `json:"createdAt"`
}

func (record MasterSessionRecord) Validate() error {
	if err := validateIdentifier("master session id", record.ID); err != nil {
		return err
	}
	if record.Provider != ProviderCodex {
		return fmt.Errorf("master session has unsupported provider %q", record.Provider)
	}
	if err := validateOptionalIdentifier("master provider thread id", record.ProviderThreadID); err != nil {
		return err
	}
	switch record.Status {
	case "ready", "running", "degraded":
	default:
		return fmt.Errorf("master session has unsupported status %q", record.Status)
	}
	if err := record.ResolvedInvocation.Validate(); err != nil {
		return fmt.Errorf("master session invocation: %w", err)
	}
	if record.ResolvedInvocation.Role != RoleMaster {
		return errors.New("master session invocation must use the master role")
	}
	if err := validateJSONDocument("master durable context", record.DurableContext); err != nil {
		return err
	}
	createdAt, err := validateTimestamp("master session createdAt", record.CreatedAt)
	if err != nil {
		return err
	}
	updatedAt, err := validateTimestamp("master session updatedAt", record.UpdatedAt)
	if err != nil {
		return err
	}
	if updatedAt.Before(createdAt) {
		return errors.New("master session updatedAt precedes createdAt")
	}
	if record.Status == "degraded" && record.Degradation == nil {
		return errors.New("degraded master session requires degradation")
	}
	if record.Status != "degraded" && record.Degradation != nil {
		return errors.New("non-degraded master session must not contain degradation")
	}
	if record.Degradation != nil {
		return record.Degradation.Validate()
	}
	return nil
}

func (record MasterRouteDecisionRecord) Validate() error {
	if err := validateIdentifier("master route decision id", record.ID); err != nil {
		return err
	}
	if err := validateIdentifier("master route session id", record.MasterSessionID); err != nil {
		return err
	}
	if err := validateIdentifier("master route input id", record.InputID); err != nil {
		return err
	}
	if record.InputModality != "text" && record.InputModality != "voice" {
		return fmt.Errorf("master route decision has unsupported modality %q", record.InputModality)
	}
	if err := validateTrimmedText("master route input", record.InputText); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("master focused workspace id", record.FocusedWorkspaceID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("master focused conversation id", record.FocusedConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("master focused pane id", record.FocusedPaneID); err != nil {
		return err
	}
	if _, err := validateTimestamp("master route input submittedAt", record.InputSubmittedAt); err != nil {
		return err
	}
	if err := validateJSONDocument("master candidate context", record.CandidateContext); err != nil {
		return err
	}
	if err := validateJSONDocument("master route decision", record.RouteDecision); err != nil {
		return err
	}
	if len(record.ResultingCommand) > 0 {
		if err := validateJSONDocument("master resulting command", record.ResultingCommand); err != nil {
			return err
		}
	}
	if err := record.ResolvedInvocation.Validate(); err != nil {
		return fmt.Errorf("master route invocation: %w", err)
	}
	if record.ResolvedInvocation.Role != RoleMaster {
		return errors.New("master route invocation must use the master role")
	}
	switch record.Outcome {
	case "succeeded":
		if record.Error != nil {
			return errors.New("successful master route must not contain an error")
		}
	case "failed":
		if record.Error == nil {
			return errors.New("failed master route requires an error")
		}
	default:
		return fmt.Errorf("master route has unsupported outcome %q", record.Outcome)
	}
	if record.Error != nil {
		if err := record.Error.Validate(); err != nil {
			return err
		}
	}
	_, err := validateTimestamp("master route createdAt", record.CreatedAt)
	return err
}

func (transaction *WriteTransaction) InsertMasterSession(record MasterSessionRecord) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := record.Validate(); err != nil {
		return err
	}
	invocation, err := encodeJSONColumn("master session invocation", record.ResolvedInvocation)
	if err != nil {
		return err
	}
	degradation, err := encodeOptionalJSONColumn("master session degradation", record.Degradation)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO master_sessions (
  id, provider, provider_thread_id, status, resolved_invocation_json,
  durable_context_json, created_at, updated_at, degradation_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, record.ID, record.Provider, nullableString(record.ProviderThreadID), record.Status,
		invocation, string(record.DurableContext), record.CreatedAt, record.UpdatedAt, degradation)
	if err != nil {
		return fmt.Errorf("insert master session %s: %w", record.ID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateMasterSession(expectedUpdatedAt string, record MasterSessionRecord) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if _, err := validateTimestamp("expected master session updatedAt", expectedUpdatedAt); err != nil {
		return err
	}
	if err := record.Validate(); err != nil {
		return err
	}
	invocation, err := encodeJSONColumn("master session invocation", record.ResolvedInvocation)
	if err != nil {
		return err
	}
	degradation, err := encodeOptionalJSONColumn("master session degradation", record.Degradation)
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_sessions SET provider_thread_id = ?, status = ?,
  resolved_invocation_json = ?, durable_context_json = ?, updated_at = ?, degradation_json = ?
WHERE id = ? AND updated_at = ?
`, nullableString(record.ProviderThreadID), record.Status, invocation,
		string(record.DurableContext), record.UpdatedAt, degradation, record.ID, expectedUpdatedAt)
	if err != nil {
		return fmt.Errorf("update master session %s: %w", record.ID, err)
	}
	if err := requireOneRow(result, "master session", record.ID, "updatedAt expectation did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) InsertMasterRouteDecision(record MasterRouteDecisionRecord) (MasterRouteDecisionRecord, error) {
	if err := transaction.ensureActive(); err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	if err := record.Validate(); err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	invocation, err := encodeJSONColumn("master route invocation", record.ResolvedInvocation)
	if err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	failure, err := encodeOptionalJSONColumn("master route failure", record.Error)
	if err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	err = transaction.tx.QueryRowContext(transaction.ctx, `
INSERT INTO master_route_decisions (
  id, master_session_id, input_id, input_modality, input_text, input_submitted_at,
  focused_workspace_id, focused_conversation_id, focused_pane_id,
  candidate_context_json, route_decision_json,
  resulting_command_json, resolved_invocation_json, outcome, error_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING stream_sequence
`, record.ID, record.MasterSessionID, record.InputID, record.InputModality, record.InputText, record.InputSubmittedAt,
		nullableString(record.FocusedWorkspaceID), nullableString(record.FocusedConversationID), nullableString(record.FocusedPaneID),
		string(record.CandidateContext), string(record.RouteDecision), nullableJSON(record.ResultingCommand),
		invocation, record.Outcome, failure, record.CreatedAt).Scan(&record.StreamSequence)
	if err != nil {
		return MasterRouteDecisionRecord{}, fmt.Errorf("insert master route decision %s: %w", record.ID, err)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	return record, nil
}

func (store *Store) ReadMasterSession(ctx context.Context) (*MasterSessionRecord, error) {
	var record MasterSessionRecord
	var providerThreadID, degradation sql.NullString
	var invocation, durableContext string
	err := store.read(ctx, "read master session", func(ctx context.Context, reader *sql.Conn) error {
		err := reader.QueryRowContext(ctx, `
SELECT id, provider, provider_thread_id, status, resolved_invocation_json,
       durable_context_json, created_at, updated_at, degradation_json
FROM master_sessions ORDER BY created_at ASC LIMIT 1
`).Scan(&record.ID, &record.Provider, &providerThreadID, &record.Status, &invocation,
			&durableContext, &record.CreatedAt, &record.UpdatedAt, &degradation)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		record.ProviderThreadID = nullStringPointer(providerThreadID)
		record.DurableContext = json.RawMessage(durableContext)
		if err := decodeRequiredJSON(invocation, &record.ResolvedInvocation); err != nil {
			return err
		}
		return decodeOptionalJSON(degradation, &record.Degradation)
	})
	if err != nil {
		return nil, err
	}
	if record.ID == "" {
		return nil, nil
	}
	return &record, record.Validate()
}

func (store *Store) ListMasterRouteDecisions(ctx context.Context, sessionID string, limit int) ([]MasterRouteDecisionRecord, error) {
	if err := validateIdentifier("master session id", sessionID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		return nil, errors.New("master route history limit must be between 1 and 200")
	}
	var records []MasterRouteDecisionRecord
	err := store.read(ctx, "list master route decisions", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT stream_sequence, id, master_session_id, input_modality, input_text,
       input_id, input_submitted_at, focused_workspace_id, focused_conversation_id,
       focused_pane_id, candidate_context_json,
       route_decision_json, resulting_command_json, resolved_invocation_json,
       outcome, error_json, created_at
FROM (
  SELECT * FROM master_route_decisions WHERE master_session_id = ?
  ORDER BY stream_sequence DESC LIMIT ?
) ORDER BY stream_sequence ASC
`, sessionID, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		records = make([]MasterRouteDecisionRecord, 0, limit)
		for rows.Next() {
			record, err := scanMasterRouteDecision(rows)
			if err != nil {
				return err
			}
			records = append(records, record)
		}
		return rows.Err()
	})
	return records, err
}

func scanMasterRouteDecision(scanner rowScanner) (MasterRouteDecisionRecord, error) {
	var record MasterRouteDecisionRecord
	var workspaceID, conversationID, paneID, command, failure sql.NullString
	var candidates, decision, invocation string
	err := scanner.Scan(&record.StreamSequence, &record.ID, &record.MasterSessionID,
		&record.InputModality, &record.InputText, &record.InputID, &record.InputSubmittedAt,
		&workspaceID, &conversationID, &paneID,
		&candidates, &decision, &command, &invocation, &record.Outcome, &failure, &record.CreatedAt)
	if err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	record.FocusedWorkspaceID = nullStringPointer(workspaceID)
	record.FocusedConversationID = nullStringPointer(conversationID)
	record.FocusedPaneID = nullStringPointer(paneID)
	record.CandidateContext = json.RawMessage(candidates)
	record.RouteDecision = json.RawMessage(decision)
	if command.Valid {
		record.ResultingCommand = json.RawMessage(command.String)
	}
	if err := decodeRequiredJSON(invocation, &record.ResolvedInvocation); err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	if err := decodeOptionalJSON(failure, &record.Error); err != nil {
		return MasterRouteDecisionRecord{}, err
	}
	return record, record.Validate()
}

func validateJSONDocument(label string, value json.RawMessage) error {
	if len(value) == 0 || !json.Valid(value) || strings.TrimSpace(string(value)) == "null" {
		return fmt.Errorf("%s must be non-null JSON", label)
	}
	return nil
}

func nullableJSON(value json.RawMessage) any {
	if len(value) == 0 {
		return nil
	}
	return string(value)
}
