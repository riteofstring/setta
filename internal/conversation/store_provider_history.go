package conversation

import (
	"context"
	"database/sql"
	"errors"
)

func (store *Store) conversationHasProviderBackedTurns(
	ctx context.Context,
	conversationID string,
) (bool, error) {
	if store == nil {
		return false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return false, errors.New("provider history context is required")
	}
	if err := validateIdentifier("provider history conversation id", conversationID); err != nil {
		return false, err
	}
	var count int
	err := store.read(ctx, "read conversation provider history", func(ctx context.Context, connection *sql.Conn) error {
		return connection.QueryRowContext(ctx, `
SELECT COUNT(1)
FROM conversation_turns
WHERE conversation_id = ?
  AND provider_turn_id IS NOT NULL
LIMIT 1
`, conversationID).Scan(&count)
	})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
