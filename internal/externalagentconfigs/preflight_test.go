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

func TestSystemCheckerClassifiesNonClaudeToolRunModeSupportAndAvailability(t *testing.T) {
	workspaceRoot := t.TempDir()
	nodePath := writeExecutableFixture(t, "node")
	t.Setenv("PATH", filepath.Dir(nodePath))

	validBaseURL := "http://localhost:18181"
	invalidBaseURL := "not-a-url"
	codexPath := writeExecutableFixture(t, "codex")

	testCases := []struct {
		name            string
		config          Config
		wantSupported   bool
		wantAvailable   bool
		wantBaseURL     *string
		wantCommandPath *string
		wantIssues      []string
	}{
		{
			name: "codex app server stays supported and available",
			config: Config{
				ID:                 "codex",
				Name:               "Codex",
				ToolType:           ToolTypeCodex,
				RunMode:            RunModeAppServer,
				CommandPath:        &codexPath,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantSupported:   true,
			wantAvailable:   true,
			wantCommandPath: &codexPath,
		},
		{
			name: "codex rejects unsupported server mode",
			config: Config{
				ID:                 "codex-server",
				Name:               "Codex Server",
				ToolType:           ToolTypeCodex,
				RunMode:            RunModeServer,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantSupported: false,
			wantAvailable: false,
			wantIssues: []string{
				"Run mode server not supported for codex",
				"Server mode requires baseUrl.",
			},
		},
		{
			name: "opencode server stays supported but blocks on invalid base url",
			config: Config{
				ID:                 "opencode-server",
				Name:               "OpenCode Server",
				ToolType:           ToolTypeOpenCode,
				RunMode:            RunModeServer,
				BaseURL:            &invalidBaseURL,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantSupported:   true,
			wantAvailable:   false,
			wantCommandPath: &nodePath,
			wantIssues: []string{
				"Server mode baseUrl must be a valid absolute URL.",
			},
		},
		{
			name: "opencode server stays available with valid base url",
			config: Config{
				ID:                 "opencode-server-valid",
				Name:               "OpenCode Server",
				ToolType:           ToolTypeOpenCode,
				RunMode:            RunModeServer,
				BaseURL:            &validBaseURL,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantSupported:   true,
			wantAvailable:   true,
			wantBaseURL:     &validBaseURL,
			wantCommandPath: &nodePath,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
			if err != nil {
				t.Fatalf("new checker: %v", err)
			}

			// Each row proves one supported/available classification branch on the
			// live non-Claude preflight surface.
			status, err := checker.Check(testCase.config)
			if err != nil {
				t.Fatalf("check config: %v", err)
			}
			if status.Supported != testCase.wantSupported {
				t.Fatalf("expected supported=%t, got %#v", testCase.wantSupported, status)
			}
			if status.Available != testCase.wantAvailable {
				t.Fatalf("expected available=%t, got %#v", testCase.wantAvailable, status)
			}
			if testCase.wantBaseURL == nil {
				if status.BaseURL != nil {
					t.Fatalf("expected no base url, got %#v", status.BaseURL)
				}
			} else if status.BaseURL == nil || *status.BaseURL != *testCase.wantBaseURL {
				t.Fatalf("expected base url %q, got %#v", *testCase.wantBaseURL, status.BaseURL)
			}
			if testCase.wantCommandPath == nil {
				if status.CommandPath != nil {
					t.Fatalf("expected no command path, got %#v", status.CommandPath)
				}
			} else if status.CommandPath == nil || *status.CommandPath != *testCase.wantCommandPath {
				t.Fatalf("expected command path %q, got %#v", *testCase.wantCommandPath, status.CommandPath)
			}
			for _, issueFragment := range testCase.wantIssues {
				if !containsIssue(status.Issues, issueFragment) {
					t.Fatalf("expected issue %q, got %#v", issueFragment, status.Issues)
				}
			}
		})
	}
}

func TestSystemCheckerUsesNodeForNodeBackedModesAndReportsMissingNode(t *testing.T) {
	workspaceRoot := t.TempDir()
	resolvedNodePath := writeExecutableFixture(t, "node")
	nodeDir := filepath.Dir(resolvedNodePath)
	emptyBinDir := t.TempDir()
	validBaseURL := "http://localhost:18181"

	testCases := []struct {
		name            string
		pathEnv         string
		config          Config
		wantAvailable   bool
		wantCommandPath *string
		wantIssues      []string
	}{
		{
			name:    "sdk mode resolves node path when node is present",
			pathEnv: nodeDir,
			config: Config{
				ID:                 "opencode-sdk",
				Name:               "OpenCode SDK",
				ToolType:           ToolTypeOpenCode,
				RunMode:            RunModeSDK,
				BaseURL:            &validBaseURL,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantAvailable:   true,
			wantCommandPath: &resolvedNodePath,
		},
		{
			name:    "server mode resolves node path when node is present",
			pathEnv: nodeDir,
			config: Config{
				ID:                 "opencode-server",
				Name:               "OpenCode Server",
				ToolType:           ToolTypeOpenCode,
				RunMode:            RunModeServer,
				BaseURL:            &validBaseURL,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantAvailable:   true,
			wantCommandPath: &resolvedNodePath,
		},
		{
			name:    "server mode fails closed when node is missing",
			pathEnv: emptyBinDir,
			config: Config{
				ID:                 "opencode-server-missing-node",
				Name:               "OpenCode Server",
				ToolType:           ToolTypeOpenCode,
				RunMode:            RunModeServer,
				BaseURL:            &validBaseURL,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			},
			wantAvailable: false,
			wantIssues: []string{
				"Command not found (node)",
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv("PATH", testCase.pathEnv)

			checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
			if err != nil {
				t.Fatalf("new checker: %v", err)
			}

			// Node-backed SDK/server modes should expose the resolved node path
			// directly and block availability when that prerequisite is missing.
			status, err := checker.Check(testCase.config)
			if err != nil {
				t.Fatalf("check config: %v", err)
			}
			if !status.Supported {
				t.Fatalf("expected node-backed mode to stay supported, got %#v", status)
			}
			if status.Available != testCase.wantAvailable {
				t.Fatalf("expected available=%t, got %#v", testCase.wantAvailable, status)
			}
			if testCase.wantCommandPath == nil {
				if status.CommandPath != nil {
					t.Fatalf("expected no command path, got %#v", status.CommandPath)
				}
			} else if status.CommandPath == nil || *status.CommandPath != *testCase.wantCommandPath {
				t.Fatalf("expected command path %q, got %#v", *testCase.wantCommandPath, status.CommandPath)
			}
			for _, issueFragment := range testCase.wantIssues {
				if !containsIssue(status.Issues, issueFragment) {
					t.Fatalf("expected issue %q, got %#v", issueFragment, status.Issues)
				}
			}
		})
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
