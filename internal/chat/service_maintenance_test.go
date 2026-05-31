package chat

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestServiceQuarantinesCorruptRunAndReportsCleanValidation(t *testing.T) {
	service, appDataDir, runPath := newServiceWithCorruptRun(t)
	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if list.Corruption.Total != 1 {
		t.Fatalf("corruption = %+v, want one corrupt run", list.Corruption)
	}

	result, err := service.QuarantineCorruptChatState("workspace_api", "workspace_api")
	if err != nil {
		t.Fatalf("quarantine corrupt state: %v", err)
	}
	assertCorruptRunQuarantined(t, result, runPath)
	assertClearQuarantineRequiresConfirmation(t, service, appDataDir)
}

func newServiceWithCorruptRun(t *testing.T) (*Service, string, string) {
	t.Helper()
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	validConversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_valid",
		WorkspaceID:   "workspace_api",
		Title:         "Valid",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	corruptConversation := validConversation
	corruptConversation.ID = "conversation_corrupt"
	corruptConversation.Title = "Corrupt"
	if err := store.SaveConversation(validConversation); err != nil {
		t.Fatalf("save valid conversation: %v", err)
	}
	if err := store.SaveConversation(corruptConversation); err != nil {
		t.Fatalf("save corrupt-owner conversation: %v", err)
	}
	runPath := store.runPath("workspace_api", "run_bad")
	if err := os.MkdirAll(filepath.Dir(runPath), 0o755); err != nil {
		t.Fatalf("create run dir: %v", err)
	}
	rawRun := `{"schemaVersion":1,"id":"run_bad","workspaceId":"workspace_api","conversationId":"conversation_corrupt","triggerMessageId":"message_user","assistantMessageId":"","harness":"codex","status":"completed","startedAt":"2026-05-29T20:00:00Z","completedAt":"2026-05-29T20:00:01Z","promptSummary":"prompt","error":""}`
	if err := os.WriteFile(runPath, []byte(rawRun), 0o644); err != nil {
		t.Fatalf("write corrupt run: %v", err)
	}
	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	return service, appDataDir, runPath
}

func assertCorruptRunQuarantined(t *testing.T, result ChatMaintenanceResult, runPath string) {
	t.Helper()
	if result.Corruption.HasCorruption || result.Corruption.Total != 0 {
		t.Fatalf("post-quarantine corruption = %+v, want clean", result.Corruption)
	}
	if len(result.Quarantined) != 1 || result.Quarantined[0].OriginalPath != runPath {
		t.Fatalf("quarantined = %+v, want corrupt run path", result.Quarantined)
	}
	if _, err := os.Stat(runPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("run path stat err = %v, want not exist", err)
	}
	if _, err := os.Stat(result.ManifestPath); err != nil {
		t.Fatalf("manifest stat: %v", err)
	}
	if _, err := os.Stat(result.Quarantined[0].QuarantinePath); err != nil {
		t.Fatalf("quarantined run stat: %v", err)
	}
}

func assertClearQuarantineRequiresConfirmation(t *testing.T, service *Service, appDataDir string) {
	t.Helper()
	if _, err := service.ClearChatQuarantine("workspace_api", "wrong"); err == nil {
		t.Fatal("clear quarantine succeeded with wrong confirmation")
	}
	clear, err := service.ClearChatQuarantine("workspace_api", "workspace_api")
	if err != nil {
		t.Fatalf("clear quarantine: %v", err)
	}
	quarantineRoot := filepath.Join(appDataDir, quarantineDirName, "workspace_api")
	if len(clear.RemovedPaths) != 1 || clear.RemovedPaths[0] != quarantineRoot {
		t.Fatalf("removed paths = %+v, want quarantine root %s", clear.RemovedPaths, quarantineRoot)
	}
	if _, err := os.Stat(quarantineRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("quarantine root stat err = %v, want not exist", err)
	}
}

func TestServiceResetWorkspaceChatStateRequiresConfirmationAndRemovesChatState(t *testing.T) {
	appDataDir := t.TempDir()
	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.ResetWorkspaceChatState("workspace_api", "wrong"); err == nil {
		t.Fatal("reset succeeded with wrong confirmation")
	}

	result, err := service.ResetWorkspaceChatState("workspace_api", "workspace_api")
	if err != nil {
		t.Fatalf("reset workspace chat state: %v", err)
	}
	if result.Corruption.HasCorruption {
		t.Fatalf("corruption = %+v, want clean after reset", result.Corruption)
	}
	if len(result.RemovedPaths) == 0 {
		t.Fatal("removed paths is empty, want chat state paths")
	}
	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations after reset: %v", err)
	}
	if len(list.Conversations) != 0 {
		t.Fatalf("conversations = %+v, want none after reset", list.Conversations)
	}
	if _, err := service.store.LoadConversation("workspace_api", conversation.ID); !IsPersistenceError(err) {
		t.Fatalf("load reset conversation err = %T %v, want persistence not found", err, err)
	}
}
