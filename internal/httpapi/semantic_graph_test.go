package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/semanticgraph"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestSemanticGraphReadEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID

	seedHTTPSemanticReadFixture(t, semanticService, workspaceID)
	assertSemanticGraphReadEndpoint(t, handler, workspaceID)
	assertSemanticNodeDetailEndpoint(t, handler, workspaceID)
	assertSemanticEvidenceEndpoint(t, handler, workspaceID)
	assertSemanticActivityEndpoints(t, handler, workspaceID)
	assertSemanticSteeringEndpoint(t, handler, workspaceID)
	assertSemanticHistoryEndpoint(t, handler, workspaceID)
	assertSemanticContextPackEndpoints(t, handler, workspaceID)
	assertSemanticLayoutUpdateEndpointDoesNotAppendEvent(t, handler, workspaceID)
}

func TestCartographerReadAndReviewEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	seedHTTPSemanticReadFixture(t, semanticService, workspaceID)

	built := buildHTTPCartographerWindow(t, handler, workspaceID)
	saveHTTPCartographerCursor(t, semanticService, workspaceID, built.Window.ID)
	pending := applyPendingHTTPCartographerPatch(t, semanticService, workspaceID, "cartographer_run_http_accept", "cartographer_patch_http_accept", "node_http_accept")
	assertHTTPCartographerReadEndpoints(t, handler, workspaceID, built, pending)
	assertHTTPCartographerAcceptEndpoint(t, handler, workspaceID)
	applyPendingHTTPCartographerPatch(t, semanticService, workspaceID, "cartographer_run_http_reject", "cartographer_patch_http_reject", "node_http_reject")
	assertHTTPCartographerRejectEndpoint(t, handler, workspaceID)
}

func buildHTTPCartographerWindow(t *testing.T, handler http.Handler, workspaceID string) semanticgraph.CartographerWindowBuildResult {
	t.Helper()
	built := postJSON[semanticgraph.CartographerWindowBuildResult](t, handler, "/semantic-graph/cartographer/windows/build", BuildCartographerWindowRequest{
		WorkspaceID:    workspaceID,
		TriggerKind:    semanticgraph.CartographerTriggerManual,
		TargetEntityID: "node_scope",
		SourceRefs: semanticgraph.SemanticContextSourceRefs{
			WorkflowExecutionID: "execution_scope",
		},
		Summary: "Manual deterministic cartographer window for HTTP review coverage.",
	}, http.StatusOK)
	if built.Run.ID == "" || built.Window.RunID != built.Run.ID || built.Summary == nil {
		t.Fatalf("built cartographer window = %+v, want run, window, and summary", built)
	}
	return built
}

func saveHTTPCartographerCursor(t *testing.T, semanticService *semanticgraph.Service, workspaceID string, windowID string) {
	t.Helper()
	if _, err := semanticService.SaveCartographerCursor(context.Background(), semanticgraph.CartographerCursor{
		ID:                  "cartographer_cursor_http",
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		LastWindowID:        windowID,
		UpdatedAt:           "2026-06-10T12:20:00Z",
	}); err != nil {
		t.Fatalf("save cartographer cursor fixture: %v", err)
	}
}

