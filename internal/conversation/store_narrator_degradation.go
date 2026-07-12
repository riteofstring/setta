package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// NarratorDegradationCommit records one failed narrator attempt without
// changing the authoritative projection, checkpoint, or topic metadata that
// was last committed successfully.
type NarratorDegradationCommit struct {
	ConversationID   string
	Expected         NarratorStateExpectation
	Degradation      NarratorDegradation
	CommittedEventID string
	CommittedAt      string
}

func (request NarratorDegradationCommit) Validate() error {
	if err := validateIdentifier("narrator degradation conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(request.Expected, request.ConversationID); err != nil {
		return err
	}
	if err := request.Degradation.Validate(); err != nil {
		return err
	}
	if err := validateIdentifier("narrator degradation committed event id", request.CommittedEventID); err != nil {
		return err
	}
	expectedAt, err := validateTimestamp("narrator degradation expected updatedAt", request.Expected.UpdatedAt)
	if err != nil {
		return err
	}
	degradedAt, err := validateTimestamp("narrator degradation degradedAt", request.Degradation.DegradedAt)
	if err != nil {
		return err
	}
	committedAt, err := validateTimestamp("narrator degradation committedAt", request.CommittedAt)
	if err != nil {
		return err
	}
	if !degradedAt.After(expectedAt) {
		return fmt.Errorf("narrator degradation degradedAt must advance beyond expected updatedAt")
	}
	if committedAt.Before(degradedAt) {
		return fmt.Errorf("narrator degradation committedAt precedes degradedAt")
	}
	return nil
}

// ReadNarratorState reads the reconstructable narrator cursor and projection
// without assembling a provider context window. Failure handling uses this
// narrow read before preparing its optimistic degradation commit.
func (store *Store) ReadNarratorState(ctx context.Context, conversationID string) (NarratorState, error) {
	if store == nil {
		return NarratorState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorState{}, errors.New("narrator state read context is required")
	}
	if err := validateIdentifier("narrator state conversation id", conversationID); err != nil {
		return NarratorState{}, err
	}
	var state NarratorState
	err := store.read(ctx, "read narrator state", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		state, err = readSnapshotNarrator(ctx, reader, conversationID)
		return err
	})
	if err != nil {
		return NarratorState{}, err
	}
	if err := state.Validate(); err != nil {
		return NarratorState{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	if state.ConversationID != conversationID {
		return NarratorState{}, &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("narrator state belongs to %q, want %q", state.ConversationID, conversationID),
		}
	}
	return state, nil
}

// CommitNarratorDegradation atomically persists the typed failure and its
// conversation-stream publication. It deliberately leaves every successful
// projection field and both durable cursors unchanged.
func (store *Store) CommitNarratorDegradation(
	ctx context.Context,
	request NarratorDegradationCommit,
) (NarratorState, error) {
	if store == nil {
		return NarratorState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorState{}, errors.New("narrator degradation commit context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorState{}, err
	}
	var committed NarratorState
	_, err := store.transactPresentationAware(ctx, "commit narrator degradation", func(transaction *WriteTransaction) error {
		state, err := readNarratorStateForMutation(transaction, request.ConversationID)
		if err != nil {
			return err
		}
		state.LastInvocationAt = stringPointerValue(request.Degradation.DegradedAt)
		state.Status = NarratorStatusDegraded
		degradation := request.Degradation
		state.Degradation = &degradation
		state.UpdatedAt = request.CommittedAt
		if err := transaction.UpdateNarratorState(request.Expected, state); err != nil {
			return err
		}
		if err := appendNarratorCommittedEvent(
			transaction,
			request.CommittedEventID,
			request.ConversationID,
			ConversationEventTypeNarratorStateUpdated,
			ConversationNarratorStateUpdatedEventPayload{
				Type:  ConversationEventTypeNarratorStateUpdated,
				State: state,
			},
			request.CommittedAt,
		); err != nil {
			return err
		}
		committed = state
		return nil
	})
	if err != nil {
		return NarratorState{}, err
	}
	return committed, nil
}
