package externalagentconfigs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
