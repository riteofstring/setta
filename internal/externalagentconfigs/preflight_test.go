package externalagentconfigs

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

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
	writeVersionedExecutableFixture(t, binDir, "claude", "claude-cli 1.2.3")
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
	if status.SDKVersion == nil || *status.SDKVersion != "1.2.3" {
		t.Fatalf("expected claude sdk version 1.2.3, got %#v", status.SDKVersion)
	}
}

func TestSystemCheckerClassifiesNonClaudeToolRunModeSupportAndAvailability(t *testing.T) {
	workspaceRoot := t.TempDir()
	t.Setenv("PATH", t.TempDir())
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
			if testCase.wantCommandPath != nil && strings.HasSuffix(*testCase.wantCommandPath, "codex") {
				if status.CLIVersion == nil || *status.CLIVersion != "codex 0.25.1" {
					t.Fatalf("expected codex cli version, got %#v", status.CLIVersion)
				}
			}
			for _, issueFragment := range testCase.wantIssues {
				if !containsIssue(status.Issues, issueFragment) {
					t.Fatalf("expected issue %q, got %#v", issueFragment, status.Issues)
				}
			}
		})
	}
}

func TestSystemCheckerReportsMissingCodexCLI(t *testing.T) {
	workspaceRoot := t.TempDir()
	t.Setenv("PATH", t.TempDir())

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:                 "codex",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("check codex config: %v", err)
	}
	if status.Available {
		t.Fatalf("expected missing codex cli to block availability, got %#v", status)
	}
	if !containsIssue(status.Issues, "codex CLI not found (codex)") {
		t.Fatalf("expected missing codex cli issue, got %#v", status.Issues)
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

func TestSystemCheckerMarksUnavailableWhenManagedStoreCorruptAndEnvVarsMissing(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	commandPath := writeExecutableFixture(t, "codex")
	envPath := llmconfig.ManagedAPIKeysPath(workspaceRoot)
	if err := os.WriteFile(envPath, []byte("SETTA_MANAGED_LLM_API_KEY_NAMES=not-json\n"), 0o600); err != nil {
		t.Fatalf("write corrupt managed api keys store: %v", err)
	}

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:              "codex",
		Name:            "Codex",
		ToolType:        ToolTypeCodex,
		RunMode:         RunModeAppServer,
		CommandPath:     &commandPath,
		EnvVarWhitelist: []string{"MISSING_KEY"},
	})
	if err != nil {
		t.Fatalf("check codex config: %v", err)
	}
	if status.Available {
		t.Fatalf("expected corrupt managed store with missing env vars to block preflight, got %#v", status)
	}
	if len(status.EnvVars.Present) != 0 {
		t.Fatalf("expected no present env vars, got %#v", status.EnvVars)
	}
	if got := strings.Join(status.EnvVars.Missing, ","); got != "MISSING_KEY" {
		t.Fatalf("expected missing env var, got %#v", status.EnvVars)
	}
	if !containsIssue(status.Issues, managedAPIKeysCorruptIssue) {
		t.Fatalf("expected corrupt managed api key issue, got %#v", status.Issues)
	}
	if !containsIssue(status.Issues, "Missing env vars: MISSING_KEY") {
		t.Fatalf("expected missing env var issue, got %#v", status.Issues)
	}
}

func TestSystemCheckerKeepsManagedStoreUnavailableNonBlockingWhenProcessEnvSatisfiesWhitelist(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	commandPath := writeExecutableFixture(t, "codex")
	envPath := llmconfig.ManagedAPIKeysPath(workspaceRoot)
	if err := os.MkdirAll(filepath.Dir(envPath), 0o755); err != nil {
		t.Fatalf("mkdir managed api keys parent: %v", err)
	}
	if err := os.Mkdir(envPath, 0o755); err != nil {
		t.Fatalf("create directory at managed api keys path: %v", err)
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
		t.Fatalf("expected process env to keep preflight available despite unavailable managed store, got %#v", status)
	}
	if got := strings.Join(status.EnvVars.Present, ","); got != "PRESENT_KEY" {
		t.Fatalf("expected present env var, got %#v", status.EnvVars)
	}
	if len(status.EnvVars.Missing) != 0 {
		t.Fatalf("expected no missing env vars, got %#v", status.EnvVars)
	}
	if !containsIssue(status.Issues, managedAPIKeysUnavailableIssue) {
		t.Fatalf("expected unavailable managed api key issue, got %#v", status.Issues)
	}
}

