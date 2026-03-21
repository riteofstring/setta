package externalagentconfigs

import (
	"os"
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

func TestResolveWhitelistedEnvVarsIgnoresDotEnvOnlyKeysWithoutManagedIndex(t *testing.T) {
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

	if len(resolution.EnvVars) != 0 {
		t.Fatalf("expected no resolved env vars for plain dotenv-only keys, got %#v", resolution.EnvVars)
	}
	if len(resolution.Status.Present) != 0 {
		t.Fatalf("expected no present env vars, got %#v", resolution.Status)
	}
	if !reflect.DeepEqual(resolution.Status.Missing, []string{"MISSING_KEY", "PLAIN_KEY"}) {
		t.Fatalf("expected plain dotenv-only and missing keys to stay missing, got %#v", resolution.Status)
	}
	if resolution.CorruptionIssue != "" || resolution.UnavailableIssue != "" {
		t.Fatalf("expected no managed-store issues, got %#v", resolution)
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
