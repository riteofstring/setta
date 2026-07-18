package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var (
	ErrTransactionClosed      = errors.New("conversation write transaction is no longer active")
	ErrCommittedEventRequired = errors.New("conversation state mutations require a committed event")
	ErrEmptyWriteTransaction  = errors.New("conversation write transaction did not mutate state or append a committed event")
)

type StateConflictError struct {
	Entity string
	ID     string
	Reason string
}

type WriteTransaction struct {
	ctx                           context.Context
	tx                            *sql.Tx
	store                         *Store
	active                        bool
	stateMutations                int
	projectionMutations           int
	committedEvents               []CommittedEvent
	presentationActivityPrevious  map[string]presentationActivityState
	presentationActivityUpdatedAt string
}

func (err *StateConflictError) Error() string {
	return fmt.Sprintf("conversation state conflict for %s %s: %s", err.Entity, err.ID, err.Reason)
}

func IsStateConflict(err error) bool {
	var conflict *StateConflictError
	return errors.As(err, &conflict)
}

// Transact serializes short database-only work at the conversation writer.
// The callback must not wait on providers, models, renderers, speech, actors,
// or any other external operation. A transaction value is invalid as soon as
// the callback returns.
func (store *Store) Transact(
	ctx context.Context,
	operation string,
	run func(*WriteTransaction) error,
) ([]CommittedEvent, error) {
	if err := validateWriteTransactionRequest(store, ctx, operation, run); err != nil {
		return nil, err
	}

	var committedEvents []CommittedEvent
	err := store.write(ctx, operation, func(ctx context.Context, sqlTransaction *sql.Tx) error {
		transaction := &WriteTransaction{
			ctx:    ctx,
			tx:     sqlTransaction,
			store:  store,
			active: true,
		}
		defer func() {
			transaction.active = false
		}()
		if err := run(transaction); err != nil {
			return err
		}
		if err := transaction.reconcilePresentationActivity(); err != nil {
			return err
		}
		if err := validateWriteTransactionResult(transaction); err != nil {
			return err
		}
		committedEvents = cloneCommittedEvents(transaction.committedEvents)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(committedEvents) > 0 {
		store.notifyCommittedEvents()
	}
	return committedEvents, nil
}

func validateWriteTransactionRequest(
	store *Store,
	ctx context.Context,
	operation string,
	run func(*WriteTransaction) error,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation write context is required")
	}
	if operation == "" {
		return errors.New("conversation write operation is required")
	}
	if run == nil {
		return errors.New("conversation write transaction callback is required")
	}
	return nil
}

func validateWriteTransactionResult(transaction *WriteTransaction) error {
	if transaction.stateMutations > 0 && len(transaction.committedEvents) == 0 {
		return ErrCommittedEventRequired
	}
	if transaction.stateMutations == 0 &&
		transaction.projectionMutations == 0 &&
		len(transaction.committedEvents) == 0 {
		return ErrEmptyWriteTransaction
	}
	return nil
}

func (transaction *WriteTransaction) ensureActive() error {
	if transaction == nil || !transaction.active || transaction.ctx == nil || transaction.tx == nil {
		return ErrTransactionClosed
	}
	return nil
}

func (transaction *WriteTransaction) recordStateMutation() error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	transaction.stateMutations++
	return nil
}

func (transaction *WriteTransaction) recordProjectionMutation() error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	transaction.projectionMutations++
	return nil
}

func stateConflict(entity string, id string, reason string) error {
	return &StateConflictError{Entity: entity, ID: id, Reason: reason}
}

func requireOneRow(result sql.Result, entity string, id string, reason string) error {
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read %s mutation result: %w", entity, err)
	}
	if rowsAffected != 1 {
		return stateConflict(entity, id, reason)
	}
	return nil
}
