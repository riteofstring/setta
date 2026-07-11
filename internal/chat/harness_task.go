package chat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
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
	if !isStructuredHarnessSurface(request.Surface) {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured surface %s", ErrUnsupportedHarnessTask, request.Surface)
	}
	if request.TurnMode != HarnessTurnStructuredTask {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured turn mode %s", ErrUnsupportedHarnessTask, request.TurnMode)
	}
	if request.OutputContract.Kind != HarnessOutputStrictJSON {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured output contract %s", ErrUnsupportedHarnessTask, request.OutputContract.Kind)
	}
	if request.Surface == HarnessSurfaceEasyRunNarrator {
		return runScriptedEasyRunNarratorTask(request)
	}
	input, err := scriptedCartographerInputFromRequest(request)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	patchID, nodeID := scriptedCartographerPatchIDs(input)
	output, err := json.Marshal(map[string]any{
		"patches": []map[string]any{{
			"patchId":       patchID,
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
					"semanticNodeId": nodeID,
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

func runScriptedEasyRunNarratorTask(request HarnessTaskRequest) (HarnessTaskResult, error) {
	output, err := json.Marshal(scriptedEasyRunNarratorOutput(request))
	if err != nil {
		return HarnessTaskResult{}, err
	}
	return HarnessTaskResult{
		Completion:       TurnCompletion{Outcome: TurnOutcomeCompleted},
		StructuredOutput: json.RawMessage(output),
		Audit: HarnessAuditMetadata{
			HarnessKind: request.HarnessKind,
			Model:       request.StructuredTask.Model,
			RequestID:   "scripted-easy-run-narrator-request",
			ResponseID:  "scripted-easy-run-narrator-response",
			ThreadRef:   request.ThreadRef,
		},
	}, nil
}

type scriptedEasyRunNarratorDigestEntry struct {
	Text string `json:"text"`
}

func scriptedEasyRunNarratorOutput(request HarnessTaskRequest) map[string]any {
	var input struct {
		DigestEntries        []scriptedEasyRunNarratorDigestEntry `json:"digestEntries"`
		PreviousCurrentFocus string                               `json:"previousCurrentFocus"`
		RequestText          string                               `json:"requestText"`
		Status               string                               `json:"status"`
		Terminal             bool                                 `json:"terminal"`
	}
	if request.StructuredTask != nil && len(request.StructuredTask.Input) > 0 {
		_ = json.Unmarshal(request.StructuredTask.Input, &input)
	}
	if input.RequestText == "default narrator empty summary" {
		return map[string]any{
			"currentFocus": scriptedEasyRunCurrentFocus(input.RequestText, input.PreviousCurrentFocus, input.DigestEntries),
			"highlights":   []string{},
			"summary":      "",
		}
	}
	if input.RequestText == "easy run phase4 narrator workflow" {
		return map[string]any{
			"currentFocus": scriptedEasyRunCurrentFocus(input.RequestText, input.PreviousCurrentFocus, input.DigestEntries),
			"highlights": []string{
				"Framing the request as a user-facing result",
				"Preparing the final visible answer",
			},
			"summary": "The scripted narrator condensed the hidden run for the Easy Button pane.",
		}
	}
	if input.RequestText == "easy run working narrator cadence" && !input.Terminal {
		currentFocus := scriptedEasyRunCurrentFocus(input.RequestText, input.PreviousCurrentFocus, input.DigestEntries)
		highlights := []string{
			"Working through the request shape",
			"Preparing a visible result",
		}
		if currentFocus != input.PreviousCurrentFocus {
			highlights = []string{}
		}
		return map[string]any{
			"currentFocus": currentFocus,
			"highlights":   highlights,
			"summary":      "",
		}
	}
	summary := ""
	if input.Terminal {
		summary = scriptedEasyRunNarratorSummary(input.Status)
	}
	return map[string]any{
		"currentFocus": scriptedEasyRunCurrentFocus(input.RequestText, input.PreviousCurrentFocus, input.DigestEntries),
		"highlights":   []string{},
		"summary":      summary,
	}
}

func scriptedEasyRunCurrentFocus(requestText string, previous string, digestEntries []scriptedEasyRunNarratorDigestEntry) string {
	if previous == "" {
		previous = requestText
	}
	if strings.HasPrefix(requestText, "easy run phase5 long request workflow ") {
		return "Complete the Easy Button long-request workflow while preserving all of its constraints."
	}
	for _, entry := range digestEntries {
		switch entry.Text {
		case "steer easy run phase2":
			return "Complete the Easy Button phase 2 workflow while following the accepted steering direction."
		case "finish working narrator cadence", "finish":
			return "Finish the working narrator cadence."
		}
	}
	return previous
}

func scriptedEasyRunNarratorSummary(status string) string {
	switch status {
	case string(RunStatusCancelled):
		return "The run was stopped before finishing."
	case string(RunStatusFailed):
		return "The run could not finish."
	default:
		return "The Easy Button run finished."
	}
}

type scriptedCartographerInput struct {
	WorkspaceID  string
	WindowID     string
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
		WindowID    string         `json:"windowId"`
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
	input.WindowID = bundle.WindowID
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

func scriptedCartographerPatchIDs(input scriptedCartographerInput) (string, string) {
	const patchID = "cartographer_patch_scripted"
	const nodeID = "semantic_node_cartographer_scripted"
	if input.WindowID == "" {
		return patchID, nodeID
	}
	sum := sha256.Sum256([]byte(input.WindowID))
	suffix := hex.EncodeToString(sum[:])[:12]
	return patchID + "_" + suffix, nodeID + "_" + suffix
}
