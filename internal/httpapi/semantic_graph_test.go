package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/semanticgraph"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestSemanticGraphReadEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID

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
		"intervalId":     "activity_scope",
		"targetEntityId": "node_scope",
		"kind":           string(semanticgraph.ActivityKindValidating),
		"summary":        "Validating endpoint reads",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventActivityEnded, "node_scope", map[string]any{
		"intervalId": "activity_scope",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventSteeringCreated, "node_scope", map[string]any{
		"directiveId":    "steering_scope",
		"targetEntityId": "node_scope",
		"instruction":    "Keep endpoint surface read-only",
		"active":         true,
	})

	graph := postJSON[semanticgraph.SemanticGraph](t, handler, "/semantic-graph/read", ReadSemanticGraphRequest{
		WorkspaceID: workspaceID,
	}, http.StatusOK)
	if len(graph.Nodes) != 1 || graph.Nodes[0].ID != "node_scope" {
		t.Fatalf("graph nodes = %+v, want node_scope", graph.Nodes)
	}

	detail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_scope",
	}, http.StatusOK)
	if detail.Detail == nil || len(detail.Detail.Evidence) != 1 || len(detail.Detail.Activity) != 1 {
		t.Fatalf("node detail = %+v, want evidence and activity", detail.Detail)
	}

	evidence := postJSON[semanticgraph.SemanticEvidenceList](t, handler, "/semantic-graph/evidence/list", ListSemanticEvidenceRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
	}, http.StatusOK)
	if len(evidence.Evidence) != 1 || evidence.Evidence[0].ID != "evidence_scope" {
		t.Fatalf("evidence = %+v, want evidence_scope", evidence.Evidence)
	}

	activity := postJSON[semanticgraph.SemanticActivityList](t, handler, "/semantic-graph/activity/list", ListSemanticActivityRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
		Limit:          10,
	}, http.StatusOK)
	if len(activity.Activity) != 1 || activity.Activity[0].EndedAt == "" {
		t.Fatalf("activity = %+v, want ended activity_scope", activity.Activity)
	}

	steering := postJSON[semanticgraph.SemanticSteeringState](t, handler, "/semantic-graph/steering/read", ReadSemanticSteeringStateRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
	}, http.StatusOK)
	if len(steering.SteeringDirectives) != 1 || steering.SteeringDirectives[0].ID != "steering_scope" {
		t.Fatalf("steering = %+v, want steering_scope", steering.SteeringDirectives)
	}

	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_scope",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 5 || history.Events[0].EventType != semanticgraph.EventNodeCreated {
		t.Fatalf("history = %+v, want five target events in chronological order", history.Events)
	}

	assertSemanticLayoutUpdateEndpointDoesNotAppendEvent(t, handler, workspaceID)
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
	if len(history.Events) != 5 {
		t.Fatalf("history after layout update = %+v, want no appended semantic event", history.Events)
	}
}

func newSemanticGraphHandler(t *testing.T) (http.Handler, *semanticgraph.Service) {
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
	semanticService, err := semanticgraph.NewService(semanticStore, workspaceService)
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
