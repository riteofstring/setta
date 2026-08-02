package evalharness

import (
	"encoding/json"
	"reflect"
	"strings"
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

	model, reasoningEffort, err := phase0ReleaseAgentBaseline()
	if err != nil {
		t.Fatalf("phase0ReleaseAgentBaseline() error = %v", err)
	}
	invocation := phase0Invocation(agent.PermissionModeReadOnly, model, reasoningEffort)
	if invocation.Model != model || invocation.ReasoningEffort != reasoningEffort {
		t.Fatalf("phase0Invocation() = %#v, want release Agent baseline", invocation)
	}
}

func TestPhase0OnlyExpectedOutputAddedIncludesDirectoryAndModeEvidence(t *testing.T) {
	t.Parallel()

	baseline := phase0HelperWorkspace{Entries: []phase0HelperWorkspaceEntry{
		{Path: ".", Kind: "directory", Mode: 0o755},
		{Path: "probe-input.txt", Kind: "file", Mode: 0o600, Bytes: 46, SHA256: "input"},
	}}
	output := phase0HelperFile{
		Path:   "/workspace/probe-output.txt",
		Mode:   0o640,
		Bytes:  46,
		SHA256: "output",
	}
	after := phase0HelperWorkspace{Entries: []phase0HelperWorkspaceEntry{
		{Path: ".", Kind: "directory", Mode: 0o755},
		{Path: "probe-input.txt", Kind: "file", Mode: 0o600, Bytes: 46, SHA256: "input"},
		{Path: "probe-output.txt", Kind: "file", Mode: 0o640, Bytes: 46, SHA256: "output"},
	}}
	if !phase0OnlyExpectedOutputAdded(baseline, after, output) {
		t.Fatal("exact output addition was rejected")
	}

	extraDirectory := phase0HelperWorkspace{Entries: append(
		append([]phase0HelperWorkspaceEntry{}, after.Entries...),
		phase0HelperWorkspaceEntry{Path: "unexpected", Kind: "directory", Mode: 0o755},
	)}
	if phase0OnlyExpectedOutputAdded(baseline, extraDirectory, output) {
		t.Fatal("unexpected empty directory was accepted")
	}

	modeChanged := phase0HelperWorkspace{Entries: append([]phase0HelperWorkspaceEntry{}, after.Entries...)}
	modeChanged.Entries[1].Mode = 0o644
	if phase0OnlyExpectedOutputAdded(baseline, modeChanged, output) {
		t.Fatal("baseline file mode change was accepted")
	}
}

func TestValidatePhase0HelperWorkspaceRequiresCompleteEntryEvidence(t *testing.T) {
	t.Parallel()

	valid := phase0HelperWorkspace{Entries: []phase0HelperWorkspaceEntry{
		{Path: ".", Kind: "directory", Mode: 0o755},
		{
			Path:   "probe-input.txt",
			Kind:   "file",
			Mode:   0o600,
			Bytes:  46,
			SHA256: strings.Repeat("a", 64),
		},
	}}
	if err := validatePhase0HelperWorkspace(valid); err != nil {
		t.Fatalf("validatePhase0HelperWorkspace() error = %v", err)
	}
	missingRoot := valid
	missingRoot.Entries = missingRoot.Entries[1:]
	if err := validatePhase0HelperWorkspace(missingRoot); err == nil {
		t.Fatal("workspace without root entry was accepted")
	}
	invalidDirectory := valid
	invalidDirectory.Entries = append([]phase0HelperWorkspaceEntry{}, valid.Entries...)
	invalidDirectory.Entries[0].SHA256 = strings.Repeat("b", 64)
	if err := validatePhase0HelperWorkspace(invalidDirectory); err == nil {
		t.Fatal("directory with file evidence was accepted")
	}
}

func TestPhase0EventSinkRejectsExternalActivityKinds(t *testing.T) {
	t.Parallel()

	allowed := map[agent.ActivityKind]bool{
		agent.ActivityKindCommand:    true,
		agent.ActivityKindFileChange: true,
		agent.ActivityKindImageView:  true,
	}
	for _, kind := range agent.ActivityKinds() {
		if got := phase0AllowsActivity(kind); got != allowed[kind] {
			t.Fatalf("phase0AllowsActivity(%q) = %t, want %t", kind, got, allowed[kind])
		}
	}

	sink := &phase0EventSink{}
	if err := sink.HandleAgentEvent(agent.Event{
		Activity: &agent.ActivityEvent{Kind: agent.ActivityKindMCPTool},
	}); err == nil {
		t.Fatal("MCP activity was accepted")
	}
	if err := sink.HandleAgentEvent(agent.Event{
		Activity: &agent.ActivityEvent{Kind: agent.ActivityKindOther},
	}); err == nil {
		t.Fatal("untyped provider activity was accepted")
	}
	workspace := "/workspace"
	if err := sink.HandleAgentEvent(agent.Event{
		Activity: &agent.ActivityEvent{Kind: agent.ActivityKindCommand, CWD: &workspace},
	}); err != nil {
		t.Fatalf("workspace command was rejected: %v", err)
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
