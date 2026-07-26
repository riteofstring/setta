package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// The durable home of the Director conversation.
//
// One write and one read is the whole surface: the append-only conversation the
// Director is re-established from. Nothing here interprets an entry — what a
// Director turn meant belongs to the Director, and this only has to keep it.
//
// Which provider thread is carrying the Director is not stored at all. The
// carrier is ephemeral, so a durable row naming it could only describe a thread
// that no longer exists.

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
