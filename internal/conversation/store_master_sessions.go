package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/master"
)

const masterSessionSingleton = 1

func (store *Store) ReadMasterSession(ctx context.Context) (master.Session, bool, error) {
	if store == nil {
		return master.Session{}, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.Session{}, false, errors.New("master session read context is required")
	}
	var session master.Session
	var found bool
	err := store.read(ctx, "read master session", func(ctx context.Context, connection *sql.Conn) error {
		var err error
		session, found, err = readMasterSessionRow(ctx, connection, store.dbPath)
		return err
	})
	if err != nil {
		return master.Session{}, false, err
	}
	return master.CloneSession(session), found, nil
}

func (store *Store) CreateMasterSession(
	ctx context.Context,
	candidate master.Session,
) (master.Session, bool, error) {
	if err := validateMasterSessionPersistenceRequest(store, ctx, candidate); err != nil {
		return master.Session{}, false, err
	}
	if candidate.Status != master.SessionStatusInitializing {
		return master.Session{}, false, errors.New("new master session must be initializing")
	}
	var result master.Session
	created := false
	err := store.write(ctx, "create master session", func(ctx context.Context, tx *sql.Tx) error {
		existing, found, err := readMasterSessionRow(ctx, tx, store.dbPath)
		if err != nil {
			return err
		}
		if found {
			result = existing
			return nil
		}
		configurationJSON, err := encodeJSONColumn("master session configuration", candidate.Configuration)
		if err != nil {
			return err
		}
		degradationJSON, err := encodeOptionalJSONColumn("master session degradation", candidate.Degradation)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `
INSERT INTO master_sessions (
  singleton, id, provider, provider_thread_id, status,
  resolved_invocation_json, durable_context_json,
  created_at, updated_at, degradation_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
			masterSessionSingleton,
			candidate.ID,
			candidate.Provider,
			nullableString(candidate.ProviderThreadID),
			candidate.Status,
			configurationJSON,
			string(candidate.DurableContext),
			candidate.CreatedAt,
			candidate.UpdatedAt,
			degradationJSON,
		)
		if err != nil {
			return fmt.Errorf("insert master session %s: %w", candidate.ID, err)
		}
		if err := appendMasterSessionEvent(ctx, tx, master.SessionCreatedEventID(candidate.ID), master.SessionCreatedEventKind, candidate); err != nil {
			return err
		}
		result = master.CloneSession(candidate)
		created = true
		return nil
	})
	if err != nil {
		return master.Session{}, false, err
	}
	if created {
		store.notifyCommittedEvents()
	}
	return master.CloneSession(result), created, nil
}

func (store *Store) UpdateMasterSession(
	ctx context.Context,
	expectedUpdatedAt string,
	next master.Session,
) error {
	if err := validateMasterSessionPersistenceRequest(store, ctx, next); err != nil {
		return err
	}
	expected, err := time.Parse(time.RFC3339Nano, expectedUpdatedAt)
	if err != nil || expected.UTC().Format(time.RFC3339Nano) != expectedUpdatedAt {
		return errors.New("master session expected updatedAt must be canonical UTC")
	}
	nextUpdated, _ := time.Parse(time.RFC3339Nano, next.UpdatedAt)
	if !nextUpdated.After(expected) {
		return errors.New("master session updatedAt must advance beyond its expected version")
	}
	configurationJSON, err := encodeJSONColumn("master session configuration", next.Configuration)
	if err != nil {
		return err
	}
	degradationJSON, err := encodeOptionalJSONColumn("master session degradation", next.Degradation)
	if err != nil {
		return err
	}
	err = store.write(ctx, "update master session", func(ctx context.Context, tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `
UPDATE master_sessions
SET provider = ?, provider_thread_id = ?, status = ?,
    resolved_invocation_json = ?, durable_context_json = ?,
    updated_at = ?, degradation_json = ?
WHERE singleton = ? AND id = ? AND created_at = ? AND updated_at = ?
`,
			next.Provider,
			nullableString(next.ProviderThreadID),
			next.Status,
			configurationJSON,
			string(next.DurableContext),
			next.UpdatedAt,
			degradationJSON,
			masterSessionSingleton,
			next.ID,
			next.CreatedAt,
			expectedUpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("update master session %s: %w", next.ID, err)
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read master session %s update result: %w", next.ID, err)
		}
		if rows != 1 {
			return &master.SessionConflictError{
				SessionID: next.ID,
				Reason:    "expected durable version was not found",
			}
		}
		return appendMasterSessionEvent(
			ctx,
			tx,
			master.SessionUpdatedEventID(next),
			master.SessionUpdatedEventKind,
			next,
		)
	})
	if err != nil {
		return err
	}
	store.notifyCommittedEvents()
	return nil
}

func validateMasterSessionPersistenceRequest(
	store *Store,
	ctx context.Context,
	session master.Session,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master session persistence context is required")
	}
	if err := session.Validate(); err != nil {
		return err
	}
	return validatePersistedMasterRoleConfiguration(session.Configuration)
}

func appendMasterSessionEvent(
	ctx context.Context,
	tx *sql.Tx,
	eventID string,
	kind string,
	session master.Session,
) error {
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          eventID,
		StreamID:    master.GlobalSessionStreamID,
		Kind:        kind,
		Payload:     session,
		CommittedAt: session.UpdatedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

type masterSessionQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readMasterSessionRow(
	ctx context.Context,
	query masterSessionQuery,
	dbPath string,
) (master.Session, bool, error) {
	var session master.Session
	var providerThreadID sql.NullString
	var configurationJSON string
	var durableContextJSON string
	var degradationJSON sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT id, provider, provider_thread_id, status,
       resolved_invocation_json, durable_context_json,
       created_at, updated_at, degradation_json
FROM master_sessions
WHERE singleton = ?
`, masterSessionSingleton).Scan(
		&session.ID,
		&session.Provider,
		&providerThreadID,
		&session.Status,
		&configurationJSON,
		&durableContextJSON,
		&session.CreatedAt,
		&session.UpdatedAt,
		&degradationJSON,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return master.Session{}, false, nil
	}
	if err != nil {
		return master.Session{}, false, fmt.Errorf("read master session: %w", err)
	}
	session.ProviderThreadID = optionalScannedString(providerThreadID)
	if err := json.Unmarshal([]byte(configurationJSON), &session.Configuration); err != nil {
		return master.Session{}, false, corruptMasterSession(dbPath, err)
	}
	session.DurableContext = json.RawMessage(durableContextJSON)
	if degradationJSON.Valid {
		var degradation master.SessionDegradation
		if err := json.Unmarshal([]byte(degradationJSON.String), &degradation); err != nil {
			return master.Session{}, false, corruptMasterSession(dbPath, err)
		}
		session.Degradation = &degradation
	}
	if err := session.Validate(); err != nil {
		return master.Session{}, false, corruptMasterSession(dbPath, err)
	}
	if err := validatePersistedMasterRoleConfiguration(session.Configuration); err != nil {
		return master.Session{}, false, corruptMasterSession(dbPath, err)
	}
	return session, true, nil
}

func corruptMasterSession(dbPath string, err error) error {
	return &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode master session: %w", err)}
}