func TestSystemCheckerMarksUnavailableWhenManagedStoreUnavailableAndEnvVarsMissing(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	commandPath := writeExecutableFixture(t, "codex")
	envPath := llmconfig.ManagedAPIKeysPath(workspaceRoot)
	if err := os.MkdirAll(filepath.Dir(envPath), 0o755); err != nil {
		t.Fatalf("mkdir managed api keys parent: %v", err)
	}
	if err := os.Mkdir(envPath, 0o755); err != nil {
		t.Fatalf("create directory at managed api keys path: %v", err)
	}

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:              "codex",
		Name:            "Codex",
		ToolType:        ToolTypeCodex,
		RunMode:         RunModeAppServer,
		CommandPath:     &commandPath,
		EnvVarWhitelist: []string{"MISSING_KEY"},
	})
	if err != nil {
		t.Fatalf("check codex config: %v", err)
	}
	if status.Available {
		t.Fatalf("expected unavailable managed store with missing env vars to block preflight, got %#v", status)
	}
	if len(status.EnvVars.Present) != 0 {
		t.Fatalf("expected no present env vars, got %#v", status.EnvVars)
	}
	if got := strings.Join(status.EnvVars.Missing, ","); got != "MISSING_KEY" {
		t.Fatalf("expected missing env var, got %#v", status.EnvVars)
	}
	if !containsIssue(status.Issues, managedAPIKeysUnavailableIssue) {
		t.Fatalf("expected unavailable managed api key issue, got %#v", status.Issues)
	}
	if !containsIssue(status.Issues, "Missing env vars: MISSING_KEY") {
		t.Fatalf("expected missing env var issue, got %#v", status.Issues)
	}
}

