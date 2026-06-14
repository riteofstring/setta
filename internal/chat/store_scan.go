package chat

import (
	"errors"
	"os"
)

func (store *Store) conversationDirDisappearedDuringScan(workspaceID string, conversationID string, loadErr error) (bool, error) {
	if !errors.Is(loadErr, os.ErrNotExist) {
		return false, nil
	}
	dir := store.conversationDir(workspaceID, conversationID)
	_, err := os.Stat(dir)
	if err == nil {
		return false, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return true, nil
	}
	return false, &PersistenceError{Operation: "stat conversation", Path: dir, Err: err}
}
