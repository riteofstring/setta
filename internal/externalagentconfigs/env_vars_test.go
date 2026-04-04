package externalagentconfigs

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/llmconfig"
)

func TestResolveWhitelistedEnvVarsReadsProcessEnv(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	resolution := ResolveWhitelistedEnvVars(
		workspaceRoot,
		"",
		map[string]string{
			"PROCESS_KEY": "process-secret",
		},
		[]string{"PROCESS_KEY"},
	)

	if !reflect.DeepEqual(resolution.EnvVars, map[string]string{"PROCESS_KEY": "process-secret"}) {
		t.Fatalf("expected process env var resolution, got %#v", resolution.EnvVars)
	}
	if !reflect.DeepEqual(resolution.Status.Present, []string{"PROCESS_KEY"}) {
		t.Fatalf("expected present status for process env var, got %#v", resolution.Status)
	}
	if len(resolution.Status.Missing) != 0 {
		t.Fatalf("expected no missing env vars, got %#v", resolution.Status)
	}
	if resolution.CorruptionIssue != "" || resolution.UnavailableIssue != "" {
		t.Fatalf("expected no managed-store issues, got %#v", resolution)
	}
}

func TestResolveWhitelistedEnvVarsUsesManagedFallbackForWhitespaceProcessValue(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	writeManagedEnvVarTestStore(t, workspaceRoot, []string{
		`SETTA_MANAGED_LLM_API_KEY_NAMES=["WHITESPACE_KEY"]`,
		"WHITESPACE_KEY=managed-fallback",
	})

	resolution := ResolveWhitelistedEnvVars(
		workspaceRoot,
		"",
		map[string]string{
			"WHITESPACE_KEY": "   ",
		},
		[]string{"WHITESPACE_KEY"},
	)

	if !reflect.DeepEqual(resolution.EnvVars, map[string]string{"WHITESPACE_KEY": "managed-fallback"}) {
		t.Fatalf("expected managed fallback for whitespace process env, got %#v", resolution.EnvVars)
	}
	if !reflect.DeepEqual(resolution.Status.Present, []string{"WHITESPACE_KEY"}) {
		t.Fatalf("expected present status for managed fallback, got %#v", resolution.Status)
	}
	if len(resolution.Status.Missing) != 0 {
		t.Fatalf("expected no missing env vars, got %#v", resolution.Status)
	}
}

func TestResolveWhitelistedEnvVarsUsesWorkspaceDotEnvFallbackWithoutManagedIndex(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	writeManagedEnvVarTestStore(t, workspaceRoot, []string{
		"PLAIN_KEY=plain-dot-env-value",
	})

	resolution := ResolveWhitelistedEnvVars(
		workspaceRoot,
		"",
		map[string]string{},
		[]string{"PLAIN_KEY", "MISSING_KEY"},
	)

	if !reflect.DeepEqual(resolution.EnvVars, map[string]string{"PLAIN_KEY": "plain-dot-env-value"}) {
		t.Fatalf("expected plain dotenv fallback for whitelisted keys, got %#v", resolution.EnvVars)
	}
	if !reflect.DeepEqual(resolution.Status.Present, []string{"PLAIN_KEY"}) {
		t.Fatalf("expected plain dotenv key to be present, got %#v", resolution.Status)
	}
	if !reflect.DeepEqual(resolution.Status.Missing, []string{"MISSING_KEY"}) {
		t.Fatalf("expected only missing keys to remain missing, got %#v", resolution.Status)
	}
	if resolution.CorruptionIssue != "" || resolution.UnavailableIssue != "" {
		t.Fatalf("expected no managed-store issues, got %#v", resolution)
	}
}

func TestResolveWhitelistedEnvVarsReportsCorruptManagedStoreForInvalidUTF8(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(llmconfig.ManagedAPIKeysPath(workspaceRoot), []byte{0xff, 0xfe, 0xfd}, 0o600); err != nil {
		t.Fatalf("write invalid utf-8 managed env store: %v", err)
	}

	resolution := ResolveWhitelistedEnvVars(
		workspaceRoot,
		"",
		map[string]string{},
		[]string{"MISSING_KEY"},
	)

	if len(resolution.EnvVars) != 0 {
		t.Fatalf("expected no resolved env vars for corrupt store, got %#v", resolution.EnvVars)
	}
	if len(resolution.Status.Present) != 0 {
		t.Fatalf("expected no present env vars, got %#v", resolution.Status)
	}
	if !reflect.DeepEqual(resolution.Status.Missing, []string{"MISSING_KEY"}) {
		t.Fatalf("expected missing key status, got %#v", resolution.Status)
	}
	if resolution.CorruptionIssue != managedAPIKeysCorruptIssue {
		t.Fatalf("expected corrupt managed-store issue, got %#v", resolution)
	}
	if resolution.UnavailableIssue != "" {
		t.Fatalf("expected no unavailable issue, got %#v", resolution)
	}
}

func TestResolveWhitelistedEnvVarsReportsUnavailableManagedStore(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	envPath := llmconfig.ManagedAPIKeysPath(workspaceRoot)
	if err := os.MkdirAll(filepath.Dir(envPath), 0o755); err != nil {
		t.Fatalf("mkdir managed env store parent: %v", err)
	}
	if err := os.Mkdir(envPath, 0o755); err != nil {
		t.Fatalf("create directory at managed env store path: %v", err)
	}

	resolution := ResolveWhitelistedEnvVars(
		workspaceRoot,
		"",
		map[string]string{},
		[]string{"MISSING_KEY"},
	)

	if len(resolution.EnvVars) != 0 {
		t.Fatalf("expected no resolved env vars for unavailable store, got %#v", resolution.EnvVars)
	}
	if len(resolution.Status.Present) != 0 {
		t.Fatalf("expected no present env vars, got %#v", resolution.Status)
	}
	if !reflect.DeepEqual(resolution.Status.Missing, []string{"MISSING_KEY"}) {
		t.Fatalf("expected missing key status, got %#v", resolution.Status)
	}
	if resolution.UnavailableIssue != managedAPIKeysUnavailableIssue {
		t.Fatalf("expected unavailable managed-store issue, got %#v", resolution)
	}
	if resolution.CorruptionIssue != "" {
		t.Fatalf("expected no corruption issue, got %#v", resolution)
	}
}

func writeManagedEnvVarTestStore(t *testing.T, workspaceRoot string, lines []string) {
	t.Helper()

	if err := os.WriteFile(llmconfig.ManagedAPIKeysPath(workspaceRoot), []byte(joinLines(lines)), 0o600); err != nil {
		t.Fatalf("write managed env store: %v", err)
	}
}

func joinLines(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	result := ""
	for _, line := range lines {
		result += line + "\n"
	}
	return result
}
