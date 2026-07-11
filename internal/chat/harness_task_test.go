package chat

import (
	"context"
	"encoding/json"
	"testing"

	"setta/internal/workspace"
)

func TestScriptedHarnessReturnsDeterministicCartographerPatchEnvelope(t *testing.T) {
	harness := NewScriptedWorkflowHarness()
	result, err := harness.RunTask(context.Background(), HarnessTaskRequest{
		Surface:     HarnessSurfaceSemanticCartographer,
		HarnessKind: HarnessCodex,
		TurnMode:    HarnessTurnStructuredTask,
		OutputContract: HarnessOutputContract{
			Kind:       HarnessOutputStrictJSON,
			JSONSchema: json.RawMessage(`{"type":"object"}`),
		},
		StructuredTask: &HarnessStructuredTask{
			ID: "cartographer_task_scripted",
			Workspace: workspace.WorkspaceSummary{
				ID:           "workspace_scripted",
				RootPath:     "/tmp/setta-scripted",
				DisplayName:  "scripted",
				LastOpenedAt: "2026-06-10T12:00:00Z",
			},
			Prompt: "cartograph",
			Model:  "gpt-5-codex",
		},
	})
	if err != nil {
		t.Fatalf("run scripted cartographer task: %v", err)
	}
	var envelope struct {
		Patches []struct {
			ID         string   `json:"patchId"`
			Confidence *float64 `json:"confidence"`
		} `json:"patches"`
	}
	if err := json.Unmarshal(result.StructuredOutput, &envelope); err != nil {
		t.Fatalf("decode scripted envelope: %v", err)
	}
	if len(envelope.Patches) != 1 || envelope.Patches[0].ID != "cartographer_patch_scripted" || envelope.Patches[0].Confidence == nil {
		t.Fatalf("scripted envelope = %s, want deterministic cartographer patch", result.StructuredOutput)
	}
	if result.Audit.RequestID == "" || result.Audit.ResponseID == "" {
		t.Fatalf("scripted audit = %+v, want deterministic request/response ids", result.Audit)
	}
}

func TestScriptedHarnessAcceptsEasyRunNarratorStructuredSurface(t *testing.T) {
	harness := NewScriptedWorkflowHarness()
	result, err := harness.RunTask(context.Background(), HarnessTaskRequest{
		Surface:     HarnessSurfaceEasyRunNarrator,
		HarnessKind: HarnessCodex,
		TurnMode:    HarnessTurnStructuredTask,
		OutputContract: HarnessOutputContract{
			Kind:       HarnessOutputStrictJSON,
			JSONSchema: json.RawMessage(`{"type":"object"}`),
		},
		StructuredTask: &HarnessStructuredTask{
			ID: "easy_run_narrator_task_scripted",
			Workspace: workspace.WorkspaceSummary{
				ID:           "workspace_scripted",
				RootPath:     "/tmp/setta-scripted",
				DisplayName:  "scripted",
				LastOpenedAt: "2026-06-10T12:00:00Z",
			},
			Prompt: "narrate",
			Input:  json.RawMessage(`{"requestText":"summarize","digest":[]}`),
			Model:  "gpt-5-codex",
		},
	})
	if err != nil {
		t.Fatalf("run scripted easy-run narrator task: %v", err)
	}
	var envelope struct {
		Highlights []string `json:"highlights"`
		Summary    string   `json:"summary"`
	}
	if err := json.Unmarshal(result.StructuredOutput, &envelope); err != nil {
		t.Fatalf("decode scripted narrator envelope: %v", err)
	}
	if envelope.Highlights == nil || envelope.Summary != "" {
		t.Fatalf("scripted narrator envelope = %s, want empty highlights and summary", result.StructuredOutput)
	}
	if result.Audit.RequestID != "scripted-easy-run-narrator-request" || result.Audit.ResponseID != "scripted-easy-run-narrator-response" {
		t.Fatalf("scripted narrator audit = %+v, want deterministic request/response ids", result.Audit)
	}
}
