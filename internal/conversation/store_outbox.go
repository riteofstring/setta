package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

const MaxCommittedEventReadLimit = 512

type CommittedEventDraft struct {
	ID          string
	StreamID    string
	Kind        string
	Payload     any
	CommittedAt string
}

type CommittedEvent struct {
	CommitSequence int64           `json:"commitSequence"`
	ID             string          `json:"id"`
	StreamID       string          `json:"streamId"`
	StreamSequence int             `json:"streamSequence"`
	Kind           string          `json:"kind"`
	Payload        json.RawMessage `json:"payload"`
	CommittedAt    string          `json:"committedAt"`
}

type CommittedEventCursor struct {
	CommitSequence int64 `json:"commitSequence"`
}

func (event CommittedEvent) Validate() error {
	if event.CommitSequence <= 0 {
		return fmt.Errorf("committed event commit sequence must be positive")
	}
	if err := validateIdentifier("committed event id", event.ID); err != nil {
		return err
	}
	if err := validateIdentifier("committed event stream id", event.StreamID); err != nil {
		return err
	}
	if event.StreamSequence <= 0 {
		return fmt.Errorf("committed event %s stream sequence must be positive", event.ID)
	}
	if err := validateIdentifier("committed event kind", event.Kind); err != nil {
		return err
	}
	if err := validateCommittedEventPayload(event.Payload); err != nil {
		return fmt.Errorf("committed event %s payload: %w", event.ID, err)
	}
	_, err := validateTimestamp("committed event committedAt", event.CommittedAt)
	return err
}

func (transaction *WriteTransaction) AppendCommittedEvent(draft CommittedEventDraft) (CommittedEvent, error) {
	if err := transaction.ensureActive(); err != nil {
		return CommittedEvent{}, err
	}
	payload, err := prepareCommittedEventDraft(draft)
	if err != nil {
		return CommittedEvent{}, err
	}
	event := CommittedEvent{
		ID:          draft.ID,
		StreamID:    draft.StreamID,
		Kind:        draft.Kind,
		Payload:     payload,
		CommittedAt: draft.CommittedAt,
	}
	err = transaction.tx.QueryRowContext(transaction.ctx, `
INSERT INTO committed_events (
  id, stream_id, stream_sequence, kind, payload_json, committed_at
)
SELECT ?, ?, COALESCE(MAX(stream_sequence), 0) + 1, ?, ?, ?
FROM committed_events
WHERE stream_id = ?
RETURNING commit_sequence, stream_sequence
`,
		event.ID,
		event.StreamID,
		event.Kind,
		string(event.Payload),
		event.CommittedAt,
		event.StreamID,
	).Scan(&event.CommitSequence, &event.StreamSequence)
	if err != nil {
		return CommittedEvent{}, fmt.Errorf("append committed event %s: %w", draft.ID, err)
	}
	if err := event.Validate(); err != nil {
		return CommittedEvent{}, err
	}
	transaction.committedEvents = append(transaction.committedEvents, event)
	return cloneCommittedEvent(event), nil
}

func (store *Store) ReadCommittedEvents(
	ctx context.Context,
	cursor CommittedEventCursor,
	limit int,
) ([]CommittedEvent, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if err := validateCommittedEventRead(cursor.CommitSequence, limit); err != nil {
		return nil, err
	}
	var events []CommittedEvent
	err := store.read(ctx, "read committed conversation events", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM committed_events
WHERE commit_sequence > ?
ORDER BY commit_sequence ASC
LIMIT ?
`, cursor.CommitSequence, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		events, err = scanCommittedEvents(rows, store.dbPath)
		return err
	})
	if err != nil {
		return nil, err
	}
	return events, nil
}

func (store *Store) ReadCommittedStreamEvents(
	ctx context.Context,
	streamID string,
	afterSequence int,
	limit int,
) ([]CommittedEvent, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if err := validateIdentifier("committed event stream id", streamID); err != nil {
		return nil, err
	}
	if afterSequence < 0 {
		return nil, fmt.Errorf("committed event stream sequence must be non-negative: %d", afterSequence)
	}
	if err := validateCommittedEventRead(0, limit); err != nil {
		return nil, err
	}
	var events []CommittedEvent
	err := store.read(ctx, "read committed conversation event stream", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM committed_events
WHERE stream_id = ? AND stream_sequence > ?
ORDER BY stream_sequence ASC
LIMIT ?
`, streamID, afterSequence, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		events, err = scanCommittedEvents(rows, store.dbPath)
		return err
	})
	if err != nil {
		return nil, err
	}
	return events, nil
}

