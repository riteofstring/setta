package chat

import (
	"context"
	"testing"
)

func TestCodexHarnessStartsThreadWithDynamicTools(t *testing.T) {
	registry, err := NewAgentToolRegistry(
		testCodexAgentTool("workspace_context", false),
		testCodexAgentTool("workspace_archive", true),
	)
	if err != nil {
		t.Fatalf("tool registry: %v", err)
	}
	config := testCodexConfig("dynamic-tools-thread-start")
	config.Tools = registry
	harness := NewCodexHarness(config)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
}

func TestCodexHarnessDoesNotSendDynamicToolsOnResume(t *testing.T) {
	registry, err := NewAgentToolRegistry(testCodexAgentTool("workspace_context", false))
	if err != nil {
		t.Fatalf("tool registry: %v", err)
	}
	config := testCodexConfig("dynamic-tools-thread-resume")
	config.Tools = registry
	harness := NewCodexHarness(config)
	request := testTurnRequest(t)
	request.ThreadRef = HarnessThreadRef{
		Harness:  HarnessCodex,
		ThreadID: "thread_fake",
		Status:   HarnessRefLinked,
	}
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), request, sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
}