func assertHTTPCartographerReadEndpoints(t *testing.T, handler http.Handler, workspaceID string, built semanticgraph.CartographerWindowBuildResult, pending semanticgraph.CartographerPatchEnvelopeApplicationResult) {
	t.Helper()
	readRun := postJSON[semanticgraph.CartographerRunReadResponse](t, handler, "/semantic-graph/cartographer/runs/read", ReadCartographerRunRequest{
		WorkspaceID: workspaceID,
		RunID:       pending.Run.ID,
	}, http.StatusOK)
	if readRun.Run == nil || readRun.Run.ID != pending.Run.ID || readRun.Run.InputBundleHash == "" {
		t.Fatalf("read cartographer run = %+v, want pending run audit", readRun.Run)
	}
	runs := postJSON[semanticgraph.CartographerRunList](t, handler, "/semantic-graph/cartographer/runs/list", ListCartographerRunsRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Limit:               10,
	}, http.StatusOK)
	if len(runs.Runs) < 2 {
		t.Fatalf("cartographer runs = %+v, want built and pending runs", runs.Runs)
	}
	windows := postJSON[semanticgraph.CartographerWindowList](t, handler, "/semantic-graph/cartographer/windows/list", ListCartographerWindowsRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Limit:               10,
	}, http.StatusOK)
	if len(windows.Windows) != 1 || windows.Windows[0].ID != built.Window.ID {
		t.Fatalf("cartographer windows = %+v, want built window", windows.Windows)
	}
	cursors := postJSON[semanticgraph.CartographerCursorList](t, handler, "/semantic-graph/cartographer/cursors/list", ListCartographerCursorsRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Limit:               10,
	}, http.StatusOK)
	if len(cursors.Cursors) != 1 || cursors.Cursors[0].LastWindowID != built.Window.ID {
		t.Fatalf("cartographer cursors = %+v, want persisted cursor", cursors.Cursors)
	}
	patches := postJSON[semanticgraph.CartographerPatchList](t, handler, "/semantic-graph/cartographer/patches/list", ListCartographerPatchesRequest{
		WorkspaceID:      workspaceID,
		SemanticTargetID: "node_http_accept",
		Status:           semanticgraph.CartographerPatchPendingReview,
		Limit:            10,
	}, http.StatusOK)
	if len(patches.Patches) != 1 || patches.Patches[0].ID != "cartographer_patch_http_accept" {
		t.Fatalf("cartographer patches = %+v, want pending target patch", patches.Patches)
	}
}

func assertHTTPCartographerAcceptEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	accepted := postJSON[semanticgraph.CartographerPatchReviewResult](t, handler, "/semantic-graph/cartographer/patches/accept", ReviewCartographerPatchRequest{
		WorkspaceID: workspaceID,
		PatchID:     "cartographer_patch_http_accept",
	}, http.StatusOK)
	if accepted.Patch.Status != semanticgraph.CartographerPatchApplied || accepted.NodeDetail == nil || accepted.NodeDetail.Node.ID != "node_http_accept" {
		t.Fatalf("accepted cartographer patch = %+v, want applied node detail", accepted)
	}
	acceptedDetail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_http_accept",
	}, http.StatusOK)
	if acceptedDetail.Detail == nil || len(acceptedDetail.Detail.CartographerPatches) != 1 || acceptedDetail.Detail.CartographerPatches[0].Status != semanticgraph.CartographerPatchApplied {
		t.Fatalf("accepted node detail = %+v, want cartographer patch history", acceptedDetail.Detail)
	}
}

func assertHTTPCartographerRejectEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	rejected := postJSON[semanticgraph.CartographerPatchReviewResult](t, handler, "/semantic-graph/cartographer/patches/reject", ReviewCartographerPatchRequest{
		WorkspaceID: workspaceID,
		PatchID:     "cartographer_patch_http_reject",
	}, http.StatusOK)
	if rejected.Patch.Status != semanticgraph.CartographerPatchRejected || rejected.Patch.ApplicationResult.Applied {
		t.Fatalf("rejected cartographer patch = %+v, want rejected without application", rejected.Patch)
	}
}

