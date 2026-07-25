package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// The durable home of the Director conversation.
//
// Two writes and two reads is the whole surface: the app-scoped binding that
// says which provider thread is carrying the Director right now, and the
// append-only conversation the Director is re-established from. Nothing here
// interprets an entry — what a Director turn meant belongs to the Director, and
// this only has to keep it.

// ReadDirectorThread returns the provider thread currently bound to the
// Director conversation. A missing binding is reported as absent rather than as
// an error: before the first Director turn there is nothing to bind.
func (store *Store) ReadDirectorThread(ctx context.Context) (DirectorThreadRecord, bool, error) {
	if store == nil {
		return DirectorThreadRecord{}, false, errors.New("conversation store is required")
	}
	var record DirectorThreadRecord
	found := false
	err := store.read(ctx, "read director thread", func(ctx context.Context, reader *sql.Conn) error {
		row := reader.QueryRowContext(ctx, `
SELECT provider, thread_id, model, started_at
FROM director_thread
WHERE singleton = 1
`)
		if err := row.Scan(&record.Provider, &record.ThreadID, &record.Model, &record.StartedAt); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if err := record.Validate(); err != nil {
			return &CorruptStateError{Path: store.dbPath, Err: fmt.Errorf("decode director thread: %w", err)}
		}
		found = true
		return nil
	})
	if err != nil {
		return DirectorThreadRecord{}, false, err
	}
	return record, found, nil
}

// BindDirectorThread makes one provider thread the Director conversation's
// current carrier. It replaces whatever was bound before, because the Director
// conversation is Setta's and the provider thread is only what is carrying it
// now.
func (store *Store) BindDirectorThread(ctx context.Context, record DirectorThreadRecord) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if err := record.Validate(); err != nil {
		return err
	}
	return store.write(ctx, "bind director thread", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO director_thread (singleton, provider, thread_id, model, started_at)
VALUES (1, ?, ?, ?, ?)
ON CONFLICT(singleton) DO UPDATE SET
  provider = excluded.provider,
  thread_id = excluded.thread_id,
  model = excluded.model,
  started_at = excluded.started_at
`, record.Provider, record.ThreadID, record.Model, record.StartedAt)
		return err
	})
}

// AppendDirectorConversation records one ordered batch of Director activity in
// a transaction. A turn may append its tool calls as they happen and its reply
// afterward, so a provider failure cannot erase an app action that already ran.
func (store *Store) AppendDirectorConversation(ctx context.Context, entries []DirectorConversationEntry) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if len(entries) == 0 {
		return errors.New("director conversation append requires at least one entry")
	}
	encoded := make([]string, 0, len(entries))
	for index, entry := range entries {
		if err := entry.Validate(); err != nil {
			return fmt.Errorf("director conversation entry[%d]: %w", index, err)
		}
		payload, err := json.Marshal(directorConversationPayload(entry))
		if err != nil {
			return fmt.Errorf("encode director conversation entry %s: %w", entry.ID, err)
		}
		encoded = append(encoded, string(payload))
	}
	return store.write(ctx, "append director conversation", func(ctx context.Context, tx *sql.Tx) error {
		for index, entry := range entries {
			if _, err := tx.ExecContext(ctx, `
INSERT INTO director_conversation_entries (id, turn_id, kind, recorded_at, payload_json)
VALUES (?, ?, ?, ?, ?)
`, entry.ID, entry.TurnID, entry.Kind, entry.RecordedAt, encoded[index]); err != nil {
				return err
			}
		}
		return nil
	})
}

// ReadRecentDirectorConversation returns the newest entries in the order they
// were recorded. The limit is the caller's, because how much history a new
// provider thread should be re-established with is a Director product rule
// rather than a storage one.
func (store *Store) ReadRecentDirectorConversation(
	ctx context.Context,
	limit int,
) ([]DirectorConversationEntry, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if limit <= 0 {
		return nil, fmt.Errorf("director conversation limit must be positive, got %d", limit)
	}
	entries := make([]DirectorConversationEntry, 0, limit)
	err := store.read(ctx, "read director conversation", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT id, turn_id, kind, recorded_at, payload_json
FROM (
  SELECT sequence, id, turn_id, kind, recorded_at, payload_json
  FROM director_conversation_entries
  ORDER BY sequence DESC
  LIMIT ?
)
ORDER BY sequence ASC
`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			entry, err := scanDirectorConversationEntry(rows, store.dbPath)
			if err != nil {
				return err
			}
			entries = append(entries, entry)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return entries, nil
}

func scanDirectorConversationEntry(rows *sql.Rows, dbPath string) (DirectorConversationEntry, error) {
	var entry DirectorConversationEntry
	var payloadJSON string
	if err := rows.Scan(&entry.ID, &entry.TurnID, &entry.Kind, &entry.RecordedAt, &payloadJSON); err != nil {
		return DirectorConversationEntry{}, err
	}
	if err := decodeDirectorConversationPayload(&entry, payloadJSON); err != nil {
		return DirectorConversationEntry{}, &CorruptStateError{Path: dbPath, Err: err}
	}
	if err := entry.Validate(); err != nil {
		return DirectorConversationEntry{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode director conversation entry %s: %w", entry.ID, err),
		}
	}
	return entry, nil
}

// directorConversationPayload stores only the branch the entry's kind owns, so
// a row cannot carry a payload the kind never had.
func directorConversationPayload(entry DirectorConversationEntry) any {
	if entry.Text != nil {
		return entry.Text
	}
	return entry.Tool
}

func decodeDirectorConversationPayload(entry *DirectorConversationEntry, payloadJSON string) error {
	switch entry.Kind {
	case DirectorConversationUserTurn, DirectorConversationAssistantText:
		var text DirectorConversationText
		if err := json.Unmarshal([]byte(payloadJSON), &text); err != nil {
			return fmt.Errorf("decode director conversation text %s: %w", entry.ID, err)
		}
		entry.Text = &text
		return nil
	case DirectorConversationToolCall, DirectorConversationToolReceipt:
		var tool DirectorConversationToolActivity
		if err := json.Unmarshal([]byte(payloadJSON), &tool); err != nil {
			return fmt.Errorf("decode director conversation tool activity %s: %w", entry.ID, err)
		}
		entry.Tool = &tool
		return nil
	default:
		return fmt.Errorf("unknown director conversation entry kind %q", entry.Kind)
	}
}
