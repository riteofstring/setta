package chat

import (
	"context"
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
	output, err := json.Marshal(map[string]any{
		"patches": []map[string]any{{
			"patchId":       "cartographer_patch_scripted",
			"operation":     "record_finding",
			"workspaceId":   input.WorkspaceID,
			"sourceRefs":    input.SourceRefs,
			"causationId":   "scripted-cartographer-request",
			"correlationId": "scripted-cartographer-response",
			"confidence":    0.91,
			"publicSummary": "Scripted cartographer patch envelope",
			"evidenceRefs":  input.EvidenceRefs,
			"modelInfo": map[string]any{
				"harness": "scripted",
			},
			"reviewRequired": false,
			"payload": map[string]any{
				"newNode": map[string]any{
					"semanticNodeId": "semantic_node_cartographer_scripted",
					"kind":           "finding",
					"label":          "Scripted cartographer finding",
					"summary":        "The scripted harness returned a deterministic finding.",
					"scope":          "session",
					"evidenceRefs":   input.EvidenceRefs,
				},
			},
		}},
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
	WorkspaceID  string
	SourceRefs   map[string]any
	EvidenceRefs []map[string]any
}

func scriptedCartographerInputFromRequest(request HarnessTaskRequest) (scriptedCartographerInput, error) {
	input := scriptedCartographerInput{
		WorkspaceID:  request.StructuredTask.Workspace.ID,
		SourceRefs:   map[string]any{},
		EvidenceRefs: []map[string]any{},
	}
	var bundle struct {
		WorkspaceID string         `json:"workspaceId"`
		SourceRefs  map[string]any `json:"sourceRefs"`
		Evidence    []struct {
			ID         string `json:"id"`
			SourceKind string `json:"sourceKind"`
			SourceID   string `json:"sourceId"`
		} `json:"evidence"`
	}
	if len(request.StructuredTask.Input) == 0 {
		return input, nil
	}
	if err := json.Unmarshal(request.StructuredTask.Input, &bundle); err != nil {
		return scriptedCartographerInput{}, fmt.Errorf("decode scripted cartographer input bundle: %w", err)
	}
	if bundle.WorkspaceID != "" {
		input.WorkspaceID = bundle.WorkspaceID
	}
	if bundle.SourceRefs != nil {
		input.SourceRefs = bundle.SourceRefs
	}
	for _, evidence := range bundle.Evidence {
		if evidence.ID == "" || evidence.SourceKind == "" || evidence.SourceID == "" {
			continue
		}
		input.EvidenceRefs = append(input.EvidenceRefs, map[string]any{
			"sourceKind":       evidence.SourceKind,
			"sourceId":         evidence.SourceID,
			"evidenceAnchorId": evidence.ID,
		})
	}
	return input, nil
}
