package semanticgraph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestCartographerPatchEnvelopeAppliesAcceptedEvidenceBackedRecordPatch(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)

	input := cartographerPatchApplicationInput(t, "cartographer_run_apply", []CartographerPatch{
		cartographerRecordFindingPatch("cartographer_patch_apply", "node_cartographer_finding", "Renderer persistence finding", 0.91),
	})
	result, err := service.ApplyCartographerPatchEnvelope(ctx, input)
	if err != nil {
		t.Fatalf("apply cartographer patch envelope: %v", err)
	}
	if result.Run.Status != CartographerRunApplied || result.Run.InputBundleHash == "" || result.Run.RawHarnessResponseHash == "" || len(result.Run.CreatedSemanticEventIDs) != 2 {
		t.Fatalf("run audit = %+v, want applied run with hashes and two semantic event ids", result.Run)
	}
	if len(result.Patches) != 1 || result.Patches[0].Status != CartographerPatchApplied || len(result.Patches[0].CreatedSemanticEventIDs) != 2 {
		t.Fatalf("patch audit = %+v, want applied patch with event ids", result.Patches)
	}
	detail, ok, err := service.ReadNodeDetail(ctx, testWorkspaceID, "node_cartographer_finding")
	if err != nil {
		t.Fatalf("read cartographer node detail: %v", err)
	}
	if !ok || detail.Node.Kind != NodeKindFinding || len(detail.Evidence) != 1 || detail.Evidence[0].ReassignedFromAnchorID != "evidence_cartographer_source" {
		t.Fatalf("cartographer node detail = %+v, want finding with copied evidence", detail)
	}
}