func seedHTTPSemanticReadFixture(t *testing.T, semanticService *semanticgraph.Service, workspaceID string) {
	t.Helper()
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventNodeCreated, "node_scope", map[string]any{
		"nodeId":  "node_scope",
		"kind":    string(semanticgraph.NodeKindConstraint),
		"label":   "Phase 1 backend only",
		"summary": "Renderer work is out of scope",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventEvidenceAttached, "node_scope", map[string]any{
		"anchorId":       "evidence_scope",
		"targetEntityId": "node_scope",
		"sourceKind":     string(semanticgraph.EvidenceSourceDocument),
		"path":           "docs/plans/setta_semantic_work_graph_implementation_plan.md",
		"rangeStart":     64,
		"rangeEnd":       72,
		"summary":        "Scope guard",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventActivityStarted, "node_scope", map[string]any{
		"intervalId":       "activity_scope",
		"targetEntityId":   "node_scope",
		"kind":             string(semanticgraph.ActivityKindValidating),
		"summary":          "Validating endpoint reads",
		"sourceKind":       string(semanticgraph.ActivitySourceFileRange),
		"evidenceAnchorId": "evidence_scope",
		"actorKind":        string(semanticgraph.ActorKindService),
		"actorId":          "semantic_http_test",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventActivityEnded, "node_scope", map[string]any{
		"intervalId": "activity_scope",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventSteeringCreated, "node_scope", map[string]any{
		"directiveId":    "steering_scope",
		"targetEntityId": "node_scope",
		"kind":           string(semanticgraph.SteeringKindFocus),
		"instruction":    "Keep endpoint surface read-only",
		"status":         string(semanticgraph.SteeringStatusActive),
		"scope":          string(semanticgraph.SteeringScopeWorkspace),
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventContextPackCreated, "node_scope", map[string]any{
		"packId":               "pack_scope",
		"triggerKind":          string(semanticgraph.ContextTriggerWorkflowAgentStart),
		"targetEntityId":       "node_scope",
		"sourceRefs":           map[string]any{"workflowExecutionId": "execution_scope"},
		"authoredPromptHash":   "sha256:authored",
		"deliveredContextHash": "sha256:delivered",
		"tokenBudget":          200,
		"estimatedTokens":      12,
		"itemCount":            1,
		"items": []map[string]any{{
			"itemId":          "pack_scope_item_001",
			"kind":            string(semanticgraph.ContextPackItemConstraint),
			"semanticNodeId":  "node_scope",
			"title":           "Phase 1 backend only",
			"reasonIncluded":  "active workspace constraint",
			"priority":        string(semanticgraph.ContextPriorityRequired),
			"estimatedTokens": 6,
			"createdAt":       "2026-06-10T12:00:06Z",
			"updatedAt":       "2026-06-10T12:00:06Z",
		}},
		"deliveredContext": "Setta semantic context pack pack_scope\n- [required] Constraint: Phase 1 backend only",
	})
}

func applyPendingHTTPCartographerPatch(t *testing.T, semanticService *semanticgraph.Service, workspaceID string, runID string, patchID string, nodeID string) semanticgraph.CartographerPatchEnvelopeApplicationResult {
	t.Helper()
	confidence := 0.2
	sourceRefs := semanticgraph.SemanticContextSourceRefs{WorkflowExecutionID: "execution_scope"}
	patch := semanticgraph.CartographerPatch{
		ID:            patchID,
		Operation:     semanticgraph.CartographerPatchRecordFinding,
		WorkspaceID:   workspaceID,
		SourceRefs:    sourceRefs,
		CausationID:   "request_cartographer_http",
		CorrelationID: "response_cartographer_http",
		Confidence:    &confidence,
		PublicSummary: "Record HTTP cartographer finding.",
		EvidenceRefs: []semanticgraph.CartographerPatchEvidenceRef{{
			EvidenceAnchorID: "evidence_scope",
		}},
		ModelInfo:      map[string]string{"model": "fake-cartographer-http"},
		ReviewRequired: false,
		Payload: semanticgraph.CartographerPatchPayload{
			NewNode: &semanticgraph.CartographerPatchNewNode{
				SemanticNodeID: nodeID,
				Kind:           semanticgraph.NodeKindFinding,
				Label:          "HTTP cartographer finding " + nodeID,
				Summary:        "Pending review cartographer node from HTTP fixture.",
				Scope:          semanticgraph.CartographerPatchNodeScopeSession,
			},
		},
	}
	raw, err := json.Marshal(semanticgraph.CartographerPatchEnvelope{Patches: []semanticgraph.CartographerPatch{patch}})
	if err != nil {
		t.Fatalf("marshal cartographer patch fixture: %v", err)
	}
	result, err := semanticService.ApplyCartographerPatchEnvelope(context.Background(), semanticgraph.CartographerPatchEnvelopeApplicationInput{
		WorkspaceID:    workspaceID,
		RunID:          runID,
		WindowID:       "cartographer_window_" + patchID,
		TriggerKind:    semanticgraph.CartographerTriggerManual,
		TargetEntityID: "node_scope",
		SourceRefs:     sourceRefs,
		InputBundle: semanticgraph.CartographerInputBundle{
			WorkspaceID:    workspaceID,
			TriggerKind:    semanticgraph.CartographerTriggerManual,
			SourceRefs:     sourceRefs,
			TargetEntityID: "node_scope",
			NewEvents: []semanticgraph.CartographerTrajectoryEvent{{
				Source:     semanticgraph.CartographerTrajectorySourceWorkflow,
				EventID:    "workflow_events:" + patchID,
				Type:       "workflow.node.completed",
				OccurredAt: "2026-06-10T12:15:00Z",
				SourceRefs: sourceRefs,
				Summary:    "Workflow node completed for cartographer HTTP fixture.",
				Boundary:   true,
			}},
			ObservedEventRefs: []string{"workflow_events:" + patchID},
		},
		HarnessKind:        "scripted",
		Model:              "fake-cartographer-http",
		RequestID:          "request_cartographer_http",
		ResponseID:         "response_cartographer_http",
		RawHarnessResponse: raw,
		TrajectorySummary:  "HTTP cartographer patch summary.",
	})
	if err != nil {
		t.Fatalf("apply cartographer patch fixture: %v", err)
	}
	if len(result.Patches) != 1 || result.Patches[0].Status != semanticgraph.CartographerPatchPendingReview {
		t.Fatalf("cartographer patch fixture = %+v, want pending review patch", result)
	}
	return result
}

func assertSemanticGraphReadEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	graph := postJSON[semanticgraph.SemanticGraph](t, handler, "/semantic-graph/read", ReadSemanticGraphRequest{
		WorkspaceID: workspaceID,
	}, http.StatusOK)
	if len(graph.Nodes) != 1 || graph.Nodes[0].ID != "node_scope" {
		t.Fatalf("graph nodes = %+v, want node_scope", graph.Nodes)
	}
}

func assertSemanticNodeDetailEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	detail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_scope",
	}, http.StatusOK)
	if detail.Detail == nil || len(detail.Detail.Evidence) != 1 || len(detail.Detail.Activity) != 1 || len(detail.Detail.ContextPackHistory) != 1 {
		t.Fatalf("node detail = %+v, want evidence and activity", detail.Detail)
	}
}

func assertSemanticEvidenceEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	evidence := postJSON[semanticgraph.SemanticEvidenceList](t, handler, "/semantic-graph/evidence/list", ListSemanticEvidenceRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
	}, http.StatusOK)
	if len(evidence.Evidence) != 1 || evidence.Evidence[0].ID != "evidence_scope" {
		t.Fatalf("evidence = %+v, want evidence_scope", evidence.Evidence)
	}
}

func assertSemanticActivityEndpoints(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	activity := postJSON[semanticgraph.SemanticActivityList](t, handler, "/semantic-graph/activity/list", ListSemanticActivityRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
		Limit:          10,
	}, http.StatusOK)
	if len(activity.Activity) != 1 || activity.Activity[0].EndedAt == "" {
		t.Fatalf("activity = %+v, want ended activity_scope", activity.Activity)
	}
	activityPage := postJSON[semanticgraph.SemanticActivityPage](t, handler, "/semantic-graph/activity/page", ListSemanticActivityPageRequest{
		WorkspaceID: workspaceID,
		SourceKind:  semanticActivitySourceKindPtr(semanticgraph.ActivitySourceFileRange),
		Offset:      0,
		Limit:       10,
	}, http.StatusOK)
	if len(activityPage.Activity) != 1 || activityPage.Activity[0].ID != "activity_scope" {
		t.Fatalf("activity page = %+v, want activity_scope", activityPage.Activity)
	}
	activitySummary := postJSON[semanticgraph.SemanticActivitySummary](t, handler, "/semantic-graph/activity/summary", ReadSemanticActivitySummaryRequest{
		WorkspaceID: workspaceID,
		RecentLimit: 3,
	}, http.StatusOK)
	if len(activitySummary.Targets) != 1 || len(activitySummary.Targets[0].RecentActivity) != 1 {
		t.Fatalf("activity summary = %+v, want one recent activity", activitySummary)
	}
}

func assertSemanticSteeringEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	steering := postJSON[semanticgraph.SemanticSteeringState](t, handler, "/semantic-graph/steering/read", ReadSemanticSteeringStateRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
	}, http.StatusOK)
	if len(steering.SteeringDirectives) != 1 || steering.SteeringDirectives[0].ID != "steering_scope" {
		t.Fatalf("steering = %+v, want steering_scope", steering.SteeringDirectives)
	}
}

func assertSemanticHistoryEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_scope",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 6 || history.Events[0].EventType != semanticgraph.EventNodeCreated {
		t.Fatalf("history = %+v, want six target events in chronological order", history.Events)
	}
}

