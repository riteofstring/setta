package llmconfig

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadManagedAPIKeysWithStatusReturnsEmptySnapshotWhenDotEnvMissing(t *testing.T) {
	t.Parallel()

	result := ReadManagedAPIKeysWithStatus(filepath.Join(t.TempDir(), ".env"))

	if result.Corrupt {
		t.Fatalf("expected non-corrupt result, got %#v", result)
	}
	if result.ErrorCode != "" {
		t.Fatalf("expected no error code, got %#v", result)
	}
	if result.Revision != 0 {
		t.Fatalf("expected zero revision, got %#v", result)
	}
	if len(result.APIKeys) != 0 {
		t.Fatalf("expected empty api keys, got %#v", result.APIKeys)
	}
}

func TestReadManagedAPIKeysWithStatusReadsOnlyIndexedKeys(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	content := strings.Join([]string{
		"OPENAI_API_KEY=secret",
		"UNRELATED_SECRET=do-not-expose",
		`SETTA_MANAGED_LLM_API_KEY_NAMES=["OPENAI_API_KEY"]`,
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	result := ReadManagedAPIKeysWithStatus(path)

	if result.Corrupt || result.ErrorCode != "" {
		t.Fatalf("expected successful read, got %#v", result)
	}
	if got := result.APIKeys["OPENAI_API_KEY"]; got != "secret" {
		t.Fatalf("expected indexed key, got %#v", result.APIKeys)
	}
	if _, ok := result.APIKeys["UNRELATED_SECRET"]; ok {
		t.Fatalf("expected unrelated secret to be hidden, got %#v", result.APIKeys)
	}
	if result.Revision <= 0 {
		t.Fatalf("expected positive revision, got %#v", result)
	}
}

func TestReadManagedAPIKeysWithStatusReportsCorruptIndex(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	content := strings.Join([]string{
		"OPENAI_API_KEY=secret",
		"SETTA_MANAGED_LLM_API_KEY_NAMES=not-json",
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	result := ReadManagedAPIKeysWithStatus(path)

	if !result.Corrupt {
		t.Fatalf("expected corrupt result, got %#v", result)
	}
	if result.ErrorCode != ManagedAPIKeysCorruptErrorCode {
		t.Fatalf("expected corrupt error code, got %#v", result)
	}
	if result.Revision != 0 {
		t.Fatalf("expected zero revision, got %#v", result)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionRejectsStaleRevision(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)

	first := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "existing",
	}, 0, nil)
	if first.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected first write success, got %#v", first)
	}

	second := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "next",
	}, 0, nil)

	if second.Status != ManagedAPIKeysWriteStatusRevisionConflict {
		t.Fatalf("expected revision conflict, got %#v", second)
	}
	if second.ErrorCode != ManagedAPIKeysRevisionConflictErrorCode {
		t.Fatalf("expected revision conflict code, got %#v", second)
	}
	if second.Revision != first.Revision {
		t.Fatalf("expected current revision %d, got %#v", first.Revision, second)
	}
	if got := second.APIKeys["OPENAI_API_KEY"]; got != "existing" {
		t.Fatalf("expected current keys in conflict payload, got %#v", second.APIKeys)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionPreservesQuotedUnrelatedValues(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	raw := "UNRELATED=\"a b # c\"\nBASE_URL=https://api.example.com\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatalf("write initial .env: %v", err)
	}

	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "saved-secret",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %#v", result)
	}

	persistedRaw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read persisted .env: %v", err)
	}
	if !strings.Contains(string(persistedRaw), "UNRELATED=\"a b # c\"\n") {
		t.Fatalf("expected quoted unrelated value preserved, got %q", string(persistedRaw))
	}

	parsed, err := ReadEnvFile(path)
	if err != nil {
		t.Fatalf("parse persisted .env: %v", err)
	}
	if parsed["UNRELATED"] != "a b # c" {
		t.Fatalf("expected unrelated value to roundtrip, got %#v", parsed)
	}
	if parsed["OPENAI_API_KEY"] != "saved-secret" {
		t.Fatalf("expected managed key to persist, got %#v", parsed)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionRepairsCorruptIndexAndPurgesConfiguredKeys(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	content := strings.Join([]string{
		"UNRELATED_SECRET=keep-me",
		"OPENAI_API_KEY=stale-secret",
		"SETTA_MANAGED_LLM_API_KEY_NAMES=not-json",
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write corrupt .env: %v", err)
	}

	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{}, 0, []string{"OPENAI_API_KEY"})
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected repair write success, got %#v", result)
	}
	if result.Revision != 0 {
		t.Fatalf("expected zero revision after purge, got %#v", result)
	}

	persistedRaw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read repaired .env: %v", err)
	}
	if strings.Contains(string(persistedRaw), "OPENAI_API_KEY=stale-secret") {
		t.Fatalf("expected stale configured key removed, got %q", string(persistedRaw))
	}
	if !strings.Contains(string(persistedRaw), "UNRELATED_SECRET=keep-me") {
		t.Fatalf("expected unrelated value preserved, got %q", string(persistedRaw))
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionRemovesManagedKey(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	first := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY":    "openai-secret",
		"ANTHROPIC_API_KEY": "anthropic-secret",
	}, 0, nil)
	if first.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected initial write success, got %#v", first)
	}

	second := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "openai-secret",
	}, first.Revision, nil)
	if second.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected removal write success, got %#v", second)
	}

	parsed, err := ReadEnvFile(path)
	if err != nil {
		t.Fatalf("parse .env after removal: %v", err)
	}
	if _, ok := parsed["ANTHROPIC_API_KEY"]; ok {
		t.Fatalf("expected removed managed key to be absent, got %#v", parsed)
	}
	if got := parsed[managedAPIKeyNamesEnvVar]; got != `["OPENAI_API_KEY"]` {
		t.Fatalf("expected managed key index updated, got %#v", parsed)
	}
}
