package chat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

func runScriptedStructuredHarnessTask(ctx context.Context, request HarnessTaskRequest) (HarnessTaskResult, error) {
	if err := ctx.Err(); err != nil {
		return HarnessTaskResult{}, err
	}
	if request.ConversationTurn != nil {
		return HarnessTaskResult{}, fmt.Errorf("%w: conversation turn cannot be run as structured task", ErrUnsupportedHarnessTask)
	}
	if request.StructuredTask == nil {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured task is required", ErrUnsupportedHarnessTask)
	}
	if request.Surface != HarnessSurfaceSemanticCartographer {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured surface %s", ErrUnsupportedHarnessTask, request.Surface)
	}
	if request.TurnMode != HarnessTurnStructuredTask {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured turn mode %s", ErrUnsupportedHarnessTask, request.TurnMode)
	}
	if request.OutputContract.Kind != HarnessOutputStrictJSON {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured output contract %s", ErrUnsupportedHarnessTask, request.OutputContract.Kind)
	}
	input, err := scriptedCartographerInputFromRequest(request)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	ids := scriptedCartographerPatchIDs(input)
	patches := scriptedCartographerPatches(request, input, ids)
	output, err := json.Marshal(map[string]any{
		"patches": patches,
	})
	if err != nil {
		return HarnessTaskResult{}, err
	}
	return HarnessTaskResult{
		Completion:       TurnCompletion{Outcome: TurnOutcomeCompleted},
		StructuredOutput: json.RawMessage(output),
		Audit: HarnessAuditMetadata{
			HarnessKind: request.HarnessKind,
			Model:       request.StructuredTask.Model,
			RequestID:   "scripted-cartographer-request",
			ResponseID:  "scripted-cartographer-response",
			ThreadRef:   request.ThreadRef,
		},
	}, nil
}

type scriptedCartographerInput struct {
	WorkspaceID     string
	WindowID        string
	SourceRefs      map[string]any
	EvidenceRefs    []map[string]any
	ExistingNodeIDs []string
	AssistantText   string
	ToolResult      string
}

type scriptedCartographerInputBundle struct {
	WorkspaceID   string                          `json:"workspaceId"`
	WindowID      string                          `json:"windowId"`
	SourceRefs    map[string]any                  `json:"sourceRefs"`
	AssistantText string                          `json:"assistantText"`
	ExistingNodes []scriptedCartographerInputNode `json:"existingNodes"`
	ToolCalls     []scriptedCartographerToolCall  `json:"toolCalls"`
	Evidence      []scriptedCartographerEvidence  `json:"evidence"`
}

type scriptedCartographerInputNode struct {
	ID string `json:"id"`
}

type scriptedCartographerToolCall struct {
	RunItemID     string `json:"runItemId"`
	ResultSummary string `json:"resultSummary"`
}

type scriptedCartographerEvidence struct {
	ID         string `json:"id"`
	SourceKind string `json:"sourceKind"`
	SourceID   string `json:"sourceId"`
}

func scriptedCartographerInputFromRequest(request HarnessTaskRequest) (scriptedCartographerInput, error) {
	input := scriptedCartographerInput{
		WorkspaceID:  request.StructuredTask.Workspace.ID,
		SourceRefs:   scriptedCartographerSourceRefs(nil),
		EvidenceRefs: []map[string]any{},
	}
	if len(request.StructuredTask.Input) == 0 {
		return input, nil
	}
	var bundle scriptedCartographerInputBundle
	if err := json.Unmarshal(request.StructuredTask.Input, &bundle); err != nil {
		return scriptedCartographerInput{}, fmt.Errorf("decode scripted cartographer input bundle: %w", err)
	}
	return scriptedCartographerInputFromBundle(input, bundle), nil
}

func scriptedCartographerInputFromBundle(input scriptedCartographerInput, bundle scriptedCartographerInputBundle) scriptedCartographerInput {
	if bundle.WorkspaceID != "" {
		input.WorkspaceID = bundle.WorkspaceID
	}
	input.WindowID = bundle.WindowID
	if bundle.SourceRefs != nil {
		input.SourceRefs = scriptedCartographerSourceRefs(bundle.SourceRefs)
	}
	input.AssistantText = bundle.AssistantText
	input.ExistingNodeIDs = scriptedCartographerExistingNodeIDs(bundle.ExistingNodes)
	input.ToolResult = scriptedCartographerToolResult(bundle.ToolCalls)
	input.EvidenceRefs = scriptedCartographerEvidenceRefs(bundle.Evidence)
	return input
}

func scriptedCartographerExistingNodeIDs(nodes []scriptedCartographerInputNode) []string {
	ids := []string{}
	for _, node := range nodes {
		if node.ID != "" {
			ids = append(ids, node.ID)
		}
	}
	return ids
}

func scriptedCartographerToolResult(tools []scriptedCartographerToolCall) string {
	for _, tool := range tools {
		if tool.ResultSummary != "" {
			return tool.ResultSummary
		}
	}
	return ""
}

func scriptedCartographerEvidenceRefs(evidenceRows []scriptedCartographerEvidence) []map[string]any {
	refs := []map[string]any{}
	for _, evidence := range evidenceRows {
		if evidence.ID == "" || evidence.SourceKind == "" || evidence.SourceID == "" {
			continue
		}
		refs = append(refs, map[string]any{
			"sourceKind":       evidence.SourceKind,
			"sourceId":         evidence.SourceID,
			"evidenceAnchorId": evidence.ID,
		})
	}
	return refs
}

