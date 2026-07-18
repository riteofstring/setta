package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/appstate"
	"setta/internal/chat"
)

func TestRunSeedsWorkspacePath(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceDir := t.TempDir()
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := run([]string{"--app-data-dir", appDataDir, "--workspace-path", workspaceDir}, &stdout, &stderr, emptyEnv)
	if code != 0 {
		t.Fatalf("run exit = %d, stderr = %q", code, stderr.String())
	}
	stateStore, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app state store: %v", err)
	}
	state, err := stateStore.Load()
	if err != nil {
		t.Fatalf("load app state: %v", err)
	}
	if state.SelectedWorkspaceID == "" {
		t.Fatal("selected workspace id is empty")
	}
	store, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new chat store: %v", err)
	}
	conversation, err := store.LoadConversation(state.SelectedWorkspaceID, chat.UIShowcaseConversationID)
	if err != nil {
		t.Fatalf("load seeded conversation: %v", err)
	}
	if conversation.Title != "UI Showcase Chat" {
		t.Fatalf("conversation title = %q, want UI Showcase Chat", conversation.Title)
	}
	run, ok, err := store.ActiveRun(state.SelectedWorkspaceID, chat.UIShowcaseConversationID)
	if err != nil {
		t.Fatalf("load active showcase run: %v", err)
	}
	if !ok || run.PendingApproval == nil || run.PendingApproval.Kind != chat.ApprovalKindUserInput {
		t.Fatalf("active showcase run = %+v, want pending user-input approval", run)
	}
	if !strings.Contains(stdout.String(), "conversationId="+chat.UIShowcaseConversationID) {
		t.Fatalf("stdout = %q, want conversation id", stdout.String())
	}
}

func TestRunFailsWithoutSelectedWorkspace(t *testing.T) {
	appDataDir := t.TempDir()
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := run([]string{"--app-data-dir", appDataDir}, &stdout, &stderr, emptyEnv)
	if code == 0 {
		t.Fatalf("run exit = 0, stdout = %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "no selected workspace") {
		t.Fatalf("stderr = %q, want no selected workspace error", stderr.String())
	}
}

func TestConfigRejectsRelativeAppDataDir(t *testing.T) {
	var stderr bytes.Buffer
	_, err := configFromArgs([]string{"--app-data-dir", filepath.Join("relative", "app-data")}, &stderr, emptyEnv)
	if err == nil {
		t.Fatal("config succeeded, want relative app data error")
	}
}

func emptyEnv(string) string {
	return ""
}