func assertSemanticContextPackEndpoints(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	pack := postJSON[semanticgraph.SemanticContextPackReadResponse](t, handler, "/semantic-graph/context-packs/read", ReadSemanticContextPackRequest{
		WorkspaceID: workspaceID,
		PackID:      "pack_scope",
	}, http.StatusOK)
	if pack.Pack == nil || pack.Pack.ID != "pack_scope" || len(pack.Pack.Items) != 1 {
		t.Fatalf("context pack read = %+v, want pack_scope with item", pack.Pack)
	}
	packsByTarget := postJSON[semanticgraph.SemanticContextPackList](t, handler, "/semantic-graph/context-packs/list", ListSemanticContextPacksRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
		Offset:         0,
		Limit:          10,
	}, http.StatusOK)
	if len(packsByTarget.Packs) != 1 || packsByTarget.Packs[0].ID != "pack_scope" {
		t.Fatalf("context packs by target = %+v, want pack_scope", packsByTarget.Packs)
	}
	packsByWorkflow := postJSON[semanticgraph.SemanticContextPackList](t, handler, "/semantic-graph/context-packs/list", ListSemanticContextPacksRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Offset:              0,
		Limit:               10,
	}, http.StatusOK)
	if len(packsByWorkflow.Packs) != 1 || packsByWorkflow.Packs[0].ID != "pack_scope" {
		t.Fatalf("context packs by workflow = %+v, want pack_scope", packsByWorkflow.Packs)
	}
}

func TestSemanticGraphAttachmentEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandlerWithOptions(t, semanticgraph.WithChatSourceResolver(httpSemanticChatResolver{
		run: chat.Run{
			ID:               "run_http_attach",
			WorkspaceID:      "workspace_set_later",
			ConversationID:   "conversation_http_attach",
			TriggerMessageID: "message_http_user",
			Harness:          chat.HarnessCodex,
			Status:           chat.RunStatusRunning,
			StartedAt:        "2026-06-10T20:10:00Z",
			PromptSummary:    "Attach a real chat run to semantic state",
		},
	}))
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventNodeCreated, "node_attach", map[string]any{
		"nodeId": "node_attach",
		"kind":   string(semanticgraph.NodeKindFinding),
		"label":  "Attach chat run",
	})

	attachment := postJSON[semanticgraph.SemanticAttachmentResult](t, handler, "/semantic-graph/attachments/chat-run", AttachSemanticNodeToChatRunRequest{
		WorkspaceID:  workspaceID,
		NodeID:       "node_attach",
		ChatRunID:    "run_http_attach",
		ActivityKind: semanticgraph.ActivityKindExploring,
		ActorKind:    semanticgraph.ActorKindUser,
		ActorID:      "user_http",
	}, http.StatusOK)
	if attachment.Evidence.SourceKind != semanticgraph.EvidenceSourceChatRun || attachment.Activity.SourceKind != semanticgraph.ActivitySourceChatRun {
		t.Fatalf("attachment = %+v, want chat run evidence and activity", attachment)
	}

	ended := postJSON[semanticgraph.SemanticActivityEndResult](t, handler, "/semantic-graph/activity/end", EndSemanticActivityRequest{
		WorkspaceID:        workspaceID,
		ActivityIntervalID: attachment.Activity.ID,
		ActorKind:          semanticgraph.ActorKindUser,
		ActorID:            "user_http",
	}, http.StatusOK)
	if ended.Activity.EndedAt == "" {
		t.Fatalf("ended activity = %+v, want ended timestamp", ended.Activity)
	}

	detail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_attach",
	}, http.StatusOK)
	if detail.Detail == nil || len(detail.Detail.Evidence) != 1 || len(detail.Detail.Activity) != 1 || detail.Detail.Activity[0].EvidenceAnchorID == "" {
		t.Fatalf("attached detail = %+v, want linked evidence and activity", detail.Detail)
	}
	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_attach",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 4 {
		t.Fatalf("history = %+v, want node created plus attach/end events", history.Events)
	}
}

func TestSemanticGraphMutationEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventNodeCreated, "node_source", map[string]any{
		"nodeId": "node_source",
		"kind":   string(semanticgraph.NodeKindFinding),
		"label":  "Source node",
	})

	createdNode := postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/create", CreateSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_constraint",
		Kind:        semanticgraph.NodeKindConstraint,
		Label:       "Explicit constraint",
		Summary:     "Created through HTTP mutation endpoint",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	if createdNode.NodeDetail == nil || createdNode.NodeDetail.Node.Kind != semanticgraph.NodeKindConstraint {
		t.Fatalf("created node = %+v, want constraint detail", createdNode.NodeDetail)
	}
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/edges/create", CreateSemanticEdgeRequest{
		WorkspaceID: workspaceID,
		EdgeID:      "edge_constraint",
		Kind:        semanticgraph.EdgeKindConstrains,
		FromNodeID:  "node_constraint",
		ToNodeID:    "node_source",
		Label:       "constrains",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	edgeSummary := "Updated edge through HTTP"
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/edges/update", UpdateSemanticEdgeRequest{
		WorkspaceID: workspaceID,
		EdgeID:      "edge_constraint",
		Summary:     &edgeSummary,
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/edges/remove", SemanticEdgeOperationRequest{
		WorkspaceID: workspaceID,
		EdgeID:      "edge_constraint",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/rename", RenameSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		Label:       "Renamed source",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	nodeSummary := "Updated source through HTTP"
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/update", UpdateSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		Summary:     &nodeSummary,
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/promote", SemanticNodeOperationRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/dismiss", SemanticNodeOperationRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	steering := postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/steering/create", CreateSemanticSteeringDirectiveRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_source",
		Kind:           semanticgraph.SteeringKindAvoid,
		Instruction:    "Avoid this dismissed source",
		Scope:          semanticgraph.SteeringScopeWorkspace,
		ActorKind:      semanticgraph.ActorKindUser,
		ActorID:        "user_http",
	}, http.StatusOK)
	if steering.NodeDetail == nil || len(steering.NodeDetail.SteeringDirectives) != 1 {
		t.Fatalf("steering result = %+v, want one directive", steering.NodeDetail)
	}
	directiveID := steering.NodeDetail.SteeringDirectives[0].ID
	dismissed := semanticgraph.SteeringStatusDismissed
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/steering/update", UpdateSemanticSteeringDirectiveRequest{
		WorkspaceID: workspaceID,
		DirectiveID: directiveID,
		Status:      &dismissed,
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/split", SplitSemanticNodeRequest{
		WorkspaceID:  workspaceID,
		SourceNodeID: "node_constraint",
		Nodes: []semanticgraph.SemanticNodeSeedInput{
			{NodeID: "node_split_a", Kind: semanticgraph.NodeKindConstraint, Label: "Split A"},
			{NodeID: "node_split_b", Kind: semanticgraph.NodeKindConstraint, Label: "Split B"},
		},
		ActorKind: semanticgraph.ActorKindUser,
		ActorID:   "user_http",
	}, http.StatusOK)
	merged := postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/merge", MergeSemanticNodesRequest{
		WorkspaceID:   workspaceID,
		SourceNodeIDs: []string{"node_split_a", "node_split_b"},
		TargetNode:    semanticgraph.SemanticNodeSeedInput{NodeID: "node_merged", Kind: semanticgraph.NodeKindDecision, Label: "Merged decision"},
		ActorKind:     semanticgraph.ActorKindUser,
		ActorID:       "user_http",
	}, http.StatusOK)
	if merged.NodeDetail == nil || merged.NodeDetail.Node.ID != "node_merged" {
		t.Fatalf("merged result = %+v, want merged target detail", merged.NodeDetail)
	}

	postJSON[ErrorResponse](t, handler, "/semantic-graph/nodes/rename", RenameSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_missing",
		Label:       "Missing",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusBadRequest)
}

func assertSemanticLayoutUpdateEndpointDoesNotAppendEvent(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	positions := postJSON[semanticgraph.SemanticLayoutPositionList](t, handler, "/semantic-graph/layout/update", UpdateSemanticLayoutPositionsRequest{
		WorkspaceID: workspaceID,
		Positions: []semanticgraph.SemanticLayoutPositionInput{
			{EntityID: "node_scope", X: 80, Y: -40, Pinned: true},
		},
	}, http.StatusOK)
	if len(positions.Positions) != 1 || positions.Positions[0].EntityID != "node_scope" || !positions.Positions[0].Pinned {
		t.Fatalf("layout update response = %+v, want pinned node_scope", positions)
	}
	graph := postJSON[semanticgraph.SemanticGraph](t, handler, "/semantic-graph/read", ReadSemanticGraphRequest{
		WorkspaceID: workspaceID,
	}, http.StatusOK)
	if len(graph.LayoutPositions) != 1 || graph.LayoutPositions[0].X != 80 || graph.LayoutPositions[0].Y != -40 {
		t.Fatalf("graph layout positions = %+v, want persisted node_scope position", graph.LayoutPositions)
	}
	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_scope",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 6 {
		t.Fatalf("history after layout update = %+v, want no appended semantic event", history.Events)
	}
}

