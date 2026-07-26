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
// a transaction. A turn appends what the user said, each tool call as it is
// made, each receipt as it comes back, and the reply afterward, so a provider
// failure cannot erase an app action that already ran.
//
// The entries go into the app-scoped committed log rather than a table of their
// own, because the graph projects them beside conversation trajectory events and
// Director facts. One log is one order, and one order is what makes a replay of
// the Director's own dialogue reproduce the same graph.
func (store *Store) AppendDirectorConversation(ctx context.Context, entries []DirectorConversationEntry) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if len(entries) == 0 {
		return errors.New("director conversation append requires at least one entry")
	}
	for index, entry := range entries {
		if err := entry.Validate(); err != nil {
			return fmt.Errorf("director conversation entry[%d]: %w", index, err)
		}
	}
	_, err := store.Transact(ctx, "append director conversation", func(transaction *WriteTransaction) error {
		for _, entry := range entries {
			if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
				ID:          entry.ID,
				StreamID:    DirectorConversationStreamID,
				Kind:        DirectorConversationCommittedKind,
				Payload:     entry,
				CommittedAt: entry.RecordedAt,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	return err
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
	committed, err := store.ReadRecentCommittedStreamEvents(ctx, DirectorConversationStreamID, limit)
	if err != nil {
		return nil, err
	}
	entries := make([]DirectorConversationEntry, 0, len(committed))
	for _, event := range committed {
		entry, err := DecodeDirectorConversationEntry(event)
		if err != nil {
			return nil, &CorruptStateError{Path: store.dbPath, Err: err}
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

// DecodeDirectorConversationEntry reads one durable Director conversation entry
// out of the log.
func DecodeDirectorConversationEntry(committed CommittedEvent) (DirectorConversationEntry, error) {
	if committed.Kind != DirectorConversationCommittedKind {
		return DirectorConversationEntry{}, fmt.Errorf(
			"committed event %s has kind %q, want %q",
			committed.ID,
			committed.Kind,
			DirectorConversationCommittedKind,
		)
	}
	if committed.StreamID != DirectorConversationStreamID {
		return DirectorConversationEntry{}, fmt.Errorf(
			"director conversation entry %s was committed to stream %q, want %q",
			committed.ID,
			committed.StreamID,
			DirectorConversationStreamID,
		)
	}
	var entry DirectorConversationEntry
	if err := json.Unmarshal(committed.Payload, &entry); err != nil {
		return DirectorConversationEntry{}, fmt.Errorf("decode director conversation entry %s: %w", committed.ID, err)
	}
	if entry.ID != committed.ID {
		return DirectorConversationEntry{}, fmt.Errorf(
			"director conversation payload id %q does not match committed event %s",
			entry.ID,
			committed.ID,
		)
	}
	if err := entry.Validate(); err != nil {
		return DirectorConversationEntry{}, err
	}
	return entry, nil
}
