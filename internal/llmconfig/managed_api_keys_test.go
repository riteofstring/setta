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

func TestWriteManagedAPIKeysWithExpectedRevisionPreservesUnrelatedValues(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	raw := "UNRELATED_SECRET=keep-me\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatalf("write initial .env: %v", err)
	}

	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "saved-secret",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %#v", result)
	}

	parsed, err := ReadEnvFile(path)
	if err != nil {
		t.Fatalf("parse persisted .env: %v", err)
	}
	if parsed["UNRELATED_SECRET"] != "keep-me" {
		t.Fatalf("expected unrelated value preserved, got %#v", parsed)
	}
	if parsed["OPENAI_API_KEY"] != "saved-secret" {
		t.Fatalf("expected managed key to persist, got %#v", parsed)
	}
	if parsed[managedAPIKeyNamesEnvVar] != `["OPENAI_API_KEY"]` {
		t.Fatalf("expected managed key index preserved, got %#v", parsed)
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

func TestWriteManagedAPIKeysWithExpectedRevisionPreservesLiteralInterpolationTokens(t *testing.T) {
	t.Parallel()

	path := ManagedAPIKeysPath(t.TempDir())
	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "tok_${HOME}_x",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %#v", result)
	}

	readResult := ReadManagedAPIKeysWithStatus(path)
	if readResult.ErrorCode != "" {
		t.Fatalf("expected successful read, got %#v", readResult)
	}
	if got := readResult.APIKeys["OPENAI_API_KEY"]; got != "tok_${HOME}_x" {
		t.Fatalf("expected literal interpolation token preserved, got %#v", readResult.APIKeys)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionPreservesUnsetVariableTokens(t *testing.T) {
	t.Parallel()

	path := ManagedAPIKeysPath(t.TempDir())
	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "tok_${UNSET_VAR}_x",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %#v", result)
	}

	readResult := ReadManagedAPIKeysWithStatus(path)
	if readResult.ErrorCode != "" {
		t.Fatalf("expected successful read, got %#v", readResult)
	}
	if got := readResult.APIKeys["OPENAI_API_KEY"]; got != "tok_${UNSET_VAR}_x" {
		t.Fatalf("expected unset variable token preserved, got %#v", readResult.APIKeys)
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

func TestReadManagedAPIKeysWithStatusIsStableAcrossRepeatedReads(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "tok_${HOME}_x",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %#v", result)
	}

	first := ReadManagedAPIKeysWithStatus(path)
	second := ReadManagedAPIKeysWithStatus(path)
	if first.ErrorCode != "" || second.ErrorCode != "" {
		t.Fatalf("expected stable successful reads, got first=%#v second=%#v", first, second)
	}
	if first.Revision != second.Revision {
		t.Fatalf("expected stable revision across repeated reads, got first=%#v second=%#v", first, second)
	}
	if len(first.APIKeys) != len(second.APIKeys) || first.APIKeys["OPENAI_API_KEY"] != second.APIKeys["OPENAI_API_KEY"] {
		t.Fatalf("expected stable api keys across repeated reads, got first=%#v second=%#v", first.APIKeys, second.APIKeys)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionRepairsCorruptIndexWhenRevisionZero(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	content := strings.Join([]string{
		"UNRELATED_SECRET=keep-me",
		"SETTA_MANAGED_LLM_API_KEY_NAMES=not-json",
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write corrupt .env: %v", err)
	}

	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "repaired-secret",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected repair write success, got %#v", result)
	}

	parsed, err := ReadEnvFile(path)
	if err != nil {
		t.Fatalf("parse repaired .env: %v", err)
	}
	if parsed["UNRELATED_SECRET"] != "keep-me" {
		t.Fatalf("expected unrelated value preserved, got %#v", parsed)
	}
	if parsed["OPENAI_API_KEY"] != "repaired-secret" {
		t.Fatalf("expected repaired key to persist, got %#v", parsed)
	}
	if parsed[managedAPIKeyNamesEnvVar] != `["OPENAI_API_KEY"]` {
		t.Fatalf("expected managed key index repaired, got %#v", parsed)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionReportsCorruptIndex(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	content := strings.Join([]string{
		"OPENAI_API_KEY=existing-secret",
		"SETTA_MANAGED_LLM_API_KEY_NAMES=not-json",
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write corrupt .env: %v", err)
	}

	result := WriteManagedAPIKeysWithExpectedRevision(path, map[string]string{
		"OPENAI_API_KEY": "next-secret",
	}, 1, nil)
	if result.Status != ManagedAPIKeysWriteStatusCorruptStore {
		t.Fatalf("expected corrupt store status, got %#v", result)
	}
	if result.ErrorCode != ManagedAPIKeysCorruptErrorCode {
		t.Fatalf("expected corrupt store error code, got %#v", result)
	}
	if result.Revision != 0 {
		t.Fatalf("expected zero revision after corrupt store failure, got %#v", result)
	}
}

func TestReadManagedAPIKeysWithStatusReportsUnavailableStore(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("make env path directory: %v", err)
	}

	result := ReadManagedAPIKeysWithStatus(path)
	if result.Corrupt {
		t.Fatalf("expected unavailable result to stay non-corrupt, got %#v", result)
	}
	if result.Revision != 0 {
		t.Fatalf("expected zero revision, got %#v", result)
	}
	if result.ErrorCode != ManagedAPIKeysUnavailableErrorCode {
		t.Fatalf("expected unavailable error code, got %#v", result)
	}
	if len(result.APIKeys) != 0 {
		t.Fatalf("expected empty api key snapshot, got %#v", result.APIKeys)
	}
	if strings.TrimSpace(result.Error) == "" {
		t.Fatalf("expected unavailable error message, got %#v", result)
	}
}

func TestWriteManagedAPIKeysWithExpectedRevisionReportsUnavailableStoreWhenWriteFails(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	storeRoot := filepath.Join(root, "store")
	if err := os.MkdirAll(storeRoot, 0o755); err != nil {
		t.Fatalf("mkdir store root: %v", err)
	}
	path := filepath.Join(storeRoot, ".env")
	content := strings.Join([]string{
		"OPENAI_API_KEY=existing-secret",
		`SETTA_MANAGED_LLM_API_KEY_NAMES=["OPENAI_API_KEY"]`,
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write initial .env: %v", err)
	}
	current := ReadManagedAPIKeysWithStatus(path)
	if current.ErrorCode != "" {
		t.Fatalf("expected readable initial store, got %#v", current)
	}

	lockRoot := filepath.Join(root, "locks")
	if err := os.MkdirAll(lockRoot, 0o755); err != nil {
		t.Fatalf("mkdir lock root: %v", err)
	}
	if err := os.Chmod(storeRoot, 0o555); err != nil {
		t.Fatalf("chmod store root read-only: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(storeRoot, 0o755)
	})

	result := WriteManagedAPIKeysWithExpectedRevisionInLockRoot(path, map[string]string{
		"OPENAI_API_KEY": "next-secret",
	}, current.Revision, nil, lockRoot)
	if result.Status != ManagedAPIKeysWriteStatusStoreUnavailable {
		t.Fatalf("expected store unavailable status, got %#v", result)
	}
	if result.ErrorCode != ManagedAPIKeysUnavailableErrorCode {
		t.Fatalf("expected unavailable error code, got %#v", result)
	}
	if result.Revision != 0 {
		t.Fatalf("expected zero revision after write failure, got %#v", result)
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

func TestWriteManagedAPIKeysWithExpectedRevisionInLockRootStoresLockUnderRuntimeRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := ManagedAPIKeysPath(root)
	runtimeRoot := filepath.Join(root, "setta_files_dev", "runtime")

	result := WriteManagedAPIKeysWithExpectedRevisionInLockRoot(path, map[string]string{
		"OPENAI_API_KEY": "saved-secret",
	}, 0, nil, runtimeRoot)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %#v", result)
	}

	if _, err := os.Stat(path + ".lock"); !os.IsNotExist(err) {
		t.Fatalf("expected no workspace .env.lock, got err=%v", err)
	}

	lockEntries, err := os.ReadDir(filepath.Join(runtimeRoot, managedAPIKeysLocksDirName))
	if err != nil {
		t.Fatalf("read managed api key lock dir: %v", err)
	}
	if len(lockEntries) != 1 {
		t.Fatalf("expected one runtime lock file, got %#v", lockEntries)
	}
	if !strings.HasPrefix(lockEntries[0].Name(), ".env_") || !strings.HasSuffix(lockEntries[0].Name(), ".lock") {
		t.Fatalf("expected hashed runtime lock file name, got %q", lockEntries[0].Name())
	}
}

func TestManagedAPIKeysPathAnchorsWorkspaceRootDotEnv(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "state")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	if err := os.MkdirAll(settaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir setta files root: %v", err)
	}

	envPath := ManagedAPIKeysPath(workspaceRoot)
	expectedPath := filepath.Join(workspaceRoot, ".env")
	if envPath != expectedPath {
		t.Fatalf("expected workspace-root .env path %q, got %q", expectedPath, envPath)
	}

	result := WriteManagedAPIKeysWithExpectedRevision(envPath, map[string]string{
		"SETTA_TEST_KEY": "value",
	}, 0, nil)
	if result.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected managed api key write success, got %#v", result)
	}

	content, err := os.ReadFile(expectedPath)
	if err != nil {
		t.Fatalf("read workspace .env: %v", err)
	}
	if !strings.Contains(string(content), "SETTA_TEST_KEY=value") {
		t.Fatalf("expected managed key in workspace .env, got %q", string(content))
	}
	if _, err := os.Stat(filepath.Join(settaFilesRoot, ".env")); !os.IsNotExist(err) {
		t.Fatalf("expected no .env under setta_files root, got err=%v", err)
	}
}
