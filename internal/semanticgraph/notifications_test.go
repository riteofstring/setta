package semanticgraph

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestServicePublishesSemanticGraphChangeAfterCommittedMutation(t *testing.T) {
	service := newNotificationTestService(t)
	subscription := subscribeSemanticGraphChangesForTest(t, service, SemanticGraphChangeCursor{})
	defer subscription.Unsubscribe()

	if _, err := service.CreateUserNode(context.Background(), CreateSemanticNodeInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      "node_notify",
		Kind:        NodeKindFinding,
		Label:       "Notification finding",
		Actor:       testOperationActor(),
	}); err != nil {
		t.Fatalf("create semantic node: %v", err)
	}

	event := receiveSemanticGraphChange(t, subscription)
	if event.Sequence != 1 ||
		event.StreamID == "" ||
		event.EventID == "" ||
		event.Type != SemanticGraphChangeEventType ||
		event.WorkspaceID != testWorkspaceID ||
		!semanticChangeAreasContain(event.ChangedAreas, SemanticGraphChangeAreaGraph) ||
		!notificationStringSliceContains(event.SemanticNodeIDs, "node_notify") ||
		len(event.CreatedSemanticEventIDs) != 1 {
		t.Fatalf("semantic graph change = %+v, want graph mutation for node_notify", event)
	}
}

func TestServiceDoesNotPublishSemanticGraphChangeForFailedMutation(t *testing.T) {
	service := newNotificationTestService(t)
	if _, err := service.CreateUserNode(context.Background(), CreateSemanticNodeInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      "node_existing",
		Kind:        NodeKindFinding,
		Label:       "Existing node",
		Actor:       testOperationActor(),
	}); err != nil {
		t.Fatalf("seed semantic node: %v", err)
	}
	subscription := subscribeSemanticGraphChangesForTest(t, service, SemanticGraphChangeCursor{})
	defer subscription.Unsubscribe()

	_, err := service.CreateUserEdge(context.Background(), CreateSemanticEdgeInput{
		WorkspaceID: testWorkspaceID,
		EdgeID:      "edge_missing_target",
		Kind:        EdgeKindRelatedTo,
		FromNodeID:  "node_existing",
		ToNodeID:    "node_missing",
		Actor:       testOperationActor(),
	})
	if err == nil {
		t.Fatal("create edge to missing node succeeded, want failure")
	}
	assertNoSemanticGraphChange(t, subscription)
}

func TestServicePublishesLayoutAndCartographerAuditChanges(t *testing.T) {
	service := newNotificationTestService(t)
	if _, err := service.CreateUserNode(context.Background(), CreateSemanticNodeInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      "node_layout",
		Kind:        NodeKindDecision,
		Label:       "Layout node",
		Actor:       testOperationActor(),
	}); err != nil {
		t.Fatalf("seed layout node: %v", err)
	}
	subscription := subscribeSemanticGraphChangesForTest(t, service, SemanticGraphChangeCursor{})
	defer subscription.Unsubscribe()

	if _, err := service.UpdateLayoutPositions(context.Background(), testWorkspaceID, []SemanticLayoutPositionInput{{
		EntityID: "node_layout",
		X:        12,
		Y:        34,
		Pinned:   true,
	}}); err != nil {
		t.Fatalf("update layout positions: %v", err)
	}
	layoutEvent := receiveSemanticGraphChange(t, subscription)
	if !semanticChangeAreasContain(layoutEvent.ChangedAreas, SemanticGraphChangeAreaLayout) ||
		!notificationStringSliceContains(layoutEvent.TargetEntityIDs, "node_layout") {
		t.Fatalf("layout change = %+v, want layout invalidation for node_layout", layoutEvent)
	}

	if _, err := service.SaveCartographerRun(context.Background(), CartographerRun{
		ID:             "cartographer_run_notify",
		WorkspaceID:    testWorkspaceID,
		Status:         CartographerRunPending,
		TriggerKind:    CartographerTriggerManual,
		TargetEntityID: "node_cartographer_notify",
		CreatedAt:      testTimestamp(90),
		UpdatedAt:      testTimestamp(90),
	}); err != nil {
		t.Fatalf("save cartographer run: %v", err)
	}
	auditEvent := receiveSemanticGraphChange(t, subscription)
	if auditEvent.Sequence != layoutEvent.Sequence+1 ||
		!semanticChangeAreasContain(auditEvent.ChangedAreas, SemanticGraphChangeAreaCartographerAudit) ||
		!notificationStringSliceContains(auditEvent.CartographerRunIDs, "cartographer_run_notify") ||
		!notificationStringSliceContains(auditEvent.TargetEntityIDs, "node_cartographer_notify") {
		t.Fatalf("cartographer audit change = %+v, want monotonic audit invalidation", auditEvent)
	}
}

