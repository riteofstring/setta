package evalharness

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestPhase0ToolEnvironmentFromCompletedItem(t *testing.T) {
	t.Parallel()

	want := phase0HelperEnvironment{
		UID:              phase0ContainerUID,
		GID:              phase0ContainerGID,
		EnvironmentNames: []string{"CODEX_PERMISSION_PROFILE", "CODEX_THREAD_ID", "HOME", "PATH"},
	}
	command := phase0RemoteEnvironmentCommandItem(
		phase0EnvironmentHelperCommand,
		`{"uid":65532,"gid":65532,"environmentNames":["CODEX_PERMISSION_PROFILE","CODEX_THREAD_ID","HOME","PATH"]}`,
	)

	got, err := phase0ToolEnvironmentFromCompletedCommands(
		[]codexapp.CommandExecutionThreadItem{command},
	)
	if err != nil {
		t.Fatalf("phase0ToolEnvironmentFromCompletedCommands() error = %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("phase0ToolEnvironmentFromCompletedCommands() = %#v, want %#v", got, want)
	}
}

func TestPhase0CompletedCommandCollectorBindsProviderScope(t *testing.T) {
	t.Parallel()

	collector := &phase0CompletedCommandCollector{}
	collector.handleItemCompleted(phase0CompletedCommandMessage(
		"thread-1",
		"turn-1",
		phase0RemoteEnvironmentCommandItem(
			phase0EnvironmentHelperCommand,
			`{"uid":65532,"gid":65532,"environmentNames":["HOME","PATH"]}`,
		),
	))
	collector.handleItemCompleted(phase0CompletedCommandMessage(
		"thread-1",
		"turn-1",
		phase0RemoteEnvironmentCommandItem("env", "unrelated"),
	))

	commands, err := collector.forProviderTurn("thread-1", "turn-1")
	if err != nil {
		t.Fatalf("forProviderTurn() error = %v", err)
	}
	if len(commands) != 2 {
		t.Fatalf("forProviderTurn() returned %d commands, want 2", len(commands))
	}
	if _, err := phase0ToolEnvironmentFromCompletedCommands(commands); err != nil {
		t.Fatalf("decode scoped helper command: %v", err)
	}
	unbound, err := collector.forProviderTurn("thread-1", "turn-2")
	if err != nil {
		t.Fatalf("forProviderTurn() wrong scope error = %v", err)
	}
	if len(unbound) != 0 {
		t.Fatalf("forProviderTurn() wrong scope returned %d commands, want 0", len(unbound))
	}
}

func TestPhase0ToolEnvironmentRejectsUnboundEvidence(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		command    codexapp.CommandExecutionThreadItem
		wantDetail string
	}{
		{
			name:       "different command",
			command:    phase0RemoteEnvironmentCommandItem("env", `{"uid":65532,"gid":65532,"environmentNames":["HOME"]}`),
			wantDetail: "exact environment helper",
		},
		{
			name:       "credential environment",
			command:    phase0RemoteEnvironmentCommandItem(phase0EnvironmentHelperCommand, `{"uid":65532,"gid":65532,"environmentNames":["OPENAI_API_KEY"]}`),
			wantDetail: "non-allowlisted variable",
		},
		{
			name:       "host identity",
			command:    phase0RemoteEnvironmentCommandItem(phase0EnvironmentHelperCommand, `{"uid":501,"gid":20,"environmentNames":["HOME"]}`),
			wantDetail: "remote tool ran as",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := phase0ToolEnvironmentFromCompletedCommands(
				[]codexapp.CommandExecutionThreadItem{test.command},
			)
			if err == nil || !strings.Contains(err.Error(), test.wantDetail) {
				t.Fatalf("phase0ToolEnvironmentFromCompletedCommands() error = %v, want detail %q", err, test.wantDetail)
			}
		})
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

func phase0RemoteEnvironmentCommandItem(command string, output string) codexapp.CommandExecutionThreadItem {
	exitCode := 0
	source := codexapp.CommandExecutionSourceAgent
	action, err := json.Marshal(phase0UnknownCommandAction{
		Command: command,
		Type:    phase0UnknownCommandActionType,
	})
	if err != nil {
		panic(err)
	}
	return codexapp.CommandExecutionThreadItem{
		AggregatedOutput: &output,
		Command:          "/bin/zsh -lc '" + command + "'",
		CommandActions:   []json.RawMessage{action},
		CWD:              codexapp.LegacyAppPathString(phase0WorkspaceRoot),
		ExitCode:         &exitCode,
		ID:               "command-1",
		Source:           &source,
		Status:           codexapp.CommandExecutionStatusCompleted,
		Type:             codexapp.ThreadItemTypeCommandExecution,
	}
}

func phase0CompletedCommandMessage(
	threadID string,
	turnID string,
	command codexapp.CommandExecutionThreadItem,
) codexapp.Message {
	params, err := json.Marshal(codexapp.ItemCompletedNotification{
		CompletedAtMs: 1,
		Item: codexapp.ThreadItem{
			Type:             codexapp.ThreadItemTypeCommandExecution,
			CommandExecution: &command,
		},
		ThreadID: threadID,
		TurnID:   turnID,
	})
	if err != nil {
		panic(err)
	}
	return codexapp.Message{Params: params}
}
