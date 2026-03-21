package externalagents

import (
	"os"
	"strings"
	"testing"

	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
)

func TestBuildRuntimeEnvUsesManagedAPIKeysForWhitelistedVars(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	envPath := llmconfig.ManagedAPIKeysPath(workspaceRoot)
	content := strings.Join([]string{
		"PLAIN_KEY=plain-dot-env-value",
		`SETTA_MANAGED_LLM_API_KEY_NAMES=["MANAGED_KEY","WHITESPACE_KEY"]`,
		"MANAGED_KEY=managed-secret",
		"WHITESPACE_KEY=managed-fallback",
		"",
	}, "\n")
	if err := os.WriteFile(envPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write managed env payload: %v", err)
	}

	processEnv := map[string]string{
		"PATH":           "/usr/bin",
		"HOME":           "/tmp/home",
		"PROCESS_KEY":    "process-secret",
		"WHITESPACE_KEY": "   ",
	}
	config := externalagentconfigs.Config{
		EnvVarWhitelist: []string{"PROCESS_KEY", "MANAGED_KEY", "WHITESPACE_KEY", "PLAIN_KEY", "MISSING_KEY"},
	}

	tests := []struct {
		name string
		env  map[string]string
	}{
		{
			name: "codex",
			env: (&CodexExecutor{
				workspaceRoot: workspaceRoot,
				processEnv:    processEnv,
			}).buildRuntimeEnv(config),
		},
		{
			name: "claude",
			env: (&ClaudeExecutor{
				workspaceRoot: workspaceRoot,
				processEnv:    processEnv,
			}).buildRuntimeEnv(config),
		},
		{
			name: "opencode",
			env: (&OpenCodeExecutor{
				workspaceRoot: workspaceRoot,
				processEnv:    processEnv,
			}).buildRuntimeEnv(config),
		},
	}

	for _, test := range tests {
		if got := test.env["PATH"]; got != "/usr/bin" {
			t.Fatalf("%s: expected PATH passthrough, got %#v", test.name, test.env)
		}
		if got := test.env["HOME"]; got != "/tmp/home" {
			t.Fatalf("%s: expected HOME passthrough, got %#v", test.name, test.env)
		}
		if got := test.env["PROCESS_KEY"]; got != "process-secret" {
			t.Fatalf("%s: expected process env var, got %#v", test.name, test.env)
		}
		if got := test.env["MANAGED_KEY"]; got != "managed-secret" {
			t.Fatalf("%s: expected managed env var, got %#v", test.name, test.env)
		}
		if got := test.env["WHITESPACE_KEY"]; got != "managed-fallback" {
			t.Fatalf("%s: expected managed fallback for whitespace process env, got %#v", test.name, test.env)
		}
		if _, ok := test.env["PLAIN_KEY"]; ok {
			t.Fatalf("%s: expected plain dot-env key to stay excluded, got %#v", test.name, test.env)
		}
		if _, ok := test.env["MISSING_KEY"]; ok {
			t.Fatalf("%s: expected missing key to stay excluded, got %#v", test.name, test.env)
		}
	}
}

func TestOpenCodeBuildRuntimeEnvDoesNotSynthesizeLegacyDebugCompanionVar(t *testing.T) {
	t.Parallel()

	env := (&OpenCodeExecutor{
		workspaceRoot: t.TempDir(),
		processEnv: map[string]string{
			"PATH":                 "/usr/bin",
			"HOME":                 "/tmp/home",
			"SETTA_OPENCODE_DEBUG": "1",
		},
	}).buildRuntimeEnv(externalagentconfigs.Config{
		EnvVarWhitelist: []string{"SETTA_OPENCODE_DEBUG"},
	})

	if got := env["SETTA_OPENCODE_DEBUG"]; got != "1" {
		t.Fatalf("expected explicit debug env passthrough, got %#v", env)
	}
	if _, ok := env["SETTA_OPENCODE_DEBUG_RAW"]; ok {
		t.Fatalf("expected no synthesized debug companion env, got %#v", env)
	}
}
