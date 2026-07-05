package chat

import (
	"errors"
	"os"
	"sort"
	"strings"
)

func visibleConversationScanEntry(entry os.DirEntry) bool {
	return entry.IsDir() && !strings.HasPrefix(entry.Name(), ".")
}

// conversationIDs lists conversation directory names for a workspace without
// reading conversation.json, so background terminal recovery can iterate
// conversations even when a conversation record is corrupt or absent.
func (store *Store) conversationIDs(workspaceID string) ([]string, error) {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return nil, err
	}
	dir := store.conversationsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, &PersistenceError{Operation: "list conversations", Path: dir, Err: err}
	}
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !visibleConversationScanEntry(entry) {
			continue
		}
		ids = append(ids, entry.Name())
	}
	sort.Strings(ids)
	return ids, nil
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
