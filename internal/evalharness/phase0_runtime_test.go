package evalharness

import (
	"encoding/json"
	"reflect"
	"testing"

	"setta/internal/agent"
	"setta/internal/codexapp"
)

func TestPhase0ShellEnvironmentPolicyConfigOwnsEvidenceNames(t *testing.T) {
	t.Parallel()

	wantConfig := []string{
		`shell_environment_policy.inherit="none"`,
		`shell_environment_policy.set={ HOME = "/tmp", LANG = "C.UTF-8", PATH = "/usr/local/bin:/bin", SHELL = "/bin/zsh" }`,
	}
	if got := phase0ShellEnvironmentPolicyConfig(); !reflect.DeepEqual(got, wantConfig) {
		t.Fatalf("phase0ShellEnvironmentPolicyConfig() = %#v, want %#v", got, wantConfig)
	}
	wantNames := []string{"HOME", "LANG", "PATH", "SHELL"}
	if got := phase0ShellEnvironmentSetNames(); !reflect.DeepEqual(got, wantNames) {
		t.Fatalf("phase0ShellEnvironmentSetNames() = %#v, want %#v", got, wantNames)
	}
}

func TestPhase0WorkspaceWriteOutputSchemaPinsExactToken(t *testing.T) {
	t.Parallel()

	const fixtureToken = "SETTA_PHASE0_0123456789abcdef0123456789abcdef"
	raw, err := phase0WorkspaceWriteOutputSchema(fixtureToken)
	if err != nil {
		t.Fatalf("phase0WorkspaceWriteOutputSchema() error = %v", err)
	}
	var schema struct {
		Properties struct {
			FixtureToken struct {
				Enum []string `json:"enum"`
			} `json:"fixtureToken"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatalf("decode workspace-write schema: %v", err)
	}
	if !reflect.DeepEqual(schema.Properties.FixtureToken.Enum, []string{fixtureToken}) {
		t.Fatalf("workspace-write fixture enum = %#v", schema.Properties.FixtureToken.Enum)
	}
}

func TestPhase0ReadOnlyOutputSchemaRejectsPlaceholderTokens(t *testing.T) {
	t.Parallel()

	want := `{"type":"object","properties":{"fixtureToken":{"type":"string","description":"Exact contents read from /workspace/probe-input.txt; never invent this value.","pattern":"^SETTA_PHASE0_[0-9a-f]{32}$"}},"required":["fixtureToken"],"additionalProperties":false}`
	if phase0ReadOnlyOutputSchema != want {
		t.Fatalf("phase0ReadOnlyOutputSchema = %s, want %s", phase0ReadOnlyOutputSchema, want)
	}
}

func TestPhase0AttemptPromptMarksOnlyTheBoundedRepair(t *testing.T) {
	t.Parallel()

	const prompt = "Run the exact fixture command."
	if got := phase0AttemptPrompt(1, prompt); got != prompt {
		t.Fatalf("phase0AttemptPrompt(1) = %q, want %q", got, prompt)
	}
	want := "The previous attempt completed without satisfying the exact task. This is the final attempt. " + prompt
	if got := phase0AttemptPrompt(phase0MaximumTurnAttempts, prompt); got != want {
		t.Fatalf("phase0AttemptPrompt(max) = %q, want %q", got, want)
	}
}

func TestValidatePhase0EnvironmentInfo(t *testing.T) {
	t.Parallel()

	valid, err := codexapp.DecodeEnvironmentInfoResponse([]byte(
		`{"cwd":"file:///workspace","shell":{"name":"zsh","path":"/bin/zsh"}}`,
	))
	if err != nil {
		t.Fatalf("DecodeEnvironmentInfoResponse() error = %v", err)
	}
	if err := validatePhase0EnvironmentInfo(valid); err != nil {
		t.Fatalf("validatePhase0EnvironmentInfo() error = %v", err)
	}

	wrongShell := valid
	wrongShell.Shell.Path = "/bin/sh"
	if err := validatePhase0EnvironmentInfo(wrongShell); err == nil {
		t.Fatal("validatePhase0EnvironmentInfo() accepted the wrong shell")
	}
	wrongWorkspace := valid
	other := codexapp.PathUri("file:///tmp")
	wrongWorkspace.CWD = &other
	if err := validatePhase0EnvironmentInfo(wrongWorkspace); err == nil {
		t.Fatal("validatePhase0EnvironmentInfo() accepted the wrong workspace")
	}
}

func TestPhase0InvocationUsesReleaseAgentBaseline(t *testing.T) {
	t.Parallel()

	invocation := phase0Invocation(agent.PermissionModeReadOnly, phase0DefaultModel)
	if invocation.Model != "gpt-5.6-sol" || invocation.ReasoningEffort != "high" {
		t.Fatalf("phase0Invocation() = %#v, want release Agent baseline", invocation)
	}
}

func TestPhase0ReadOnlyOutputRequiresExactFixtureToken(t *testing.T) {
	t.Parallel()

	if err := validatePhase0ReadOnlyOutput(`{"fixtureToken":"expected"}`, "expected"); err != nil {
		t.Fatalf("validate exact output: %v", err)
	}
	invalid := []string{
		`{"fixtureToken":"different"}`,
		`{"fixtureToken":"expected","commentary":"done"}`,
		"expected",
	}
	for _, value := range invalid {
		if err := validatePhase0ReadOnlyOutput(value, "expected"); err == nil {
			t.Fatalf("invalid read-only output was accepted: %s", value)
		}
	}
}
