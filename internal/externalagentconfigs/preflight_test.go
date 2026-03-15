package externalagentconfigs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/llmconfig"
)

func TestSystemCheckerRequiresClaudeCLIAndSDK(t *testing.T) {
	workspaceRoot := t.TempDir()
	pythonPath := writeClaudePythonFixture(t, false)
	t.Setenv("SETTA_PYTHON", pythonPath)
	t.Setenv("PATH", t.TempDir())

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:       "claude",
		Name:     "Claude",
		ToolType: ToolTypeClaudeCode,
		RunMode:  RunModeSDK,
	})
	if err != nil {
		t.Fatalf("check claude config: %v", err)
	}
	if status.Available {
		t.Fatalf("expected claude sdk config to be unavailable, got %#v", status)
	}
	if !containsIssue(status.Issues, "Command not found (claude)") {
		t.Fatalf("expected missing claude CLI issue, got %#v", status.Issues)
	}
	if !containsIssue(status.Issues, "claude-agent-sdk not available") {
		t.Fatalf("expected missing claude sdk issue, got %#v", status.Issues)
	}
}

func TestSystemCheckerMarksClaudeSDKAvailableWhenCLIAndSDKPresent(t *testing.T) {
	workspaceRoot := t.TempDir()
	binDir := t.TempDir()
	claudePath := filepath.Join(binDir, "claude")
	if err := os.WriteFile(claudePath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake claude: %v", err)
	}
	pythonPath := writeClaudePythonFixture(t, true)
	t.Setenv("SETTA_PYTHON", pythonPath)
	t.Setenv("PATH", binDir)

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:       "claude",
		Name:     "Claude",
		ToolType: ToolTypeClaudeCode,
		RunMode:  RunModeSDK,
	})
	if err != nil {
		t.Fatalf("check claude config: %v", err)
	}
	if !status.Available {
		t.Fatalf("expected claude sdk config to be available, got %#v", status)
	}
	if status.CommandPath == nil || !strings.HasSuffix(*status.CommandPath, "claude") {
		t.Fatalf("expected resolved claude command path, got %#v", status.CommandPath)
	}
}

func TestSystemCheckerReadsWhitelistedEnvVarsFromProcessAndManagedStore(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	commandPath := writeExecutableFixture(t, "codex")
	write := llmconfig.WriteManagedAPIKeysWithExpectedRevision(
		llmconfig.ManagedAPIKeysPath(workspaceRoot),
		map[string]string{"MANAGED_KEY": "managed-secret"},
		0,
		nil,
	)
	if write.Status != llmconfig.ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("seed managed api keys: %#v", write)
	}

	checker, err := NewSystemChecker(SystemCheckerOptions{
		WorkspaceRoot: workspaceRoot,
		ProcessEnv: map[string]string{
			"PROCESS_KEY": "process-secret",
			"BLANK_KEY":   "   ",
		},
	})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:              "codex",
		Name:            "Codex",
		ToolType:        ToolTypeCodex,
		RunMode:         RunModeAppServer,
		CommandPath:     &commandPath,
		EnvVarWhitelist: []string{"PROCESS_KEY", "MANAGED_KEY", "MISSING_KEY", "BLANK_KEY"},
	})
	if err != nil {
		t.Fatalf("check codex config: %v", err)
	}
	if status.Available {
		t.Fatalf("expected missing env vars to block availability, got %#v", status)
	}
	if got := strings.Join(status.EnvVars.Present, ","); got != "MANAGED_KEY,PROCESS_KEY" {
		t.Fatalf("expected managed and process env vars to be present, got %#v", status.EnvVars)
	}
	if got := strings.Join(status.EnvVars.Missing, ","); got != "BLANK_KEY,MISSING_KEY" {
		t.Fatalf("expected blank and missing env vars to stay missing, got %#v", status.EnvVars)
	}
	if !containsIssue(status.Issues, "Missing env vars: BLANK_KEY, MISSING_KEY") {
		t.Fatalf("expected missing env var issue, got %#v", status.Issues)
	}
}

func TestSystemCheckerKeepsManagedStoreCorruptionNonBlockingWhenProcessEnvSatisfiesWhitelist(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	commandPath := writeExecutableFixture(t, "codex")
	envPath := llmconfig.ManagedAPIKeysPath(workspaceRoot)
	if err := os.WriteFile(envPath, []byte("SETTA_MANAGED_LLM_API_KEY_NAMES=not-json\n"), 0o600); err != nil {
		t.Fatalf("write corrupt managed api keys store: %v", err)
	}

	checker, err := NewSystemChecker(SystemCheckerOptions{
		WorkspaceRoot: workspaceRoot,
		ProcessEnv: map[string]string{
			"PRESENT_KEY": "process-secret",
		},
	})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:              "codex",
		Name:            "Codex",
		ToolType:        ToolTypeCodex,
		RunMode:         RunModeAppServer,
		CommandPath:     &commandPath,
		EnvVarWhitelist: []string{"PRESENT_KEY"},
	})
	if err != nil {
		t.Fatalf("check codex config: %v", err)
	}
	if !status.Available {
		t.Fatalf("expected process env to keep preflight available despite corrupt managed store, got %#v", status)
	}
	if got := strings.Join(status.EnvVars.Present, ","); got != "PRESENT_KEY" {
		t.Fatalf("expected present env var, got %#v", status.EnvVars)
	}
	if len(status.EnvVars.Missing) != 0 {
		t.Fatalf("expected no missing env vars, got %#v", status.EnvVars)
	}
	if !containsIssue(status.Issues, managedAPIKeysCorruptIssue) {
		t.Fatalf("expected corrupt managed api key issue, got %#v", status.Issues)
	}
}

func writeClaudePythonFixture(t *testing.T, succeed bool) string {
	t.Helper()

	pythonPath := filepath.Join(t.TempDir(), "python-fixture.sh")
	script := "#!/bin/sh\n"
	script += "if [ \"$1\" = \"-c\" ] && [ \"$2\" = \"import claude_agent_sdk\" ]; then\n"
	if succeed {
		script += "  exit 0\n"
	} else {
		script += "  echo \"ModuleNotFoundError: No module named 'claude_agent_sdk'\" >&2\n"
		script += "  exit 1\n"
	}
	script += "fi\n"
	script += "exit 0\n"
	if err := os.WriteFile(pythonPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake python: %v", err)
	}
	return pythonPath
}

func writeExecutableFixture(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write executable fixture: %v", err)
	}
	return path
}