func TestCartographerPatchEnvelopeRejectsInvalidOutputWithoutGraphMutation(t *testing.T) {
	cases := []struct {
		name      string
		input     func(t *testing.T) CartographerPatchEnvelopeApplicationInput
		wantCode  string
		wantState CartographerRunStatus
	}{
		{
			name: "invalid json",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				input := cartographerPatchApplicationInput(t, "cartographer_run_invalid_json", nil)
				input.RawHarnessResponse = json.RawMessage(`{"patches":[`)
				return input
			},
			wantCode:  "invalid_json",
			wantState: CartographerRunFailed,
		},
		{
			name: "unsupported operation",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				patch := cartographerRecordFindingPatch("cartographer_patch_unsupported", "node_unsupported", "Unsupported operation", 0.91)
				patch.Operation = CartographerPatchOperation("rewrite_history")
				return cartographerPatchApplicationInput(t, "cartographer_run_unsupported", []CartographerPatch{patch})
			},
			wantCode:  "schema_invalid",
			wantState: CartographerRunRejected,
		},
		{
			name: "missing evidence",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				patch := cartographerRecordFindingPatch("cartographer_patch_missing_evidence", "node_missing_evidence", "Missing evidence", 0.91)
				patch.EvidenceRefs = []CartographerPatchEvidenceRef{}
				return cartographerPatchApplicationInput(t, "cartographer_run_missing_evidence", []CartographerPatch{patch})
			},
			wantCode:  "missing_evidence",
			wantState: CartographerRunRejected,
		},
		{
			name: "unknown evidence ref",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				patch := cartographerRecordFindingPatch("cartographer_patch_unknown_evidence", "node_unknown_evidence", "Unknown evidence", 0.91)
				patch.EvidenceRefs[0].EvidenceAnchorID = "evidence_missing"
				return cartographerPatchApplicationInput(t, "cartographer_run_unknown_evidence", []CartographerPatch{patch})
			},
			wantCode:  "missing_evidence",
			wantState: CartographerRunRejected,
		},
		{
			name: "missing confidence",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				patch := cartographerRecordFindingPatch("cartographer_patch_missing_confidence", "node_missing_confidence", "Missing confidence", 0.91)
				patch.Confidence = nil
				return cartographerPatchApplicationInput(t, "cartographer_run_missing_confidence", []CartographerPatch{patch})
			},
			wantCode:  "schema_invalid",
			wantState: CartographerRunRejected,
		},
		{
			name: "duplicate patch ids",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				first := cartographerRecordFindingPatch("cartographer_patch_duplicate", "node_duplicate_a", "Duplicate A", 0.91)
				second := cartographerRecordFindingPatch("cartographer_patch_duplicate", "node_duplicate_b", "Duplicate B", 0.91)
				return cartographerPatchApplicationInput(t, "cartographer_run_duplicate", []CartographerPatch{first, second})
			},
			wantCode:  "duplicate_patch_id",
			wantState: CartographerRunRejected,
		},
		{
			name: "missing resolution node",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				patch := cartographerRecordFindingPatch("cartographer_patch_missing_resolution", "node_resolution_unused", "Missing resolution", 0.91)
				patch.Operation = CartographerPatchMarkResolved
				patch.Payload = CartographerPatchPayload{
					SemanticNodeID: "node_cartographer_source",
				}
				return cartographerPatchApplicationInput(t, "cartographer_run_missing_resolution", []CartographerPatch{patch})
			},
			wantCode:  "schema_invalid",
			wantState: CartographerRunRejected,
		},
		{
			name: "chain of thought field",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				input := cartographerPatchApplicationInput(t, "cartographer_run_chain_field", nil)
				input.RawHarnessResponse = json.RawMessage(`{"patches":[{"patchId":"cartographer_patch_chain","operation":"record_finding","workspaceId":"workspace_semantic_test","sourceRefs":{"chatRunId":"chat_run_cartographer","runItemId":"run_item_cartographer"},"causationId":"request_cartographer","correlationId":"response_cartographer","confidence":0.91,"publicSummary":"summary","evidenceRefs":[],"modelInfo":{},"reviewRequired":false,"payload":{},"chainOfThought":"hidden"}]}`)
				return input
			},
			wantCode:  "invalid_json",
			wantState: CartographerRunFailed,
		},
		{
			name: "harness failure",
			input: func(t *testing.T) CartographerPatchEnvelopeApplicationInput {
				input := cartographerPatchApplicationInput(t, "cartographer_run_harness_failed", nil)
				input.RawHarnessResponse = nil
				input.HarnessError = "scripted harness failed"
				return input
			},
			wantCode:  "harness_failed",
			wantState: CartographerRunFailed,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service, store := newCartographerPatchApplicationTestService(t)
			ctx := context.Background()
			seedCartographerPatchEvidence(t, store)
			before := semanticEventCount(t, store)

			result, err := service.ApplyCartographerPatchEnvelope(ctx, tc.input(t))
			if err != nil {
				t.Fatalf("apply invalid cartographer envelope: %v", err)
			}
			if result.Run.Status != tc.wantState {
				t.Fatalf("run status = %s, want %s; run = %+v", result.Run.Status, tc.wantState, result.Run)
			}
			if !cartographerDiagnosticsContain(result.Run.Diagnostics, result.Patches, tc.wantCode) {
				t.Fatalf("diagnostics run=%+v patches=%+v, want code %s", result.Run.Diagnostics, result.Patches, tc.wantCode)
			}
			if after := semanticEventCount(t, store); after != before {
				t.Fatalf("semantic event count after invalid patch = %d, want %d", after, before)
			}
		})
	}
}

func TestCartographerPatchEnvelopeApplicationIsAllOrNothing(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	before := semanticEventCount(t, store)
	valid := cartographerRecordFindingPatch("cartographer_patch_valid", "node_valid_not_applied", "Valid finding", 0.91)
	invalid := cartographerRecordFindingPatch("cartographer_patch_invalid", "node_invalid_not_applied", "Invalid finding", 0.91)
	invalid.EvidenceRefs[0].EvidenceAnchorID = "evidence_missing"

	result, err := service.ApplyCartographerPatchEnvelope(ctx, cartographerPatchApplicationInput(t, "cartographer_run_all_or_nothing", []CartographerPatch{valid, invalid}))
	if err != nil {
		t.Fatalf("apply mixed cartographer envelope: %v", err)
	}
	if result.Run.Status != CartographerRunRejected {
		t.Fatalf("run status = %s, want rejected", result.Run.Status)
	}
	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after mixed envelope = %d, want %d", after, before)
	}
	if _, ok, err := service.ReadNodeDetail(ctx, testWorkspaceID, "node_valid_not_applied"); err != nil || ok {
		t.Fatalf("valid patch node exists=%v err=%v, want no graph mutation", ok, err)
	}
}