// ReadRecentCommittedStreamEvents returns the newest events of one stream,
// oldest first. It answers the question a bounded tail asks — what happened
// most recently — without reading a stream that grows with the profile forever.
func (store *Store) ReadRecentCommittedStreamEvents(
	ctx context.Context,
	streamID string,
	limit int,
) ([]CommittedEvent, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if err := validateIdentifier("committed event stream id", streamID); err != nil {
		return nil, err
	}
	if err := validateCommittedEventRead(0, limit); err != nil {
		return nil, err
	}
	var events []CommittedEvent
	err := store.read(ctx, "read recent committed conversation event stream", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM (
  SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
  FROM committed_events
  WHERE stream_id = ?
  ORDER BY stream_sequence DESC
  LIMIT ?
)
ORDER BY stream_sequence ASC
`, streamID, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		events, err = scanCommittedEvents(rows, store.dbPath)
		return err
	})
	if err != nil {
		return nil, err
	}
	return events, nil
}

// WaitForCommittedEvents blocks without polling until a record exists after
// the supplied durable cursor, the context is cancelled, or the store closes.
func (store *Store) WaitForCommittedEvents(
	ctx context.Context,
	cursor CommittedEventCursor,
	limit int,
) ([]CommittedEvent, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("conversation outbox wait context is required")
	}
	for {
		wake := store.committedEventWakeChannel()
		events, err := store.ReadCommittedEvents(ctx, cursor, limit)
		if err != nil || len(events) > 0 {
			return events, err
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-store.closing:
			return nil, ErrStoreClosed
		case <-wake:
		}
	}
}

func prepareCommittedEventDraft(draft CommittedEventDraft) (json.RawMessage, error) {
	if err := validateIdentifier("committed event id", draft.ID); err != nil {
		return nil, err
	}
	if err := validateIdentifier("committed event stream id", draft.StreamID); err != nil {
		return nil, err
	}
	if err := validateIdentifier("committed event kind", draft.Kind); err != nil {
		return nil, err
	}
	if draft.Payload == nil {
		return nil, errors.New("committed event payload is required")
	}
	payload, err := json.Marshal(draft.Payload)
	if err != nil {
		return nil, fmt.Errorf("encode committed event %s payload: %w", draft.ID, err)
	}
	if err := validateCommittedEventPayload(payload); err != nil {
		return nil, fmt.Errorf("committed event %s payload: %w", draft.ID, err)
	}
	if _, err := validateTimestamp("committed event committedAt", draft.CommittedAt); err != nil {
		return nil, err
	}
	return append(json.RawMessage{}, payload...), nil
}

func validateCommittedEventPayload(payload json.RawMessage) error {
	if len(payload) == 0 || !json.Valid(payload) {
		return errors.New("must be valid JSON")
	}
	if bytes.Equal(bytes.TrimSpace(payload), []byte("null")) {
		return errors.New("must not be null")
	}
	return nil
}

func validateCommittedEventRead(afterCommitSequence int64, limit int) error {
	if afterCommitSequence < 0 {
		return fmt.Errorf("committed event cursor must be non-negative: %d", afterCommitSequence)
	}
	if limit <= 0 || limit > MaxCommittedEventReadLimit {
		return fmt.Errorf("committed event read limit must be between 1 and %d: %d", MaxCommittedEventReadLimit, limit)
	}
	return nil
}

func scanCommittedEvents(rows *sql.Rows, dbPath string) ([]CommittedEvent, error) {
	events := make([]CommittedEvent, 0)
	for rows.Next() {
		var event CommittedEvent
		var payload string
		if err := rows.Scan(
			&event.CommitSequence,
			&event.ID,
			&event.StreamID,
			&event.StreamSequence,
			&event.Kind,
			&payload,
			&event.CommittedAt,
		); err != nil {
			return nil, err
		}
		event.Payload = json.RawMessage(payload)
		if err := event.Validate(); err != nil {
			return nil, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("committed event row %q: %w", event.ID, err),
			}
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

func (store *Store) committedEventWakeChannel() <-chan struct{} {
	store.outboxMu.Lock()
	defer store.outboxMu.Unlock()
	return store.outboxWake
}

func (store *Store) notifyCommittedEvents() {
	store.outboxMu.Lock()
	close(store.outboxWake)
	store.outboxWake = make(chan struct{})
	store.outboxMu.Unlock()
}

func cloneCommittedEvents(events []CommittedEvent) []CommittedEvent {
	cloned := make([]CommittedEvent, len(events))
	for index, event := range events {
		cloned[index] = cloneCommittedEvent(event)
	}
	return cloned
}

func cloneCommittedEvent(event CommittedEvent) CommittedEvent {
	event.Payload = append(json.RawMessage{}, event.Payload...)
	return event
}
