package chat

import (
	"encoding/json"
	"testing"
)

func TestCodexStructuredTaskAcceptsEasyRunNarratorSurface(t *testing.T) {
	err := validateCodexStructuredTaskRequest(HarnessTaskRequest{
		Surface:     HarnessSurfaceEasyRunNarrator,
		HarnessKind: HarnessCodex,
		TurnMode:    HarnessTurnStructuredTask,
		OutputContract: HarnessOutputContract{
			Kind:       HarnessOutputStrictJSON,
			JSONSchema: json.RawMessage(`{"type":"object","required":["highlights"],"properties":{"highlights":{"type":"array"}}}`),
		},
		CapabilityPolicy: HarnessCapabilityPolicy{
			AllowedTools:      []string{},
			WorkspaceMutation: false,
			Approvals:         false,
			Streaming:         false,
		},
		StructuredTask: &HarnessStructuredTask{
			ID:        "easy_run_narrator_task_codex_test",
			Workspace: testTurnRequest(t).Workspace,
			Prompt:    "Return only strict narrator JSON.",
			Input:     json.RawMessage(`{"requestText":"summarize","digest":[]}`),
			Model:     "gpt-test",
		},
	})
	if err != nil {
		t.Fatalf("validate easy-run narrator structured task: %v", err)
	}
}
