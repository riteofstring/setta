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

func TestDefaultCartographerPatchEnvelopeSchemaIsStrictForProvider(t *testing.T) {
	var schema any
	if err := json.Unmarshal(DefaultCartographerPatchEnvelopeSchema(), &schema); err != nil {
		t.Fatalf("default cartographer schema is invalid JSON: %v", err)
	}
	assertStrictObjectSchema(t, schema, "$")
}

func TestValidateCartographerPatchEnvelopeShapeRequiresPatchObjects(t *testing.T) {
	err := ValidateCartographerPatchEnvelopeShape(json.RawMessage(`{"patches":["not an object"]}`))
	if err == nil {
		t.Fatal("cartographer envelope accepted non-object patch, want shape error")
	}
	if !strings.Contains(err.Error(), "cannot unmarshal string") {
		t.Fatalf("cartographer envelope error = %v, want patch object failure", err)
	}
}

func assertStrictObjectSchema(t *testing.T, raw any, path string) {
	t.Helper()
	schema, ok := raw.(map[string]any)
	if !ok {
		return
	}
	if schemaTypeIncludes(schema["type"], "object") || schema["properties"] != nil {
		if schema["additionalProperties"] != false {
			t.Fatalf("%s additionalProperties = %v, want false", path, schema["additionalProperties"])
		}
		properties := objectSchemaProperties(t, schema, path)
		required := objectSchemaRequired(t, schema, path)
		for property := range properties {
			if !required[property] {
				t.Fatalf("%s property %s is not required", path, property)
			}
		}
	}
	for key, value := range schema {
		assertStrictObjectSchema(t, value, path+"."+key)
	}
}

func schemaTypeIncludes(raw any, want string) bool {
	switch value := raw.(type) {
	case string:
		return value == want
	case []any:
		for _, item := range value {
			if item == want {
				return true
			}
		}
	}
	return false
}

func objectSchemaProperties(t *testing.T, schema map[string]any, path string) map[string]any {
	t.Helper()
	raw, ok := schema["properties"].(map[string]any)
	if ok {
		return raw
	}
	t.Fatalf("%s object schema is missing properties", path)
	return nil
}

func objectSchemaRequired(t *testing.T, schema map[string]any, path string) map[string]bool {
	t.Helper()
	raw, ok := schema["required"].([]any)
	if !ok {
		t.Fatalf("%s object schema is missing required", path)
	}
	required := map[string]bool{}
	for _, item := range raw {
		name, ok := item.(string)
		if !ok {
			t.Fatalf("%s required contains non-string value %v", path, item)
		}
		required[name] = true
	}
	return required
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
