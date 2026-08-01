package evalharness

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestPhase0ToolEnvironmentFromRemoteTurn(t *testing.T) {
	t.Parallel()

	want := phase0HelperEnvironment{
		UID:              phase0ContainerUID,
		GID:              phase0ContainerGID,
		EnvironmentNames: []string{"CODEX_PERMISSION_PROFILE", "CODEX_THREAD_ID", "HOME", "PATH"},
	}
	thread := phase0RemoteEnvironmentThread(
		phase0EnvironmentHelperCommand,
		`{"uid":65532,"gid":65532,"environmentNames":["CODEX_PERMISSION_PROFILE","CODEX_THREAD_ID","HOME","PATH"]}`,
	)

	got, err := phase0ToolEnvironmentFromThread(thread, "turn-1")
	if err != nil {
		t.Fatalf("phase0ToolEnvironmentFromThread() error = %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("phase0ToolEnvironmentFromThread() = %#v, want %#v", got, want)
	}
}

func TestPhase0ToolEnvironmentRejectsUnboundEvidence(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		thread     codexapp.Thread
		wantDetail string
	}{
		{
			name:       "different command",
			thread:     phase0RemoteEnvironmentThread("env", `{"uid":65532,"gid":65532,"environmentNames":["HOME"]}`),
			wantDetail: "exact environment helper",
		},
		{
			name:       "credential environment",
			thread:     phase0RemoteEnvironmentThread(phase0EnvironmentHelperCommand, `{"uid":65532,"gid":65532,"environmentNames":["OPENAI_API_KEY"]}`),
			wantDetail: "non-allowlisted variable",
		},
		{
			name:       "host identity",
			thread:     phase0RemoteEnvironmentThread(phase0EnvironmentHelperCommand, `{"uid":501,"gid":20,"environmentNames":["HOME"]}`),
			wantDetail: "remote tool ran as",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := phase0ToolEnvironmentFromThread(test.thread, "turn-1")
			if err == nil || !strings.Contains(err.Error(), test.wantDetail) {
				t.Fatalf("phase0ToolEnvironmentFromThread() error = %v, want detail %q", err, test.wantDetail)
			}
		})
	}
}

func phase0RemoteEnvironmentThread(command string, output string) codexapp.Thread {
	exitCode := 0
	source := codexapp.CommandExecutionSourceAgent
	action, err := json.Marshal(phase0UnknownCommandAction{
		Command: command,
		Type:    phase0UnknownCommandActionType,
	})
	if err != nil {
		panic(err)
	}
	return codexapp.Thread{
		Turns: []codexapp.Turn{
			{
				ID:     "turn-1",
				Status: codexapp.TurnStatusCompleted,
				Items: []codexapp.ThreadItem{
					{
						Type: codexapp.ThreadItemTypeCommandExecution,
						CommandExecution: &codexapp.CommandExecutionThreadItem{
							AggregatedOutput: &output,
							Command:          "/bin/zsh -lc '" + command + "'",
							CommandActions:   []json.RawMessage{action},
							CWD:              codexapp.LegacyAppPathString(phase0WorkspaceRoot),
							ExitCode:         &exitCode,
							Source:           &source,
							Status:           codexapp.CommandExecutionStatusCompleted,
						},
					},
				},
			},
		},
	}
}
