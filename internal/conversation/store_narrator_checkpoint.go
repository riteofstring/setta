package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type NarratorCheckpointCommit struct {
	ConversationID         string
	Expected               NarratorStateExpectation
	CoveredThroughSequence int
	HistoricalSummary      string
	CommittedEventID       string
	CommittedAt            string
}

func (request NarratorCheckpointCommit) Validate() error {
	if err := validateIdentifier("narrator checkpoint conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator checkpoint committed event id", request.CommittedEventID); err != nil {
		return err
	}
	if err := validateTrimmedText("narrator checkpoint historical summary", request.HistoricalSummary); err != nil {
		return err
	}
	if _, err := validateTimestamp("narrator checkpoint committedAt", request.CommittedAt); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(request.Expected, request.ConversationID); err != nil {
		return err
	}
	if request.CoveredThroughSequence <= request.Expected.CheckpointThroughSequence {
		return fmt.Errorf(
			"narrator checkpoint coverage %d must advance beyond %d",
			request.CoveredThroughSequence,
			request.Expected.CheckpointThroughSequence,
		)
	}
	if request.CoveredThroughSequence > request.Expected.ObservedThroughSequence {
		return fmt.Errorf(
			"narrator checkpoint coverage %d exceeds observed cursor %d",
			request.CoveredThroughSequence,
			request.Expected.ObservedThroughSequence,
		)
	}
	return nil
}

// CommitNarratorCheckpoint advances only the historical checkpoint cursor and
// text. The optimistic state expectation prevents a response prepared from an
// old actor generation from rewriting newer narrator state, while the writer
// transaction publishes the updated state atomically.
func (store *Store) CommitNarratorCheckpoint(
	ctx context.Context,
	request NarratorCheckpointCommit,
) (NarratorState, error) {
	if store == nil {
		return NarratorState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorState{}, errors.New("narrator checkpoint commit context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorState{}, err
	}
	var committed NarratorState
	_, err := store.Transact(ctx, "commit narrator checkpoint", func(transaction *WriteTransaction) error {
		state, err := readNarratorStateForCheckpoint(transaction, request.ConversationID)
		if err != nil {
			return err
		}
		if err := requireCheckpointTrajectoryCoverage(transaction, request); err != nil {
			return err
		}
		state.CheckpointThroughSequence = request.CoveredThroughSequence
		state.CheckpointText = request.HistoricalSummary
		state.LastInvocationAt = &request.CommittedAt
		state.UpdatedAt = request.CommittedAt
		if err := transaction.UpdateNarratorState(request.Expected, state); err != nil {
			return err
		}
		streamID, err := ConversationStreamID(request.ConversationID)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:       request.CommittedEventID,
			StreamID: streamID,
			Kind:     string(ConversationEventTypeNarratorStateUpdated),
			Payload: ConversationNarratorStateUpdatedEventPayload{
				Type:  ConversationEventTypeNarratorStateUpdated,
				State: state,
			},
			CommittedAt: request.CommittedAt,
		})
		if err != nil {
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

func readNarratorStateForCheckpoint(
	transaction *WriteTransaction,
	conversationID string,
) (NarratorState, error) {
	state, err := scanNarratorState(transaction.tx.QueryRowContext(transaction.ctx, `
SELECT conversation_id, observed_through_sequence, checkpoint_through_sequence,
       checkpoint_text, current_focus, current_focus_revision, topic_descriptor,
       last_invocation_at, status, degradation_json, updated_at
FROM narrator_state
WHERE conversation_id = ?
`, conversationID))
	if errors.Is(err, sql.ErrNoRows) {
		return NarratorState{}, stateConflict("narrator state", conversationID, "state does not exist")
	}
	if err != nil {
		return NarratorState{}, fmt.Errorf("read narrator state for checkpoint %s: %w", conversationID, err)
	}
	return state, nil
}

func requireCheckpointTrajectoryCoverage(
	transaction *WriteTransaction,
	request NarratorCheckpointCommit,
) error {
	start := request.Expected.CheckpointThroughSequence + 1
	wantCount := request.CoveredThroughSequence - start + 1
	var count int
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT COUNT(*)
FROM trajectory_events
WHERE conversation_id = ? AND sequence BETWEEN ? AND ?
`, request.ConversationID, start, request.CoveredThroughSequence).Scan(&count); err != nil {
		return fmt.Errorf("read narrator checkpoint trajectory coverage for %s: %w", request.ConversationID, err)
	}
	if count != wantCount {
		return stateConflict(
			"narrator checkpoint",
			request.ConversationID,
			fmt.Sprintf("trajectory range %d..%d is not contiguous", start, request.CoveredThroughSequence),
		)
	}
	return nil
}
