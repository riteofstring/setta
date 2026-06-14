package chat

import (
	"context"
	"encoding/json"
	"testing"

	"setta/internal/workspace"
)

func TestScriptedHarnessReturnsDeterministicCartographerPatchEnvelope(t *testing.T) {
	harness := NewScriptedWorkflowHarness()
	input := scriptedCartographerTestInput(t)
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
			Input:  input,
			Model:  "gpt-5-codex",
		},
	})
	if err != nil {
		t.Fatalf("run scripted cartographer task: %v", err)
	}
	var envelope struct {
		Patches []struct {
			ID         string            `json:"patchId"`
			Operation  string            `json:"operation"`
			Confidence *float64          `json:"confidence"`
			ModelInfo  map[string]string `json:"modelInfo"`
			Payload    struct {
				NewNode *struct {
					SemanticNodeID string `json:"semanticNodeId"`
					Label          string `json:"label"`
				} `json:"newNode"`
				EdgeKind   *string `json:"edgeKind"`
				FromNodeID string  `json:"fromNodeId"`
				ToNodeID   string  `json:"toNodeId"`
			} `json:"payload"`
		} `json:"patches"`
	}
	if err := json.Unmarshal(result.StructuredOutput, &envelope); err != nil {
		t.Fatalf("decode scripted envelope: %v", err)
	}
	if len(envelope.Patches) != 2 ||
		envelope.Patches[0].ID != "cartographer_patch_scripted" ||
		envelope.Patches[0].Operation != "record_finding" ||
		envelope.Patches[0].Payload.NewNode == nil ||
		envelope.Patches[0].Payload.NewNode.Label != "Workflow result recorded" ||
		envelope.Patches[0].Confidence == nil ||
		envelope.Patches[0].ModelInfo["provider"] != "scripted" {
		t.Fatalf("scripted finding envelope = %s, want deterministic concrete finding patch", result.StructuredOutput)
	}
	if envelope.Patches[1].ID != "cartographer_patch_scripted_edge" ||
		envelope.Patches[1].Operation != "create_edge" ||
		envelope.Patches[1].Payload.EdgeKind == nil ||
		*envelope.Patches[1].Payload.EdgeKind != "related_to" ||
		envelope.Patches[1].Payload.FromNodeID != "semantic_node_cartographer_scripted" ||
		envelope.Patches[1].Payload.ToNodeID != "semantic_seed_context" {
		t.Fatalf("scripted edge envelope = %s, want deterministic relationship patch", result.StructuredOutput)
	}
	if result.Audit.RequestID == "" || result.Audit.ResponseID == "" {
		t.Fatalf("scripted audit = %+v, want deterministic request/response ids", result.Audit)
	}
}

func TestScriptedHarnessReturnsNoopWithoutEvidence(t *testing.T) {
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
			ID: "cartographer_task_scripted_noop",
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
		t.Fatalf("run scripted noop cartographer task: %v", err)
	}
	var envelope struct {
		Patches []json.RawMessage `json:"patches"`
	}
	if err := json.Unmarshal(result.StructuredOutput, &envelope); err != nil {
		t.Fatalf("decode scripted noop envelope: %v", err)
	}
	if len(envelope.Patches) != 0 {
		t.Fatalf("scripted noop envelope = %s, want no evidence-backed patches", result.StructuredOutput)
	}
}

func scriptedCartographerTestInput(t *testing.T) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"workspaceId": "workspace_scripted",
		"windowId":    "",
		"sourceRefs": map[string]any{
			"workflowDefinitionId":    "workflow_definition_scripted",
			"workflowExecutionId":     "workflow_execution_scripted",
			"workflowNodeId":          "workflow_node_scripted",
			"workflowNodeExecutionId": "workflow_node_execution_scripted",
			"chatConversationId":      "chat_conversation_scripted",
			"chatRunId":               "chat_run_scripted",
			"chatMessageId":           "chat_message_scripted",
			"runItemId":               "run_item_scripted",
		},
		"assistantText": "Workflow result action complete.",
		"existingNodes": []map[string]any{{
			"id": "semantic_seed_context",
		}},
		"toolCalls": []map[string]any{{
			"runItemId":     "run_item_scripted",
			"resultSummary": "workflow result recorded",
		}},
		"evidence": []map[string]any{{
			"id":         "evidence_scripted",
			"sourceKind": "run_item",
			"sourceId":   "run_item_scripted",
		}},
	})
	if err != nil {
		t.Fatalf("marshal scripted cartographer input: %v", err)
	}
	return raw
}
