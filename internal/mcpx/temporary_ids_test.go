package mcpx

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTemporaryIDStoreAssignsSequentialNumericIDsAndPersists(t *testing.T) {
	t.Parallel()

	store, mapPath := newTemporaryIDStoreForTest(t)

	firstID, err := store.EnsureTemporaryID("project-alpha")
	if err != nil {
		t.Fatalf("assign first temporary id: %v", err)
	}
	if firstID != "1" {
		t.Fatalf("expected first temporary id 1, got %q", firstID)
	}

	secondID, err := store.EnsureTemporaryID("chat-section")
	if err != nil {
		t.Fatalf("assign second temporary id: %v", err)
	}
	if secondID != "2" {
		t.Fatalf("expected second temporary id 2, got %q", secondID)
	}

	againID, err := store.EnsureTemporaryID("project-alpha")
	if err != nil {
		t.Fatalf("reassign existing temporary id: %v", err)
	}
	if againID != "1" {
		t.Fatalf("expected stable temporary id 1, got %q", againID)
	}

	payload := readTemporaryIDMapForTest(t, mapPath)
	if payload["project-alpha"] != "1" {
		t.Fatalf("expected persisted project mapping, got %#v", payload)
	}
	if payload["chat-section"] != "2" {
		t.Fatalf("expected persisted section mapping, got %#v", payload)
	}
}

func TestTemporaryIDStoreResolvesKnownTemporaryIDsAndRejectsUnknownNumericIDs(t *testing.T) {
	t.Parallel()

	store, mapPath := newTemporaryIDStoreForTest(t)
	writeTemporaryIDMapForTest(t, mapPath, map[string]string{
		"project-alpha": "7",
		"chat-section":  "8",
	})

	resolved, err := store.ResolveClientID("7")
	if err != nil {
		t.Fatalf("resolve known temporary id: %v", err)
	}
	if resolved != "project-alpha" {
		t.Fatalf("expected canonical project-alpha, got %q", resolved)
	}

	canonical, err := store.ResolveClientID("chat-section")
	if err != nil {
		t.Fatalf("resolve known canonical id: %v", err)
	}
	if canonical != "chat-section" {
		t.Fatalf("expected canonical chat-section, got %q", canonical)
	}

	_, err = store.ResolveClientID("999")
	if err == nil {
		t.Fatal("expected unknown numeric temporary id to fail")
	}
	unknown, ok := err.(*UnknownTemporaryIDError)
	if !ok {
		t.Fatalf("expected UnknownTemporaryIDError, got %T", err)
	}
	if unknown.ID != "999" {
		t.Fatalf("expected unknown id 999, got %#v", unknown)
	}
}

func TestTemporaryIDStoreReloadsAfterExternalFileChange(t *testing.T) {
	t.Parallel()

	store, mapPath := newTemporaryIDStoreForTest(t)
	writeTemporaryIDMapForTest(t, mapPath, map[string]string{
		"project-alpha": "3",
	})

	if _, err := store.ResolveClientID("3"); err != nil {
		t.Fatalf("resolve existing temporary id: %v", err)
	}

	time.Sleep(10 * time.Millisecond)
	writeTemporaryIDMapForTest(t, mapPath, map[string]string{
		"project-alpha": "3",
		"chat-section":  "4",
	})

	resolved, err := store.ResolveClientID("4")
	if err != nil {
		t.Fatalf("resolve reloaded temporary id: %v", err)
	}
	if resolved != "chat-section" {
		t.Fatalf("expected canonical chat-section, got %q", resolved)
	}
}

func newTemporaryIDStoreForTest(t *testing.T) (*TemporaryIDStore, string) {
	t.Helper()

	mapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	store, err := NewTemporaryIDStore(mapPath)
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	return store, mapPath
}

func readTemporaryIDMapForTest(t *testing.T, path string) map[string]string {
	t.Helper()

	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read temporary id map %s: %v", path, err)
	}
	decoded := map[string]string{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode temporary id map %s: %v", path, err)
	}
	return decoded
}

func writeTemporaryIDMapForTest(t *testing.T, path string, payload map[string]string) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("encode temporary id map: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir temporary id map dir: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write temporary id map: %v", err)
	}
}
