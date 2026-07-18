package chat

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChatCodexDefaultsStartWithWorkspaceAccess(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))

	view, err := service.ReadChatCodexDefaults(context.Background())
	if err != nil {
		t.Fatalf("read chat codex defaults: %v", err)
	}

	if view.SelectedPermissionPreset == nil || *view.SelectedPermissionPreset != ChatPermissionPresetDefault {
		t.Fatalf("selected permission preset = %v, want default", view.SelectedPermissionPreset)
	}
	if view.CurrentPermission == nil || view.CurrentPermission.DisplayLabel != "Workspace Access" {
		t.Fatalf("current permission = %+v, want Workspace Access", view.CurrentPermission)
	}
	if view.Settings.Permission == nil || view.Settings.Permission.Preset != ChatPermissionPresetDefault {
		t.Fatalf("settings permission = %+v, want default preset", view.Settings.Permission)
	}
}

func TestChatCodexDefaultsPersistAndSeedNewConversations(t *testing.T) {
	appDataDir := t.TempDir()
	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	effort := ReasoningEffortXHigh
	permission, ok := chatPermissionSettingsForPreset(ChatPermissionPresetReadOnly)
	if !ok {
		t.Fatal("read-only preset is missing")
	}

	view, err := service.UpdateChatCodexDefaults(context.Background(), ChatCodexSettings{
		Model:           "scripted-careful",
		ReasoningEffort: &effort,
		Permission:      &permission,
	}, false)
	if err != nil {
		t.Fatalf("update chat codex defaults: %v", err)
	}
	if view.SelectedModel != "scripted-careful" || view.SelectedReasoningEffort == nil ||
		*view.SelectedReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("defaults view selected model/effort = %q/%v", view.SelectedModel, view.SelectedReasoningEffort)
	}

	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	assertConversationCodexDefaults(t, conversation, ChatPermissionPresetReadOnly)

	restarted := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	restartedConversation, err := restarted.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation after restart: %v", err)
	}
	assertConversationCodexDefaults(t, restartedConversation, ChatPermissionPresetReadOnly)
}

func TestChatCodexDefaultsRejectMalformedStoredDefaults(t *testing.T) {
	store := mustStore(t, t.TempDir())
	if err := os.MkdirAll(filepath.Dir(store.chatCodexDefaultsPath()), 0o755); err != nil {
		t.Fatalf("create defaults dir: %v", err)
	}
	if err := os.WriteFile(store.chatCodexDefaultsPath(), []byte(`{"schemaVersion":0,"settings":{"permission":null}}`), 0o644); err != nil {
		t.Fatalf("write defaults: %v", err)
	}

	_, err := store.LoadChatCodexDefaults()
	if err == nil {
		t.Fatal("load chat codex defaults unexpectedly succeeded")
	}
	if !strings.Contains(err.Error(), "unsupported schemaVersion") {
		t.Fatalf("load error = %v, want unsupported schemaVersion", err)
	}
}

func TestChatCodexDefaultsRequireStoredPermission(t *testing.T) {
	store := mustStore(t, t.TempDir())
	if err := os.MkdirAll(filepath.Dir(store.chatCodexDefaultsPath()), 0o755); err != nil {
		t.Fatalf("create defaults dir: %v", err)
	}
	body := fmt.Sprintf(`{"schemaVersion":%d,"settings":{"permission":null}}`, SchemaVersion)
	if err := os.WriteFile(store.chatCodexDefaultsPath(), []byte(body), 0o644); err != nil {
		t.Fatalf("write defaults: %v", err)
	}

	_, err := store.LoadChatCodexDefaults()
	if err == nil {
		t.Fatal("load chat codex defaults unexpectedly succeeded")
	}
	if !strings.Contains(err.Error(), "permission is required") {
		t.Fatalf("load error = %v, want required permission", err)
	}
}

func assertConversationCodexDefaults(t *testing.T, conversation Conversation, preset ChatPermissionPresetID) {
	t.Helper()

	if conversation.CodexSettings == nil {
		t.Fatal("conversation codexSettings is nil")
	}
	if conversation.CodexSettings.Model != "scripted-careful" {
		t.Fatalf("conversation model = %q, want scripted-careful", conversation.CodexSettings.Model)
	}
	if conversation.CodexSettings.ReasoningEffort == nil ||
		*conversation.CodexSettings.ReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("conversation reasoning = %v, want xhigh", conversation.CodexSettings.ReasoningEffort)
	}
	if conversation.CodexSettings.Permission == nil ||
		conversation.CodexSettings.Permission.Preset != preset {
		t.Fatalf("conversation permission = %+v, want %s", conversation.CodexSettings.Permission, preset)
	}
	if conversation.CodexEffectiveSettings == nil {
		t.Fatal("conversation codexEffectiveSettings is nil")
	}
	if conversation.CodexEffectiveSettings.ModelDisplayName != "Scripted Careful" {
		t.Fatalf("effective model display = %q, want Scripted Careful", conversation.CodexEffectiveSettings.ModelDisplayName)
	}
	if conversation.CodexEffectiveSettings.ReasoningEffortDisplayName != "Extra high" {
		t.Fatalf("effective reasoning display = %q, want Extra high", conversation.CodexEffectiveSettings.ReasoningEffortDisplayName)
	}
	if conversation.CodexEffectiveSettings.Permission == nil ||
		conversation.CodexEffectiveSettings.Permission.DisplayLabel != "Read Only" {
		t.Fatalf("effective permission = %+v, want Read Only", conversation.CodexEffectiveSettings.Permission)
	}
}