func newSemanticGraphHandler(t *testing.T) (http.Handler, *semanticgraph.Service) {
	return newSemanticGraphHandlerWithOptions(t)
}

func newSemanticGraphHandlerWithOptions(t *testing.T, options ...semanticgraph.Option) (http.Handler, *semanticgraph.Service) {
	t.Helper()
	appDataDir := t.TempDir()
	store, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			return mustTime(t, "2026-06-10T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	workspaceService, err := workspacesession.NewService(store, manager)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	semanticStore, err := semanticgraph.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new semantic graph store: %v", err)
	}
	t.Cleanup(func() {
		if err := semanticStore.Close(); err != nil {
			t.Fatalf("close semantic graph store: %v", err)
		}
	})
	semanticService, err := semanticgraph.NewService(semanticStore, workspaceService, options...)
	if err != nil {
		t.Fatalf("new semantic graph service: %v", err)
	}
	return NewHandler(HandlerConfig{
		Metadata:             BackendMetadata{Name: BackendName, Version: "test"},
		SemanticGraphService: semanticService,
		WorkspaceService:     workspaceService,
	}), semanticService
}

func appendHTTPSemanticEvent(t *testing.T, service *semanticgraph.Service, workspaceID string, eventType semanticgraph.SemanticEventType, targetEntityID string, payload map[string]any) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal semantic payload: %v", err)
	}
	event := semanticgraph.SemanticEvent{
		EventID:        "semantic_http_" + strings.ReplaceAll(string(eventType), ".", "_") + "_" + targetEntityID + "_" + payloadID(payload),
		WorkspaceID:    workspaceID,
		ActorKind:      semanticgraph.ActorKindService,
		ActorID:        "semantic_http_test",
		EventType:      eventType,
		TargetEntityID: targetEntityID,
		ObservedAt:     semanticHTTPObservedAt(t, eventType),
		Payload:        data,
		ModelInfo:      map[string]string{},
	}
	if _, err := service.AppendEvent(context.Background(), event); err != nil {
		t.Fatalf("append semantic event %s: %v", eventType, err)
	}
}

func payloadID(payload map[string]any) string {
	for _, key := range []string{"nodeId", "anchorId", "intervalId", "directiveId"} {
		if value, ok := payload[key].(string); ok {
			return value
		}
	}
	return "event"
}

func semanticHTTPObservedAt(t *testing.T, eventType semanticgraph.SemanticEventType) string {
	t.Helper()
	offsets := map[semanticgraph.SemanticEventType]int{
		semanticgraph.EventNodeCreated:      1,
		semanticgraph.EventEvidenceAttached: 2,
		semanticgraph.EventActivityStarted:  3,
		semanticgraph.EventActivityEnded:    4,
		semanticgraph.EventSteeringCreated:  5,
	}
	return time.Date(2026, 6, 10, 20, 0, offsets[eventType], 0, time.UTC).Format(time.RFC3339Nano)
}

func semanticActivitySourceKindPtr(kind semanticgraph.SemanticActivitySourceKind) *semanticgraph.SemanticActivitySourceKind {
	return &kind
}

type httpSemanticChatResolver struct {
	run chat.Run
}

func (resolver httpSemanticChatResolver) ReadConversation(workspaceID string, conversationID string) (chat.Conversation, error) {
	if resolver.run.ConversationID == conversationID {
		return chat.Conversation{ID: conversationID, WorkspaceID: workspaceID}, nil
	}
	return chat.Conversation{}, errors.New("chat conversation not found")
}

func (resolver httpSemanticChatResolver) ReadRun(workspaceID string, runID string) (chat.Run, error) {
	if resolver.run.ID == runID {
		run := resolver.run
		run.WorkspaceID = workspaceID
		return run, nil
	}
	return chat.Run{}, errors.New("chat run not found")
}

func (resolver httpSemanticChatResolver) ReadMessage(string, string, string) (chat.ChatMessage, error) {
	return chat.ChatMessage{}, errors.New("chat message not found")
}

func (resolver httpSemanticChatResolver) ReadRunItem(string, string, string) (chat.RunItem, error) {
	return chat.RunItem{}, errors.New("run item not found")
}
