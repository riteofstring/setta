package chat

import (
	"errors"
	"os"
	"strings"
)

func visibleConversationScanEntry(entry os.DirEntry) bool {
	return entry.IsDir() && !strings.HasPrefix(entry.Name(), ".")
}

func (store *Store) conversationDirDisappearedDuringScan(workspaceID string, conversationID string, loadErr error) (bool, error) {
	if !errors.Is(loadErr, os.ErrNotExist) {
		return false, nil
	}
	dir := store.conversationDir(workspaceID, conversationID)
	info, err := os.Stat(dir)
	if err == nil {
		return !info.IsDir(), nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return true, nil
	}
	return false, &PersistenceError{Operation: "stat conversation", Path: dir, Err: err}
}
