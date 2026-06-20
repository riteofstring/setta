package chat

import (
	"context"
	"encoding/json"
	"testing"
)

func TestCodexHarnessRunsSemanticCartographerStructuredTask(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("structured-task"))
	effort := ReasoningEffortHigh
	result, err := harness.RunTask(context.Background(), HarnessTaskRequest{
		Surface:          HarnessSurfaceSemanticCartographer,
		HarnessKind:      HarnessCodex,
		TurnMode:         HarnessTurnStructuredTask,
		OutputContract:   codexStructuredTaskTestOutputContract(),
		CapabilityPolicy: codexStructuredTaskTestCapabilityPolicy(),
		StructuredTask: &HarnessStructuredTask{
			ID:              "cartographer_task_codex_test",
			Workspace:       testTurnRequest(t).Workspace,
			Prompt:          "Return only a strict JSON patch envelope.",
			Input:           json.RawMessage(`{"workspaceId":"workspace_api","sourceRefs":{},"evidence":[]}`),
			Model:           "gpt-test",
			ReasoningEffort: &effort,
		},
	})
	if err != nil {
		t.Fatalf("run structured task: %v", err)
	}
	requireTurnOutcome(t, result.Completion, TurnOutcomeCompleted)
	if string(result.StructuredOutput) != `{"patches":[]}` {
		t.Fatalf("structured output = %s, want empty patch envelope", result.StructuredOutput)
	}
	if result.Audit.HarnessKind != HarnessCodex ||
		result.Audit.Model != "gpt-test" ||
		result.Audit.RequestID != "cartographer_task_codex_test" ||
		result.Audit.ResponseID != "turn_fake" ||
		result.Audit.ThreadRef.ThreadID != "thread_fake" ||
		result.Audit.ThreadRef.LastTurnID != "turn_fake" ||
		result.Audit.ThreadRef.Status != HarnessRefLinked ||
		result.Audit.ReasoningEffort != "" ||
		result.Audit.ReasoningEffortReported {
		t.Fatalf("audit = %+v, want codex structured task metadata", result.Audit)
	}
}

func TestCodexHarnessStructuredTaskOmitsModelForProviderDefault(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("structured-task-provider-default"))
	effort := ReasoningEffortMedium
	result, err := harness.RunTask(context.Background(), HarnessTaskRequest{
		Surface:          HarnessSurfaceSemanticCartographer,
		HarnessKind:      HarnessCodex,
		TurnMode:         HarnessTurnStructuredTask,
		OutputContract:   codexStructuredTaskTestOutputContract(),
		CapabilityPolicy: codexStructuredTaskTestCapabilityPolicy(),
		StructuredTask: &HarnessStructuredTask{
			ID:              "cartographer_task_provider_default",
			Workspace:       testTurnRequest(t).Workspace,
			Prompt:          "Return only a strict JSON patch envelope.",
			Input:           json.RawMessage(`{"workspaceId":"workspace_api","sourceRefs":{},"evidence":[]}`),
			ReasoningEffort: &effort,
		},
	})
	if err != nil {
		t.Fatalf("run provider-default structured task: %v", err)
	}
	requireTurnOutcome(t, result.Completion, TurnOutcomeCompleted)
	if result.Audit.Model != "gpt-test" ||
		result.Audit.ReasoningEffort != "" ||
		result.Audit.ReasoningEffortReported {
		t.Fatalf("audit = %+v, want provider-reported model and no reported reasoning effort", result.Audit)
	}
}

func codexStructuredTaskTestOutputContract() HarnessOutputContract {
	return HarnessOutputContract{
		Kind:       HarnessOutputStrictJSON,
		JSONSchema: json.RawMessage(`{"type":"object","required":["patches"],"properties":{"patches":{"type":"array"}}}`),
	}
}

func codexStructuredTaskTestCapabilityPolicy() HarnessCapabilityPolicy {
	return HarnessCapabilityPolicy{
		AllowedTools:      []string{},
		WorkspaceMutation: false,
		Approvals:         false,
		Streaming:         false,
	}
}
