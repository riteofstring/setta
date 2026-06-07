package chat

import (
	"errors"
	"os"
)

func (store *Store) conversationVanishedDuringScan(workspaceID string, conversationID string, scanErr error) (bool, error) {
	var persistenceErr *PersistenceError
	if !errors.As(scanErr, &persistenceErr) || !errors.Is(persistenceErr.Err, os.ErrNotExist) {
		return false, nil
	}
	dir := store.conversationDir(workspaceID, conversationID)
	info, err := os.Stat(dir)
	if errors.Is(err, os.ErrNotExist) {
		return true, nil
	}
	if err != nil {
		return false, &PersistenceError{Operation: "stat conversation directory after missing conversation file", Path: dir, Err: err}
	}
	return !info.IsDir(), nil
}
