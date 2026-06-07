package semanticgraph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/chat"
	"setta/internal/workspace"
)

func TestCartographerHarnessRoutesStructuredTaskThroughSharedHarness(t *testing.T) {
	fake := chat.NewFakeHarness(nil)
	harness, err := NewCartographerHarness(chat.HarnessTaskRunnerFor(fake), chat.HarnessCodex)
	if err != nil {
		t.Fatalf("new cartographer harness: %v", err)
	}

	result, err := harness.Run(context.Background(), CartographerHarnessTask{
		ID:          "cartographer_task_001",
		Workspace:   cartographerHarnessWorkspace(),
		InputBundle: cartographerTestInputBundle(),
		Model:       "gpt-5-codex",
	})
	if err != nil {
		t.Fatalf("run cartographer harness: %v", err)
	}
	if len(result.PatchEnvelope) == 0 || result.Audit.RequestID != "scripted-cartographer-request" {
		t.Fatalf("cartographer result = %+v, want deterministic scripted envelope and audit", result)
	}
	tasks := fake.StructuredTaskRequests()
	if len(tasks) != 1 {
		t.Fatalf("structured tasks = %+v, want one cartographer task", tasks)
	}
	task := tasks[0]
	if task.Surface != chat.HarnessSurfaceSemanticCartographer ||
		task.TurnMode != chat.HarnessTurnStructuredTask ||
		task.OutputContract.Kind != chat.HarnessOutputStrictJSON {
		t.Fatalf("shared harness task = %+v, want semantic cartographer strict JSON task", task)
	}
	if task.CapabilityPolicy.WorkspaceMutation || task.CapabilityPolicy.Approvals || task.CapabilityPolicy.Streaming {
		t.Fatalf("cartographer capability policy = %+v, want no mutation, approvals, or streaming", task.CapabilityPolicy)
	}
}

func TestCartographerHarnessRejectsInvalidEnvelopeShape(t *testing.T) {
	harness, err := NewCartographerHarness(badCartographerTaskRunner{}, chat.HarnessCodex)
	if err != nil {
		t.Fatalf("new cartographer harness: %v", err)
	}

	_, err = harness.Run(context.Background(), CartographerHarnessTask{
		ID:          "cartographer_task_001",
		Workspace:   cartographerHarnessWorkspace(),
		InputBundle: cartographerTestInputBundle(),
	})
	if err == nil {
		t.Fatal("cartographer harness accepted invalid envelope, want shape error")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("cartographer harness error = %v, want strict envelope field failure", err)
	}
}

func TestValidateCartographerPatchEnvelopeShapeRequiresPatchObjects(t *testing.T) {
	err := ValidateCartographerPatchEnvelopeShape(json.RawMessage(`{"patches":["not an object"]}`))
	if err == nil {
		t.Fatal("cartographer envelope accepted non-object patch, want shape error")
	}
	if !strings.Contains(err.Error(), "patches[0] must be an object") {
		t.Fatalf("cartographer envelope error = %v, want patch object failure", err)
	}
}

type badCartographerTaskRunner struct{}

func (badCartographerTaskRunner) RunTask(context.Context, chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	return chat.HarnessTaskResult{
		Completion:       chat.TurnCompletion{Outcome: chat.TurnOutcomeCompleted},
		StructuredOutput: json.RawMessage(`{"patches":[],"chainOfThought":"hidden"}`),
	}, nil
}

func cartographerHarnessWorkspace() workspace.WorkspaceSummary {
	return workspace.WorkspaceSummary{
		ID:           testWorkspaceID,
		RootPath:     "/tmp/setta-cartographer-test",
		DisplayName:  "cartographer-test",
		LastOpenedAt: testTimestamp(1),
	}
}