func TestSystemCheckerCachesStableCodexPreflightResults(t *testing.T) {
	workspaceRoot := t.TempDir()
	counterPath := filepath.Join(t.TempDir(), "codex-version-count.txt")
	commandPath := writeCountingVersionedExecutableFixture(
		t,
		t.TempDir(),
		"codex",
		"codex 0.25.1",
		counterPath,
	)
	now := time.Date(2026, time.March, 27, 18, 0, 0, 0, time.UTC)
	checker, err := NewSystemChecker(SystemCheckerOptions{
		WorkspaceRoot: workspaceRoot,
		Now: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}

	config := Config{
		ID:                 "codex",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		CommandPath:        &commandPath,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	}

	// Repeated checks with unchanged inputs should reuse the cached preflight
	// result instead of re-running the codex CLI version probe.
	firstStatus, err := checker.Check(config)
	if err != nil {
		t.Fatalf("first check: %v", err)
	}
	secondStatus, err := checker.Check(config)
	if err != nil {
		t.Fatalf("second check: %v", err)
	}
	if !firstStatus.Available || !secondStatus.Available {
		t.Fatalf("expected cached codex preflight to stay available, got %#v and %#v", firstStatus, secondStatus)
	}
	if got := readInvocationCount(t, counterPath); got != 1 {
		t.Fatalf("expected one codex version probe, got %d", got)
	}
}

func TestSystemCheckerExpiresCachedPreflightResultsAfterTTL(t *testing.T) {
	workspaceRoot := t.TempDir()
	counterPath := filepath.Join(t.TempDir(), "codex-version-count.txt")
	commandPath := writeCountingVersionedExecutableFixture(
		t,
		t.TempDir(),
		"codex",
		"codex 0.25.1",
		counterPath,
	)
	now := time.Date(2026, time.March, 27, 18, 30, 0, 0, time.UTC)
	checker, err := NewSystemChecker(SystemCheckerOptions{
		WorkspaceRoot: workspaceRoot,
		Now: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}

	config := Config{
		ID:                 "codex",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		CommandPath:        &commandPath,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	}

	if _, err := checker.Check(config); err != nil {
		t.Fatalf("first check: %v", err)
	}
	now = now.Add(preflightCacheTTL - time.Second)
	if _, err := checker.Check(config); err != nil {
		t.Fatalf("second check before ttl expiry: %v", err)
	}
	if got := readInvocationCount(t, counterPath); got != 1 {
		t.Fatalf("expected cached preflight before ttl expiry, got %d probes", got)
	}

	now = now.Add(2 * time.Second)
	if _, err := checker.Check(config); err != nil {
		t.Fatalf("third check after ttl expiry: %v", err)
	}
	if got := readInvocationCount(t, counterPath); got != 2 {
		t.Fatalf("expected ttl expiry to trigger a second probe, got %d", got)
	}
}

func TestSystemCheckerInvalidatesCacheWhenWhitelistedEnvStatusChanges(t *testing.T) {
	workspaceRoot := t.TempDir()
	counterPath := filepath.Join(t.TempDir(), "codex-version-count.txt")
	commandPath := writeCountingVersionedExecutableFixture(
		t,
		t.TempDir(),
		"codex",
		"codex 0.25.1",
		counterPath,
	)
	now := time.Date(2026, time.March, 27, 19, 0, 0, 0, time.UTC)
	checker, err := NewSystemChecker(SystemCheckerOptions{
		WorkspaceRoot: workspaceRoot,
		Now: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}

	config := Config{
		ID:                 "codex",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		CommandPath:        &commandPath,
		EnvVarWhitelist:    []string{"OPENAI_API_KEY"},
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	}

	// The cache key must include resolved env-var availability so a newly added
	// workspace .env key invalidates the stale unavailable result immediately.
	initialStatus, err := checker.Check(config)
	if err != nil {
		t.Fatalf("initial check: %v", err)
	}
	if initialStatus.Available {
		t.Fatalf("expected initial status to be unavailable, got %#v", initialStatus)
	}
	if !containsIssue(initialStatus.Issues, "Missing env vars: OPENAI_API_KEY") {
		t.Fatalf("expected missing env var issue, got %#v", initialStatus.Issues)
	}
	if got := readInvocationCount(t, counterPath); got != 1 {
		t.Fatalf("expected one probe after initial missing-env check, got %d", got)
	}

	if err := os.WriteFile(
		filepath.Join(workspaceRoot, ".env"),
		[]byte("OPENAI_API_KEY=test-key\n"),
		0o600,
	); err != nil {
		t.Fatalf("write workspace env: %v", err)
	}

	updatedStatus, err := checker.Check(config)
	if err != nil {
		t.Fatalf("updated check: %v", err)
	}
	if !updatedStatus.Available {
		t.Fatalf("expected updated status to become available, got %#v", updatedStatus)
	}
	if got := readInvocationCount(t, counterPath); got != 2 {
		t.Fatalf("expected env fingerprint change to re-run the probe, got %d", got)
	}
}

func TestRunCLITimeoutReturnsIssue(t *testing.T) {
	if os.PathSeparator == '\\' {
		t.Skip("shell script fixtures are not supported on Windows")
	}

	commandPath := filepath.Join(t.TempDir(), "slow-command.sh")
	script := "#!/bin/sh\nsleep 1\n"
	if err := os.WriteFile(commandPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write slow command fixture: %v", err)
	}

	result, issue := runCLI([]string{commandPath}, "", 10*time.Millisecond)

	if result != nil {
		t.Fatalf("expected no cli result on timeout, got %#v", result)
	}
	if issue == "" || !strings.Contains(issue, "Timed out running "+commandPath) {
		t.Fatalf("expected timeout issue, got %q", issue)
	}
}

func TestRunCLINonExecutableReturnsIssue(t *testing.T) {
	if os.PathSeparator == '\\' {
		t.Skip("permission semantics differ on Windows")
	}

	commandPath := filepath.Join(t.TempDir(), "non-executable-command")
	if err := os.WriteFile(commandPath, []byte("#!/bin/sh\necho ok\n"), 0o644); err != nil {
		t.Fatalf("write non-executable command fixture: %v", err)
	}

	result, issue := runCLI([]string{commandPath, "--version"}, "", time.Second)

	if result != nil {
		t.Fatalf("expected no cli result for non-executable command, got %#v", result)
	}
	if issue == "" || !strings.Contains(issue, "Failed to run "+commandPath+" --version") {
		t.Fatalf("expected os error issue prefix, got %q", issue)
	}
	if !strings.Contains(strings.ToLower(issue), "permission denied") {
		t.Fatalf("expected permission denied detail, got %q", issue)
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
	script += "if [ \"$1\" = \"-c\" ] && [ \"$2\" = \"import importlib.metadata; print(importlib.metadata.version(\\\"claude-agent-sdk\\\"))\" ]; then\n"
	if succeed {
		script += "  echo \"1.2.3\"\n"
		script += "  exit 0\n"
	} else {
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

	return writeVersionedExecutableFixture(t, t.TempDir(), name, defaultFixtureVersion(name))
}

func writeVersionedExecutableFixture(t *testing.T, dir string, name string, version string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	script := "#!/bin/sh\n"
	script += "if [ \"$1\" = \"--version\" ]; then\n"
	script += "  echo \"" + version + "\"\n"
	script += "  exit 0\n"
	script += "fi\n"
	script += "if [ \"$1\" = \"app-server\" ] && [ \"$2\" = \"--help\" ]; then\n"
	script += "  exit 0\n"
	script += "fi\n"
	script += "exit 0\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write executable fixture: %v", err)
	}
	return path
}

func writeCountingVersionedExecutableFixture(
	t *testing.T,
	dir string,
	name string,
	version string,
	counterPath string,
) string {
	t.Helper()

	path := filepath.Join(dir, name)
	script := fmt.Sprintf(`#!/bin/sh
COUNTER_FILE=%q
count=0
if [ -f "$COUNTER_FILE" ]; then
  count=$(cat "$COUNTER_FILE")
fi
count=$((count + 1))
printf '%%s' "$count" > "$COUNTER_FILE"
if [ "$1" = "--version" ]; then
  echo %q
  exit 0
fi
if [ "$1" = "app-server" ] && [ "$2" = "--help" ]; then
  exit 0
fi
exit 0
`, counterPath, version)
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write counting executable fixture: %v", err)
	}
	return path
}

func readInvocationCount(t *testing.T, counterPath string) int {
	t.Helper()

	content, err := os.ReadFile(counterPath)
	if err != nil {
		t.Fatalf("read invocation counter: %v", err)
	}
	count, err := strconv.Atoi(strings.TrimSpace(string(content)))
	if err != nil {
		t.Fatalf("parse invocation counter: %v", err)
	}
	return count
}

func defaultFixtureVersion(name string) string {
	switch name {
	case "node":
		return "v18.0.0"
	case "codex":
		return "codex 0.25.1"
	case "claude":
		return "claude-cli 1.2.3"
	default:
		return "1.0.0"
	}
}