func TestCartographerPatchEnvelopeLeavesHighImpactAndLowConfidencePendingReview(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	before := semanticEventCount(t, store)

	lowConfidence := cartographerRecordFindingPatch("cartographer_patch_low_confidence", "node_low_confidence", "Low confidence finding", 0.2)
	highImpact := cartographerRecordFindingPatch("cartographer_patch_high_impact", "node_high_impact", "High impact update", 0.95)
	highImpact.Operation = CartographerPatchUpdateNodeSummary
	highImpact.Payload = CartographerPatchPayload{SemanticNodeID: "node_cartographer_source", Summary: "Broad update requires review."}
	result, err := service.ApplyCartographerPatchEnvelope(ctx, cartographerPatchApplicationInput(t, "cartographer_run_pending_review", []CartographerPatch{lowConfidence, highImpact}))
	if err != nil {
		t.Fatalf("apply pending review envelope: %v", err)
	}
	if result.Run.Status != CartographerRunProposed || len(result.Patches) != 2 {
		t.Fatalf("result = %+v, want proposed run with two pending patches", result)
	}
	for _, patch := range result.Patches {
		if patch.Status != CartographerPatchPendingReview {
			t.Fatalf("patch %s status = %s, want pending_review", patch.ID, patch.Status)
		}
	}
	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after pending review = %d, want %d", after, before)
	}
}

func TestCartographerPatchEnvelopeDoesNotDedupeByLabel(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	appendTestEvent(t, store, EventNodeCreated, "node_same_label_existing", nodeCreatedPayload{
		NodeID:  "node_same_label_existing",
		Kind:    NodeKindFinding,
		Label:   "Repeated label",
		Summary: "Existing node with the same label.",
	})

	result, err := service.ApplyCartographerPatchEnvelope(ctx, cartographerPatchApplicationInput(t, "cartographer_run_no_dedupe", []CartographerPatch{
		cartographerRecordFindingPatch("cartographer_patch_no_dedupe", "node_same_label_created", "Repeated label", 0.91),
	}))
	if err != nil {
		t.Fatalf("apply no-dedupe patch: %v", err)
	}
	if result.Run.Status != CartographerRunApplied {
		t.Fatalf("run status = %s, want applied", result.Run.Status)
	}
	graph, err := service.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph: %v", err)
	}
	found := map[string]bool{}
	for _, node := range graph.Nodes {
		if node.Label == "Repeated label" {
			found[node.ID] = true
		}
	}
	if !found["node_same_label_existing"] || !found["node_same_label_created"] || len(found) != 2 {
		t.Fatalf("same-label nodes = %+v, want existing and explicitly created nodes", found)
	}
}

func newCartographerPatchApplicationTestService(t *testing.T) (*Service, *Store) {
	t.Helper()
	store := newTestStore(t)
	now, err := time.Parse(time.RFC3339Nano, testTimestamp(50))
	if err != nil {
		t.Fatalf("parse fixed time: %v", err)
	}
	service, err := NewService(
		store,
		associationWorkspaceResolver{root: t.TempDir()},
		WithIDGenerator(countingIDGenerator()),
		WithClock(func() time.Time { return now }),
	)
	if err != nil {
		t.Fatalf("new cartographer patch service: %v", err)
	}
	return service, store
}

func seedCartographerPatchEvidence(t *testing.T, store *Store) {
	t.Helper()
	appendTestEvent(t, store, EventNodeCreated, "node_cartographer_source", nodeCreatedPayload{
		NodeID:  "node_cartographer_source",
		Kind:    NodeKindConcept,
		Label:   "Cartographer source",
		Summary: "Source node for cartographer evidence.",
	})
	appendTestEvent(t, store, EventEvidenceAttached, "node_cartographer_source", evidenceAttachedPayload{
		AnchorID:       "evidence_cartographer_source",
		TargetEntityID: "node_cartographer_source",
		SourceKind:     EvidenceSourceRunItem,
		SourceID:       "run_item_cartographer",
		Summary:        "Run item evidence for cartographer patches.",
		ChatRunID:      "chat_run_cartographer",
		RunItemID:      "run_item_cartographer",
	})
}

