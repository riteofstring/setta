package chat

import (
	"context"
	"testing"
)

func TestCodexHarnessInjectsSessionEnvironment(t *testing.T) {
	config := testCodexConfig("env-context")
	config.Env = append(config.Env,
		"SETTA_BACKEND_ADDR=http://127.0.0.1:41000",
		"SETTA_BACKEND_TOKEN=backend-token",
		"SETTA_APP_DATA_DIR=/tmp/setta-app-data",
	)
	config.SessionEnv = func(envContext CodexSessionEnvContext) []string {
		env := []string{
			"SETTA_WORKSPACE_ID=" + envContext.Workspace.ID,
			"SETTA_WORKSPACE_ROOT=" + envContext.Workspace.RootPath,
			"SETTA_CONVERSATION_ID=" + envContext.Conversation.ID,
		}
		if envContext.Run != nil {
			env = append(env, "SETTA_RUN_ID="+envContext.Run.ID)
		}
		return env
	}
	harness := NewCodexHarness(config)
	request := testTurnRequest(t)
	request.Workspace.RootPath = "/tmp/setta-env-workspace"
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), request, sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
}
