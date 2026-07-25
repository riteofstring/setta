package director

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/conversation"
)

// The durable home of Director-owned facts.
//
// A conversation trajectory event is durable inside one conversation. The
// app-scoped facts — which workstream the app selected, what a workstream is
// waiting for, what the Director concluded — belong to no conversation, so they
// are committed to their own durable stream in the same append-only log. That is
// what gives the registry one total order over both owners: the log's commit
// order is the app-scoped order, and replaying it reproduces the same state.

const (
	// DirectorFactStreamID is the durable app-scoped fact stream. It is a
	// committed-event stream like a conversation's, not the derived subscription
	// stream a renderer holds a cursor into.
	DirectorFactStreamID = "director:facts"
	// DirectorFactCommittedKind is the committed-event kind carrying one durable
	// Director fact. The fact's own kind selects its payload, so the log needs
	// one kind rather than one per fact.
	DirectorFactCommittedKind = "director.fact.committed"
	// workstreamIDPrefix derives an app-scoped workstream identity from the
	// conversation that executes it. The initial cutover maps one conversation to
	// one workstream, and the prefix keeps the two identities from being confused
	// where both are strings.
	workstreamIDPrefix = "workstream:"
)

// DirectorFactStore is the durable log the registry folds and appends to. It is
// the conversation store's committed-event surface, narrowed to what an
// app-scoped reader needs, so the registry cannot reach into conversation
// records it does not own.
type DirectorFactStore interface {
	Transact(
		ctx context.Context,
		operation string,
		run func(*conversation.WriteTransaction) error,
	) ([]conversation.CommittedEvent, error)
	ReadCommittedEvents(
		ctx context.Context,
		cursor conversation.CommittedEventCursor,
		limit int,
	) ([]conversation.CommittedEvent, error)
	WaitForCommittedEvents(
		ctx context.Context,
		cursor conversation.CommittedEventCursor,
		limit int,
	) ([]conversation.CommittedEvent, error)
}

// WorkstreamIDForConversation derives the app-scoped identity of the workstream
// one conversation executes. It is derived rather than generated so a replay of
// the durable log always addresses the same workstream.
func WorkstreamIDForConversation(conversationID string) (string, error) {
	if err := validateIdentifier("workstream conversation id", conversationID); err != nil {
		return "", err
	}
	return workstreamIDPrefix + conversationID, nil
}

// AppendDirectorFact commits one Director fact durably and returns its position
// in the app-wide log. The fact is validated before it reaches the log, because
// a fact that cannot be projected would stop the app-scoped fold at the point it
// was written.
func AppendDirectorFact(
	ctx context.Context,
	store DirectorFactStore,
	fact DirectorFactEvent,
) (conversation.CommittedEvent, error) {
	if store == nil {
		return conversation.CommittedEvent{}, fmt.Errorf("director fact store is required")
	}
	if err := ValidateDirectorFactEvent(fact); err != nil {
		return conversation.CommittedEvent{}, err
	}
	events, err := store.Transact(ctx, "commit director fact", func(transaction *conversation.WriteTransaction) error {
		_, appendErr := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          fact.ID,
			StreamID:    DirectorFactStreamID,
			Kind:        DirectorFactCommittedKind,
			Payload:     fact,
			CommittedAt: fact.EmittedAt,
		})
		return appendErr
	})
	if err != nil {
		return conversation.CommittedEvent{}, err
	}
	if len(events) != 1 {
		return conversation.CommittedEvent{}, fmt.Errorf(
			"commit director fact %s returned %d events, want 1",
			fact.ID,
			len(events),
		)
	}
	return events[0], nil
}

// DecodeDirectorFact reads one durable Director fact out of the log.
func DecodeDirectorFact(committed conversation.CommittedEvent) (DirectorFactEvent, error) {
	if committed.Kind != DirectorFactCommittedKind {
		return DirectorFactEvent{}, fmt.Errorf(
			"committed event %s has kind %q, want %q",
			committed.ID,
			committed.Kind,
			DirectorFactCommittedKind,
		)
	}
	if committed.StreamID != DirectorFactStreamID {
		return DirectorFactEvent{}, fmt.Errorf(
			"director fact %s was committed to stream %q, want %q",
			committed.ID,
			committed.StreamID,
			DirectorFactStreamID,
		)
	}
	var fact DirectorFactEvent
	if err := json.Unmarshal(committed.Payload, &fact); err != nil {
		return DirectorFactEvent{}, fmt.Errorf("decode director fact %s: %w", committed.ID, err)
	}
	if fact.ID != committed.ID {
		return DirectorFactEvent{}, fmt.Errorf(
			"director fact payload id %q does not match committed event %s",
			fact.ID,
			committed.ID,
		)
	}
	if err := ValidateDirectorFactEvent(fact); err != nil {
		return DirectorFactEvent{}, err
	}
	return fact, nil
}
