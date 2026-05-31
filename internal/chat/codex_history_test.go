package chat

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/workspace"
)

func TestCodexHistoryProviderListsWorkspaceSessions(t *testing.T) {
	rootDir := t.TempDir()
	workspaceRoot := t.TempDir()
	writeCodexSessionIndex(t, rootDir, `{"id":"session_api","thread_name":"Imported terminal work","updated_at":"2026-05-31T16:42:00Z"}`)
	writeCodexSession(t, rootDir, "session_api", workspaceRoot, []string{
		`{"timestamp":"2026-05-31T16:40:00Z","type":"event_msg","payload":{"type":"user_message","message":"please update the site"}}`,
		`{"timestamp":"2026-05-31T16:41:00Z","type":"event_msg","payload":{"type":"agent_message","message":"I updated the site.","phase":"final"}}`,
	})

	provider := NewCodexHistoryProvider(CodexHistoryProviderConfig{RootDir: rootDir})
	items, err := provider.ListConversations(workspace.WorkspaceSummary{
		ID:       "workspace_api",
		RootPath: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %+v, want one external history item", items)
	}
	item := items[0]
	if item.Conversation.ID != "external_codex_session_api" {
		t.Fatalf("conversation id = %q, want external id", item.Conversation.ID)
	}
	if item.Conversation.Title != "Imported terminal work" {
		t.Fatalf("title = %q, want index title", item.Conversation.Title)
	}
	if item.Conversation.HarnessRefs[0].ThreadID != "session_api" {
		t.Fatalf("thread id = %q, want session_api", item.Conversation.HarnessRefs[0].ThreadID)
	}
	if item.MessageCount != 2 {
		t.Fatalf("message count = %d, want 2", item.MessageCount)
	}

	external, err := provider.LoadConversation(workspace.WorkspaceSummary{
		ID:       "workspace_api",
		RootPath: workspaceRoot,
	}, item.Conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if len(external.Messages) != 2 || external.Messages[0].Role != RoleUser || external.Messages[1].Role != RoleAssistant {
		t.Fatalf("messages = %+v, want user and assistant messages", external.Messages)
	}
}

func TestServiceListsAndMaterializesExternalHistory(t *testing.T) {
	rootDir := t.TempDir()
	workspaceRoot := t.TempDir()
	writeCodexSession(t, rootDir, "session_api", workspaceRoot, []string{
		`{"timestamp":"2026-05-31T16:40:00Z","type":"event_msg","payload":{"type":"user_message","message":"continue this work"}}`,
		`{"timestamp":"2026-05-31T16:41:00Z","type":"event_msg","payload":{"type":"agent_message","message":"Ready to continue.","phase":"final"}}`,
	})
	resolver := resolver{
		"workspace_api": {
			ID:           "workspace_api",
			RootPath:     workspaceRoot,
			DisplayName:  "api",
			LastOpenedAt: "2026-05-29T20:00:00Z",
		},
	}
	service := newTestService(
		t,
		t.TempDir(),
		resolver,
		NewFakeHarness(nil),
		WithExternalHistoryProvider(NewCodexHistoryProvider(CodexHistoryProviderConfig{RootDir: rootDir})),
	)

	items, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(items) != 1 || items[0].Conversation.ID != "external_codex_session_api" {
		t.Fatalf("items = %+v, want external history conversation", items)
	}

	page, err := service.LoadMessagePage("workspace_api", "external_codex_session_api", 0, 20)
	if err != nil {
		t.Fatalf("load external page: %v", err)
	}
	if len(page.Messages) != 2 {
		t.Fatalf("page messages = %d, want 2", len(page.Messages))
	}
	stored, err := service.store.LoadConversation("workspace_api", "external_codex_session_api")
	if err != nil {
		t.Fatalf("load materialized conversation: %v", err)
	}
	if stored.HarnessRefs[0].ThreadID != "session_api" {
		t.Fatalf("materialized thread id = %q, want session_api", stored.HarnessRefs[0].ThreadID)
	}

	items, err = service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations after materialize: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items after materialize = %+v, want no duplicate external item", items)
	}
}

func writeCodexSessionIndex(t *testing.T, rootDir string, line string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(rootDir, "session_index.jsonl"), []byte(line+"\n"), 0o644); err != nil {
		t.Fatalf("write codex session index: %v", err)
	}
}

func writeCodexSession(t *testing.T, rootDir string, sessionID string, cwd string, eventLines []string) {
	t.Helper()
	dir := filepath.Join(rootDir, "sessions", "2026", "05", "31")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create codex session dir: %v", err)
	}
	lines := append([]string{
		`{"timestamp":"2026-05-31T16:39:00Z","type":"session_meta","payload":{"id":"` + sessionID + `","timestamp":"2026-05-31T16:39:00Z","cwd":"` + filepath.ToSlash(cwd) + `","originator":"codex-tui"}}`,
	}, eventLines...)
	path := filepath.Join(dir, "rollout-2026-05-31T16-39-00-"+sessionID+".jsonl")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatalf("write codex session: %v", err)
	}
}
