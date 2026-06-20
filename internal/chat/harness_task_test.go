package chat

import (
	"context"
	"encoding/json"
	"testing"

	"setta/internal/workspace"
)

type scriptedHarnessPatchEnvelope struct {
	Patches []scriptedHarnessPatch `json:"patches"`
}

type scriptedHarnessPatch struct {
	ID           string   `json:"patchId"`
	Operation    string   `json:"operation"`
	Confidence   *float64 `json:"confidence"`
	EvidenceRefs []struct {
		SourceKind       string `json:"sourceKind"`
		SourceID         string `json:"sourceId"`
		EvidenceAnchorID string `json:"evidenceAnchorId"`
	} `json:"evidenceRefs"`
	ModelInfo map[string]string `json:"modelInfo"`
	Payload   struct {
		NewNode *struct {
			SemanticNodeID string `json:"semanticNodeId"`
			Label          string `json:"label"`
			WhyItExists    string `json:"whyItExists"`
			FutureUse      string `json:"futureUse"`
		} `json:"newNode"`
		EdgeKind   *string `json:"edgeKind"`
		FromNodeID string  `json:"fromNodeId"`
		ToNodeID   string  `json:"toNodeId"`
	} `json:"payload"`
}

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
	var envelope scriptedHarnessPatchEnvelope
	if err := json.Unmarshal(result.StructuredOutput, &envelope); err != nil {
		t.Fatalf("decode scripted envelope: %v", err)
	}
	assertScriptedPatchCount(t, envelope, result.StructuredOutput)
	assertScriptedFindingPatch(t, envelope.Patches[0], result.StructuredOutput)
	assertScriptedEdgePatch(t, envelope.Patches[1], result.StructuredOutput)
	if result.Audit.RequestID == "" || result.Audit.ResponseID == "" {
		t.Fatalf("scripted audit = %+v, want deterministic request/response ids", result.Audit)
	}
}

func assertScriptedPatchCount(t *testing.T, envelope scriptedHarnessPatchEnvelope, output json.RawMessage) {
	t.Helper()
	if len(envelope.Patches) != 2 {
		t.Fatalf("scripted envelope = %s, want finding and edge patches", output)
	}
}

func assertScriptedFindingPatch(t *testing.T, patch scriptedHarnessPatch, output json.RawMessage) {
	t.Helper()
	if patch.ID != "cartographer_patch_scripted" ||
		patch.Operation != "record_finding" ||
		patch.Payload.NewNode == nil ||
		patch.Payload.NewNode.Label != "Workflow node workflow_node_scripted result" ||
		patch.Payload.NewNode.WhyItExists == "" ||
		patch.Payload.NewNode.FutureUse == "" ||
		patch.Confidence == nil ||
		patch.ModelInfo["provider"] != "scripted" {
		t.Fatalf("scripted finding envelope = %s, want deterministic concrete finding patch", output)
	}
	assertScriptedFindingEvidenceRefs(t, patch, output)
}

func assertScriptedFindingEvidenceRefs(t *testing.T, patch scriptedHarnessPatch, output json.RawMessage) {
	t.Helper()
	if len(patch.EvidenceRefs) != 2 ||
		patch.EvidenceRefs[0].EvidenceAnchorID != "evidence_scripted" ||
		patch.EvidenceRefs[1].SourceKind != "run_item" ||
		patch.EvidenceRefs[1].SourceID != "run_item_candidate_scripted" {
		t.Fatalf("scripted finding evidence refs = %s, want anchor and candidate source refs", output)
	}
}

func assertScriptedEdgePatch(t *testing.T, patch scriptedHarnessPatch, output json.RawMessage) {
	t.Helper()
	if patch.ID != "cartographer_patch_scripted_edge" ||
		patch.Operation != "create_edge" ||
		patch.Payload.EdgeKind == nil ||
		*patch.Payload.EdgeKind != "related_to" ||
		patch.Payload.FromNodeID != "semantic_node_cartographer_scripted" ||
		patch.Payload.ToNodeID != "semantic_seed_context" {
		t.Fatalf("scripted edge envelope = %s, want deterministic relationship patch", output)
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

func TestScriptedHarnessReturnsNoopForUntargetedHistoricalEvidence(t *testing.T) {
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
			ID: "cartographer_task_scripted_historical_noop",
			Workspace: workspace.WorkspaceSummary{
				ID:           "workspace_scripted",
				RootPath:     "/tmp/setta-scripted",
				DisplayName:  "scripted",
				LastOpenedAt: "2026-06-10T12:00:00Z",
			},
			Prompt: "cartograph",
			Input:  scriptedCartographerHistoricalEvidenceInput(t),
			Model:  "gpt-5-codex",
		},
	})
	if err != nil {
		t.Fatalf("run scripted historical noop cartographer task: %v", err)
	}
	var envelope struct {
		Patches []json.RawMessage `json:"patches"`
	}
	if err := json.Unmarshal(result.StructuredOutput, &envelope); err != nil {
		t.Fatalf("decode scripted historical noop envelope: %v", err)
	}
	if len(envelope.Patches) != 0 {
		t.Fatalf("scripted historical noop envelope = %s, want no patches", result.StructuredOutput)
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
		"evidenceCandidates": []map[string]any{{
			"sourceKind": "run_item",
			"sourceId":   "run_item_candidate_scripted",
		}},
	})
	if err != nil {
		t.Fatalf("marshal scripted cartographer input: %v", err)
	}
	return raw
}

func scriptedCartographerHistoricalEvidenceInput(t *testing.T) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"workspaceId":    "workspace_scripted",
		"targetEntityId": "",
		"evidence": []map[string]any{{
			"id":         "evidence_historical",
			"sourceKind": "test",
			"sourceId":   "run_item_historical",
		}},
	})
	if err != nil {
		t.Fatalf("marshal scripted historical cartographer input: %v", err)
	}
	return raw
}