type scriptedCartographerIDs struct {
	FindingPatchID string
	EdgePatchID    string
	NodeID         string
	EdgeID         string
}

func scriptedCartographerPatchIDs(input scriptedCartographerInput) scriptedCartographerIDs {
	const patchID = "cartographer_patch_scripted"
	const nodeID = "semantic_node_cartographer_scripted"
	const edgeID = "semantic_edge_cartographer_scripted"
	if input.WindowID == "" {
		return scriptedCartographerIDs{
			FindingPatchID: patchID,
			EdgePatchID:    patchID + "_edge",
			NodeID:         nodeID,
			EdgeID:         edgeID,
		}
	}
	sum := sha256.Sum256([]byte(input.WindowID))
	suffix := hex.EncodeToString(sum[:])[:12]
	return scriptedCartographerIDs{
		FindingPatchID: patchID + "_" + suffix,
		EdgePatchID:    patchID + "_edge_" + suffix,
		NodeID:         nodeID + "_" + suffix,
		EdgeID:         edgeID + "_" + suffix,
	}
}

func scriptedCartographerPatches(request HarnessTaskRequest, input scriptedCartographerInput, ids scriptedCartographerIDs) []map[string]any {
	if len(input.EvidenceRefs) == 0 {
		return []map[string]any{}
	}
	findingPayload := scriptedCartographerEmptyPayload()
	findingPayload["newNode"] = map[string]any{
		"semanticNodeId": ids.NodeID,
		"kind":           "finding",
		"label":          "Workflow result recorded",
		"summary":        scriptedCartographerFindingSummary(input),
		"scope":          "session",
		"evidenceRefs":   []map[string]any{},
	}
	patches := []map[string]any{
		scriptedCartographerPatch(request, input, ids.FindingPatchID, "record_finding", "Scripted cartographer recorded a concrete workflow result finding.", findingPayload),
	}
	if len(input.ExistingNodeIDs) > 0 {
		edgePayload := scriptedCartographerEmptyPayload()
		edgePayload["edgeId"] = ids.EdgeID
		edgePayload["edgeKind"] = "related_to"
		edgePayload["fromNodeId"] = ids.NodeID
		edgePayload["toNodeId"] = input.ExistingNodeIDs[0]
		edgePayload["label"] = "related workflow context"
		edgePayload["summary"] = "The workflow result finding is connected to the existing semantic context for the producing workflow node."
		patches = append(patches, scriptedCartographerPatch(request, input, ids.EdgePatchID, "create_edge", "Scripted cartographer connected the finding to existing workflow context.", edgePayload))
	}
	return patches
}

func scriptedCartographerPatch(request HarnessTaskRequest, input scriptedCartographerInput, patchID string, operation string, summary string, payload map[string]any) map[string]any {
	return map[string]any{
		"patchId":       patchID,
		"operation":     operation,
		"workspaceId":   input.WorkspaceID,
		"sourceRefs":    input.SourceRefs,
		"causationId":   "scripted-cartographer-request",
		"correlationId": "scripted-cartographer-response",
		"confidence":    0.91,
		"publicSummary": summary,
		"evidenceRefs":  input.EvidenceRefs,
		"modelInfo": map[string]any{
			"provider":   "scripted",
			"model":      request.StructuredTask.Model,
			"responseId": "scripted-cartographer-response",
		},
		"reviewRequired": false,
		"payload":        payload,
	}
}

func scriptedCartographerEmptyPayload() map[string]any {
	return map[string]any{
		"semanticNodeId":     "",
		"targetEntityId":     "",
		"newNode":            nil,
		"summary":            "",
		"edgeId":             "",
		"edgeKind":           nil,
		"fromNodeId":         "",
		"toNodeId":           "",
		"label":              "",
		"activityId":         "",
		"activityKind":       nil,
		"activitySourceKind": nil,
		"activitySourceId":   "",
		"evidenceAnchorId":   "",
		"sourceNodeId":       "",
		"newNodes":           []map[string]any{},
		"sourceNodeIds":      []string{},
		"targetNode":         nil,
		"resolutionNodeId":   "",
		"evidenceRefs":       []map[string]any{},
		"reassignments": map[string]any{
			"edges":    []map[string]any{},
			"evidence": []map[string]any{},
			"activity": []map[string]any{},
			"steering": []map[string]any{},
			"layout":   []map[string]any{},
		},
	}
}

func scriptedCartographerFindingSummary(input scriptedCartographerInput) string {
	if input.ToolResult != "" {
		return "The workflow result tool recorded: " + input.ToolResult + "."
	}
	if input.AssistantText != "" {
		return "The final assistant response stated: " + input.AssistantText
	}
	return "The workflow produced a concrete result backed by the cited evidence."
}

func scriptedCartographerSourceRefs(raw map[string]any) map[string]any {
	refs := map[string]any{}
	for _, key := range []string{
		"workflowDefinitionId",
		"workflowExecutionId",
		"workflowNodeId",
		"workflowNodeExecutionId",
		"chatConversationId",
		"chatRunId",
		"chatMessageId",
		"runItemId",
	} {
		if value, ok := raw[key].(string); ok {
			refs[key] = value
			continue
		}
		refs[key] = ""
	}
	return refs
}