func cartographerPatchApplicationInput(t *testing.T, runID string, patches []CartographerPatch) CartographerPatchEnvelopeApplicationInput {
	t.Helper()
	sourceRefs := SemanticContextSourceRefs{
		ChatRunID: "chat_run_cartographer",
		RunItemID: "run_item_cartographer",
	}
	envelope := CartographerPatchEnvelope{Patches: patches}
	raw, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("marshal patch envelope: %v", err)
	}
	return CartographerPatchEnvelopeApplicationInput{
		WorkspaceID:    testWorkspaceID,
		RunID:          runID,
		WindowID:       "cartographer_window_" + strings.TrimPrefix(runID, "cartographer_run_"),
		TriggerKind:    CartographerTriggerManual,
		TargetEntityID: "node_cartographer_source",
		SourceRefs:     sourceRefs,
		InputBundle: CartographerInputBundle{
			WorkspaceID:    testWorkspaceID,
			SourceRefs:     sourceRefs,
			TargetEntityID: "node_cartographer_source",
			NewEvents: []CartographerTrajectoryEvent{{
				Source:      CartographerTrajectorySourceChat,
				EventID:     "chat_events:001",
				Type:        "run_item.updated",
				StreamID:    "chat_events",
				Sequence:    1,
				OccurredAt:  testTimestamp(40),
				SourceRefs:  sourceRefs,
				RunItemID:   "run_item_cartographer",
				Summary:     "Run item completed.",
				Boundary:    true,
				CloseReason: CartographerCloseRunItemTerminal,
			}},
			ObservedEventRefs: []string{"chat_events:001"},
		},
		HarnessKind:        "scripted",
		Model:              "fake-cartographer",
		RequestID:          "request_cartographer",
		ResponseID:         "response_cartographer",
		RawHarnessResponse: raw,
		TrajectorySummary:  "Cartographer test trajectory summary.",
	}
}

func cartographerRecordFindingPatch(patchID string, nodeID string, label string, confidenceValue float64) CartographerPatch {
	confidence := confidenceValue
	sourceRefs := SemanticContextSourceRefs{
		ChatRunID: "chat_run_cartographer",
		RunItemID: "run_item_cartographer",
	}
	return CartographerPatch{
		ID:            patchID,
		Operation:     CartographerPatchRecordFinding,
		WorkspaceID:   testWorkspaceID,
		SourceRefs:    sourceRefs,
		CausationID:   "request_cartographer",
		CorrelationID: "response_cartographer",
		Confidence:    &confidence,
		PublicSummary: "Record " + label + ".",
		EvidenceRefs: []CartographerPatchEvidenceRef{{
			SourceKind:       EvidenceSourceRunItem,
			SourceID:         "run_item_cartographer",
			EvidenceAnchorID: "evidence_cartographer_source",
		}},
		ModelInfo:      map[string]string{"model": "fake-cartographer"},
		ReviewRequired: false,
		Payload: CartographerPatchPayload{
			NewNode: &CartographerPatchNewNode{
				SemanticNodeID: nodeID,
				Kind:           NodeKindFinding,
				Label:          label,
				Summary:        "Cartographer created " + label + ".",
				Scope:          CartographerPatchNodeScopeSession,
				EvidenceRefs:   []CartographerPatchEvidenceRef{},
			},
		},
	}
}

func cartographerDiagnosticsContain(runDiagnostics []CartographerDiagnostic, patches []CartographerPatchRecord, code string) bool {
	for _, diagnostic := range runDiagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	for _, patch := range patches {
		for _, diagnostic := range patch.ValidationResult.Diagnostics {
			if diagnostic.Code == code {
				return true
			}
		}
		for _, diagnostic := range patch.ApplicationResult.Diagnostics {
			if diagnostic.Code == code {
				return true
			}
		}
	}
	return false
}

func semanticEventCount(t *testing.T, store *Store) int {
	t.Helper()
	history, err := store.ReadEventHistory(context.Background(), testWorkspaceID, "", 0, 1000)
	if err != nil {
		t.Fatalf("read event history: %v", err)
	}
	return len(history.Events)
}
