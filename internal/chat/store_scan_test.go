package chat

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreConversationDirDisappearedDuringScanDetectsVanishedDir(t *testing.T) {
	store := mustStore(t, t.TempDir())
	loadErr := missingConversationFileError(store, "workspace_api", "conversation_gone")

	missing, err := store.conversationDirDisappearedDuringScan("workspace_api", "conversation_gone", loadErr)
	if err != nil {
		t.Fatalf("check disappeared conversation dir: %v", err)
	}
	if !missing {
		t.Fatal("conversation dir missing = false, want true")
	}
}

func TestStoreConversationScanFailsWhenExistingDirLacksConversationFile(t *testing.T) {
	store := mustStore(t, t.TempDir())
	conversationDir := store.conversationDir("workspace_api", "conversation_missing_file")
	if err := os.MkdirAll(conversationDir, 0o755); err != nil {
		t.Fatalf("create conversation dir: %v", err)
	}
	loadErr := missingConversationFileError(store, "workspace_api", "conversation_missing_file")

	missing, err := store.conversationDirDisappearedDuringScan("workspace_api", "conversation_missing_file", loadErr)
	if err != nil {
		t.Fatalf("check existing conversation dir: %v", err)
	}
	if missing {
		t.Fatal("conversation dir missing = true, want false for existing malformed dir")
	}
	_, _, err = store.ScanConversationsAllowingCorrupt("workspace_api")
	if err == nil {
		t.Fatal("scan conversations succeeded, want missing conversation file error")
	}
	if !IsPersistenceError(err) || !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("scan error = %T %v, want not-exist persistence error", err, err)
	}
}

func missingConversationFileError(store *Store, workspaceID string, conversationID string) error {
	return &PersistenceError{
		Operation: "read file",
		Path:      store.conversationPath(workspaceID, conversationID),
		Err:       os.ErrNotExist,
	}
}

func TestStoreConversationDirDisappearedDuringScanKeepsNonMissingErrors(t *testing.T) {
	store := mustStore(t, t.TempDir())
	loadErr := &PersistenceError{
		Operation: "read file",
		Path:      filepath.Join("workspace_api", "conversation_bad", conversationFileName),
		Err:       os.ErrPermission,
	}

	missing, err := store.conversationDirDisappearedDuringScan("workspace_api", "conversation_bad", loadErr)
	if err != nil {
		t.Fatalf("check non-missing error: %v", err)
	}
	if missing {
		t.Fatal("conversation dir missing = true, want false for non-missing load error")
	}
}