func TestSemanticGraphChangeEventsAreWorkspaceScoped(t *testing.T) {
	store := newTestStore(t)
	service, err := NewService(
		store,
		notificationWorkspaceResolver{roots: map[string]string{
			"workspace_alpha": "/tmp/workspace_alpha",
			"workspace_beta":  "/tmp/workspace_beta",
		}},
		WithIDGenerator(countingIDGenerator()),
	)
	if err != nil {
		t.Fatalf("new semantic graph service: %v", err)
	}
	subscription := subscribeSemanticGraphChangesForTest(t, service, SemanticGraphChangeCursor{})
	defer subscription.Unsubscribe()

	createNotificationNode(t, service, "workspace_alpha", "node_alpha")
	createNotificationNode(t, service, "workspace_beta", "node_beta")

	alpha := receiveSemanticGraphChange(t, subscription)
	beta := receiveSemanticGraphChange(t, subscription)
	if alpha.WorkspaceID != "workspace_alpha" || !notificationStringSliceContains(alpha.SemanticNodeIDs, "node_alpha") {
		t.Fatalf("first workspace change = %+v, want workspace_alpha node_alpha", alpha)
	}
	if beta.WorkspaceID != "workspace_beta" || !notificationStringSliceContains(beta.SemanticNodeIDs, "node_beta") {
		t.Fatalf("second workspace change = %+v, want workspace_beta node_beta", beta)
	}
}

func newNotificationTestService(t *testing.T) *Service {
	t.Helper()
	store := newTestStore(t)
	return newAssociationTestService(t, store, t.TempDir(), nil, nil)
}

func subscribeSemanticGraphChangesForTest(t *testing.T, service *Service, cursor SemanticGraphChangeCursor) *SemanticGraphChangeSubscription {
	t.Helper()
	subscription, err := service.SubscribeSemanticGraphChanges(cursor)
	if err != nil {
		t.Fatalf("subscribe semantic graph changes: %v", err)
	}
	return subscription
}

func receiveSemanticGraphChange(t *testing.T, subscription *SemanticGraphChangeSubscription) SemanticGraphChangeEvent {
	t.Helper()
	select {
	case event := <-subscription.Events:
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for semantic graph change event")
		return SemanticGraphChangeEvent{}
	}
}

func assertNoSemanticGraphChange(t *testing.T, subscription *SemanticGraphChangeSubscription) {
	t.Helper()
	select {
	case event := <-subscription.Events:
		t.Fatalf("unexpected semantic graph change event: %+v", event)
	case <-time.After(50 * time.Millisecond):
	}
}

func semanticChangeAreasContain(values []SemanticGraphChangeArea, want SemanticGraphChangeArea) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func notificationStringSliceContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func createNotificationNode(t *testing.T, service *Service, workspaceID string, nodeID string) {
	t.Helper()
	if _, err := service.CreateUserNode(context.Background(), CreateSemanticNodeInput{
		WorkspaceID: workspaceID,
		NodeID:      nodeID,
		Kind:        NodeKindFinding,
		Label:       nodeID,
		Actor:       testOperationActor(),
	}); err != nil {
		t.Fatalf("create %s in %s: %v", nodeID, workspaceID, err)
	}
}

type notificationWorkspaceResolver struct {
	roots map[string]string
}

func (resolver notificationWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	root, ok := resolver.roots[id]
	if !ok {
		return workspace.WorkspaceSummary{}, errors.New("workspace not found")
	}
	return workspace.WorkspaceSummary{ID: id, RootPath: root, DisplayName: id}, nil
}
