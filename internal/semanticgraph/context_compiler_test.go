package semanticgraph

import (
	"context"
	"strings"
	"testing"

	"setta/internal/semanticcontext"
)

func TestContextCompilerSelectsRanksAndPersistsExplicitContext(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	ctx := context.Background()
	seedCompilerGraph(t, store)

	delivery, err := service.CompileContext(ctx, semanticcontext.CompileRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    semanticcontext.TriggerWorkflowAgentStart,
		AuthoredPrompt: "Run the workflow agent.",
		SourceRefs: semanticcontext.SourceRefs{
			WorkflowDefinitionID:    "definition_ctx",
			WorkflowExecutionID:     "execution_ctx",
			WorkflowNodeID:          "workflow_node_ctx",
			WorkflowNodeExecutionID: "workflow_node_execution_ctx",
		},
		TokenBudget: 1000,
	})
	if err != nil {
		t.Fatalf("compile context: %v", err)
	}
	assertCompilerDelivery(t, delivery)

	pack, ok, err := service.ReadContextPack(ctx, testWorkspaceID, delivery.PackID)
	if err != nil {
		t.Fatalf("read context pack: %v", err)
	}
	if !ok {
		t.Fatal("context pack was not persisted")
	}
	assertCompilerPackAudit(t, pack, delivery.ContextText)

	list, err := service.ListContextPacks(ctx, SemanticContextPackFilter{
		WorkspaceID:         testWorkspaceID,
		WorkflowExecutionID: "execution_ctx",
		Offset:              0,
		Limit:               10,
	})
	if err != nil {
		t.Fatalf("list context packs: %v", err)
	}
	assertCompilerPackList(t, list, delivery.PackID)
}

func assertCompilerDelivery(t *testing.T, delivery semanticcontext.Delivery) {
	t.Helper()
	if delivery.PackID == "" || delivery.ContextText == "" || delivery.ItemCount == 0 {
		t.Fatalf("delivery = %+v, want persisted context pack", delivery)
	}
	if !strings.Contains(delivery.ContextText, "Setta semantic context pack "+delivery.PackID) {
		t.Fatalf("context text = %q, want stable context pack header", delivery.ContextText)
	}
	if !semanticContextTextContainsIncludedItems(delivery.ContextText) {
		t.Fatalf("context text = %q, want constraint, focus, and avoid warning", delivery.ContextText)
	}
	if strings.Contains(delivery.ContextText, "Avoided implementation detail") {
		t.Fatalf("context text = %q, want avoided lower-priority node excluded", delivery.ContextText)
	}
	if strings.Contains(delivery.ContextText, "Dismissed stale finding") {
		t.Fatalf("context text = %q, want dismissed node excluded", delivery.ContextText)
	}
}

func semanticContextTextContainsIncludedItems(text string) bool {
	return strings.Contains(text, "Required workspace constraint") &&
		strings.Contains(text, "Focus on associated finding") &&
		strings.Contains(text, "Avoid steering")
}

func assertCompilerPackAudit(t *testing.T, pack SemanticContextPackRecord, deliveredContext string) {
	t.Helper()
	if pack.AuthoredPromptHash == "" || pack.DeliveredContextHash == "" || pack.DeliveredContext != deliveredContext {
		t.Fatalf("pack audit = %+v, want authored/delivered hashes and delivered context", pack)
	}
	if pack.SourceRefs.WorkflowExecutionID != "execution_ctx" || pack.SourceRefs.WorkflowNodeExecutionID != "workflow_node_execution_ctx" {
		t.Fatalf("pack source refs = %+v, want workflow refs", pack.SourceRefs)
	}
	if len(pack.Items) == 0 || pack.Items[0].Priority != ContextPriorityRequired {
		t.Fatalf("pack items = %+v, want required item first", pack.Items)
	}
	if !contextPackItemsContain(pack.Items, ContextPackItemSteering, "steering_focus") {
		t.Fatalf("pack items = %+v, want focus steering item", pack.Items)
	}
}

func assertCompilerPackList(t *testing.T, list SemanticContextPackList, packID string) {
	t.Helper()
	if len(list.Packs) != 1 || list.Packs[0].ID != packID {
		t.Fatalf("context pack list = %+v, want persisted pack by workflow execution", list.Packs)
	}
}

func TestContextCompilerSkipsEmptyContextWithoutFakePack(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)

	delivery, err := service.CompileContext(context.Background(), semanticcontext.CompileRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    semanticcontext.TriggerWorkflowAgentStart,
		AuthoredPrompt: "Run with no semantic context.",
	})
	if err != nil {
		t.Fatalf("compile empty context: %v", err)
	}
	if delivery.ContextText != "" || delivery.PackID != "" {
		t.Fatalf("empty delivery = %+v, want no context pack", delivery)
	}
	history, err := service.ReadEventHistory(context.Background(), testWorkspaceID, "", 0, 10)
	if err != nil {
		t.Fatalf("read history: %v", err)
	}
	if len(history.Events) != 0 {
		t.Fatalf("history = %+v, want no fake context_pack.created event", history.Events)
	}
}

func TestContextCompilerFailsRequiredContextOverBudgetWithoutPersisting(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_required", nodeCreatedPayload{
		NodeID:  "node_required",
		Kind:    NodeKindConstraint,
		Label:   "Required context",
		Summary: strings.Repeat("required ", 40),
	})
	appendTestEvent(t, store, EventNodePromoted, "node_required", nodePromotedPayload{NodeID: "node_required"})

	_, err := service.CompileContext(context.Background(), semanticcontext.CompileRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    semanticcontext.TriggerWorkflowAgentStart,
		AuthoredPrompt: "Run with too little budget.",
		TokenBudget:    8,
	})
	if err == nil {
		t.Fatal("compile context succeeded, want required token budget error")
	}
	if !strings.Contains(err.Error(), "required semantic context item") {
		t.Fatalf("compile error = %v, want required item budget failure", err)
	}
	history, readErr := service.ReadEventHistory(context.Background(), testWorkspaceID, "", 0, 10)
	if readErr != nil {
		t.Fatalf("read history: %v", readErr)
	}
	for _, event := range history.Events {
		if event.EventType == EventContextPackCreated {
			t.Fatalf("history = %+v, want no context pack event after budget failure", history.Events)
		}
	}
}

func TestSemanticRetrievalRanksExplicitSourcesBeforeFTS(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_associated", nodeCreatedPayload{
		NodeID:  "node_associated",
		Kind:    NodeKindFinding,
		Label:   "Associated workflow finding",
		Summary: "This node is tied directly to the workflow execution.",
	})
	appendTestEvent(t, store, EventEvidenceAttached, "node_associated", evidenceAttachedPayload{
		AnchorID:            "evidence_associated",
		TargetEntityID:      "node_associated",
		SourceKind:          EvidenceSourceWorkflowExecution,
		SourceID:            "execution_retrieval",
		Summary:             "Workflow source evidence",
		WorkflowExecutionID: "execution_retrieval",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_keyword", nodeCreatedPayload{
		NodeID:  "node_keyword",
		Kind:    NodeKindDecision,
		Label:   "Keyword-only cache policy",
		Summary: "The keyword retrieval phrase appears here but has no source association.",
	})

	retrieval, err := service.retrieveSemanticContext(context.Background(), semanticRetrievalRequest{
		WorkspaceID: testWorkspaceID,
		SourceRefs:  SemanticContextSourceRefs{WorkflowExecutionID: "execution_retrieval"},
		Query:       "keyword retrieval phrase",
		Limit:       10,
	})
	if err != nil {
		t.Fatalf("retrieve semantic context: %v", err)
	}
	associatedIndex := retrievalResultIndex(retrieval.Results, semanticSearchRecordNode, "node_associated")
	keywordIndex := retrievalResultIndex(retrieval.Results, semanticSearchRecordNode, "node_keyword")
	if associatedIndex < 0 || keywordIndex < 0 {
		t.Fatalf("retrieval results = %+v, want associated and keyword nodes", retrieval.Results)
	}
	if associatedIndex > keywordIndex {
		t.Fatalf("retrieval order = %+v, want explicit source before FTS keyword hit", retrieval.Results)
	}
	if len(retrieval.Results[associatedIndex].Reasons) == 0 || !strings.Contains(strings.Join(retrieval.Results[associatedIndex].Reasons, " "), "explicit source") {
		t.Fatalf("associated result = %+v, want explicit source reason", retrieval.Results[associatedIndex])
	}
}

func TestSemanticRetrievalRebuildsStaleSearchRows(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_rebuild", nodeCreatedPayload{
		NodeID:  "node_rebuild",
		Kind:    NodeKindDecision,
		Label:   "Rebuildable search row",
		Summary: "A stale FTS index can be rebuilt from semantic projections.",
	})
	if _, err := store.db.ExecContext(context.Background(), "DELETE FROM semantic_search_fts"); err != nil {
		t.Fatalf("clear search index: %v", err)
	}
	missing, err := service.retrieveSemanticContext(context.Background(), semanticRetrievalRequest{
		WorkspaceID: testWorkspaceID,
		Query:       "stale FTS index",
		Limit:       10,
	})
	if err != nil {
		t.Fatalf("retrieve stale search: %v", err)
	}
	if retrievalResultIndex(missing.Results, semanticSearchRecordNode, "node_rebuild") >= 0 {
		t.Fatalf("retrieval results = %+v, want stale missing FTS row absent", missing.Results)
	}
	if err := store.RebuildSearchIndex(context.Background()); err != nil {
		t.Fatalf("rebuild search index: %v", err)
	}
	rebuilt, err := service.retrieveSemanticContext(context.Background(), semanticRetrievalRequest{
		WorkspaceID: testWorkspaceID,
		Query:       "stale FTS index",
		Limit:       10,
	})
	if err != nil {
		t.Fatalf("retrieve rebuilt search: %v", err)
	}
	if retrievalResultIndex(rebuilt.Results, semanticSearchRecordNode, "node_rebuild") < 0 {
		t.Fatalf("retrieval results = %+v, want rebuilt FTS row", rebuilt.Results)
	}
}

func TestContextCompilerUsesRetrievalForRelevantPromotedDecision(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_streaming_decision", nodeCreatedPayload{
		NodeID:  "node_streaming_decision",
		Kind:    NodeKindDecision,
		Label:   "Use semantic graph notifications",
		Summary: "Renderer surfaces should refetch after push-based semantic graph invalidation.",
	})
	appendTestEvent(t, store, EventNodePromoted, "node_streaming_decision", nodePromotedPayload{NodeID: "node_streaming_decision"})

	delivery, err := service.CompileContext(context.Background(), semanticcontext.CompileRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    semanticcontext.TriggerWorkflowAgentStart,
		AuthoredPrompt: "Investigate push-based semantic graph invalidation for renderer surfaces.",
		TokenBudget:    400,
	})
	if err != nil {
		t.Fatalf("compile retrieval context: %v", err)
	}
	if !strings.Contains(delivery.ContextText, "Use semantic graph notifications") ||
		!strings.Contains(delivery.ContextText, "FTS match") {
		t.Fatalf("context text = %q, want retrieval-backed promoted decision", delivery.ContextText)
	}
	pack, ok, err := service.ReadContextPack(context.Background(), testWorkspaceID, delivery.PackID)
	if err != nil {
		t.Fatalf("read context pack: %v", err)
	}
	if !ok || !contextPackItemsContain(pack.Items, ContextPackItemDecision, "node_streaming_decision") {
		t.Fatalf("context pack = %+v, want delivered promoted decision item", pack)
	}
	detail, ok, err := service.ReadNodeDetail(context.Background(), testWorkspaceID, "node_streaming_decision")
	if err != nil {
		t.Fatalf("read delivered node detail: %v", err)
	}
	if !ok ||
		detail.Usefulness.RetrievalUseCount != 1 ||
		detail.Usefulness.LastDeliveredInContextPackAt == "" ||
		detail.Usefulness.LastUserPromotedAt == "" ||
		semanticUsefulnessDiagnosticsContain(detail.Usefulness.Diagnostics, "unused_semantic_memory") {
		t.Fatalf("delivered node usefulness = %+v, want context-pack delivery tracking without unused diagnostic", detail.Usefulness)
	}
}

func TestContextCompilerRecordsSteeringDeltaContext(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_delta", nodeCreatedPayload{
		NodeID:  "node_delta",
		Kind:    NodeKindConstraint,
		Label:   "Preserve push updates",
		Summary: "Do not replace push updates with polling.",
	})
	appendTestEvent(t, store, EventSteeringCreated, "node_delta", steeringCreatedPayload{
		DirectiveID:        "steering_delta",
		TargetEntityID:     "node_delta",
		Kind:               SteeringKindFocus,
		Instruction:        "Focus this run on push-based invalidation.",
		Status:             SteeringStatusActive,
		Scope:              SteeringScopeRun,
		ChatRunID:          "chat_run_delta",
		ChatConversationID: "chat_conversation_delta",
	})

	delivery, err := service.CompileContext(context.Background(), semanticcontext.CompileRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    semanticcontext.TriggerSteering,
		AuthoredPrompt: "Apply the steering delta.",
		SourceRefs: semanticcontext.SourceRefs{
			ChatConversationID: "chat_conversation_delta",
			ChatRunID:          "chat_run_delta",
		},
		TokenBudget: 300,
	})
	if err != nil {
		t.Fatalf("compile steering context: %v", err)
	}
	if !strings.Contains(delivery.ContextText, "Focus this run on push-based invalidation.") {
		t.Fatalf("context text = %q, want steering delta instruction", delivery.ContextText)
	}
	pack, ok, err := service.ReadContextPack(context.Background(), testWorkspaceID, delivery.PackID)
	if err != nil {
		t.Fatalf("read steering context pack: %v", err)
	}
	if !ok || pack.TriggerKind != ContextTriggerSteering || !contextPackItemsContain(pack.Items, ContextPackItemSteering, "steering_delta") {
		t.Fatalf("context pack = %+v, want steering-triggered explicit delta", pack)
	}
}

func TestAvoidTargetIDsUseTypedSteeringKind(t *testing.T) {
	candidates := map[string]contextCandidate{
		"steering:avoid": {
			key:          "steering:avoid",
			steeringKind: SteeringKindAvoid,
			item: SemanticContextPackItem{
				Kind:           ContextPackItemSteering,
				SemanticNodeID: "node_avoid",
				ReasonIncluded: "typed steering warning",
			},
		},
		"steering:focus": {
			key:          "steering:focus",
			steeringKind: SteeringKindFocus,
			item: SemanticContextPackItem{
				Kind:           ContextPackItemSteering,
				SemanticNodeID: "node_focus",
				ReasonIncluded: "avoid appears in user-authored copy but is not the steering kind",
			},
		},
	}

	targets := avoidTargetIDs(candidates)
	if !targets["node_avoid"] {
		t.Fatalf("avoid targets = %+v, want typed avoid steering target", targets)
	}
	if targets["node_focus"] {
		t.Fatalf("avoid targets = %+v, want focus steering ignored even when reason text contains avoid", targets)
	}
}

func retrievalResultIndex(results []SemanticRetrievalResult, recordKind string, recordID string) int {
	for index, result := range results {
		if result.RecordKind == recordKind && result.RecordID == recordID {
			return index
		}
	}
	return -1
}

func seedCompilerGraph(t *testing.T, store *Store) {
	t.Helper()
	appendTestEvent(t, store, EventNodeCreated, "node_constraint", nodeCreatedPayload{
		NodeID:  "node_constraint",
		Kind:    NodeKindConstraint,
		Label:   "Required workspace constraint",
		Summary: "Always keep authored workflow prompts separate from semantic context.",
	})
	appendTestEvent(t, store, EventNodePromoted, "node_constraint", nodePromotedPayload{NodeID: "node_constraint"})
	appendTestEvent(t, store, EventNodeCreated, "node_finding", nodeCreatedPayload{
		NodeID:  "node_finding",
		Kind:    NodeKindFinding,
		Label:   "Associated finding",
		Summary: "The workflow execution is explicitly attached to this finding.",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_decision", nodeCreatedPayload{
		NodeID:  "node_decision",
		Kind:    NodeKindDecision,
		Label:   "Prior decision",
		Summary: "Use explicit semantic state only.",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_avoid", nodeCreatedPayload{
		NodeID:  "node_avoid",
		Kind:    NodeKindConcept,
		Label:   "Avoided implementation detail",
		Summary: "This lower-priority concept should be excluded by avoid steering.",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_dismissed", nodeCreatedPayload{
		NodeID: "node_dismissed",
		Kind:   NodeKindFinding,
		Label:  "Dismissed stale finding",
	})
	appendTestEvent(t, store, EventNodeDismissed, "node_dismissed", nodeDismissedPayload{NodeID: "node_dismissed"})
	appendTestEvent(t, store, EventEdgeCreated, "edge_finding_decision", edgeCreatedPayload{
		EdgeID:     "edge_finding_decision",
		Kind:       EdgeKindSupports,
		FromNodeID: "node_finding",
		ToNodeID:   "node_decision",
	})
	appendTestEvent(t, store, EventEvidenceAttached, "node_finding", evidenceAttachedPayload{
		AnchorID:                "evidence_execution",
		TargetEntityID:          "node_finding",
		SourceKind:              EvidenceSourceWorkflowExecution,
		SourceID:                "execution_ctx",
		Summary:                 "Workflow execution evidence",
		WorkflowDefinitionID:    "definition_ctx",
		WorkflowExecutionID:     "execution_ctx",
		WorkflowNodeID:          "workflow_node_ctx",
		WorkflowNodeExecutionID: "workflow_node_execution_ctx",
	})
	appendTestEvent(t, store, EventActivityStarted, "node_finding", activityStartedPayload{
		IntervalID:              "activity_execution",
		TargetEntityID:          "node_finding",
		Kind:                    ActivityKindExploring,
		Summary:                 "Exploring the attached workflow execution",
		SourceKind:              ActivitySourceWorkflowExecution,
		SourceID:                "execution_ctx",
		WorkflowDefinitionID:    "definition_ctx",
		WorkflowExecutionID:     "execution_ctx",
		WorkflowNodeID:          "workflow_node_ctx",
		WorkflowNodeExecutionID: "workflow_node_execution_ctx",
		ActorKind:               ActorKindAssistant,
		ActorID:                 "assistant_ctx",
	})
	appendTestEvent(t, store, EventEvidenceAttached, "node_avoid", evidenceAttachedPayload{
		AnchorID:       "evidence_avoid",
		TargetEntityID: "node_avoid",
		SourceKind:     EvidenceSourceDocument,
		SourceID:       "avoid_doc",
		Summary:        "Avoided evidence",
	})
	appendTestEvent(t, store, EventSteeringCreated, "node_constraint", steeringCreatedPayload{
		DirectiveID:    "steering_constraint",
		TargetEntityID: "node_constraint",
		Kind:           SteeringKindConstraint,
		Instruction:    "Keep semantic context auditable.",
		Status:         SteeringStatusActive,
		Scope:          SteeringScopeWorkspace,
	})
	appendTestEvent(t, store, EventSteeringCreated, "node_finding", steeringCreatedPayload{
		DirectiveID:    "steering_focus",
		TargetEntityID: "node_finding",
		Kind:           SteeringKindFocus,
		Instruction:    "Focus on associated finding.",
		Status:         SteeringStatusActive,
		Scope:          SteeringScopeWorkspace,
	})
	appendTestEvent(t, store, EventSteeringCreated, "node_avoid", steeringCreatedPayload{
		DirectiveID:    "steering_avoid",
		TargetEntityID: "node_avoid",
		Kind:           SteeringKindAvoid,
		Instruction:    "Avoid this implementation detail.",
		Status:         SteeringStatusActive,
		Scope:          SteeringScopeWorkspace,
	})
}

func contextPackItemsContain(items []SemanticContextPackItem, kind SemanticContextPackItemKind, id string) bool {
	for _, item := range items {
		if item.Kind != kind {
			continue
		}
		if item.SemanticNodeID == id || item.EvidenceAnchorID == id || item.ActivityIntervalID == id || item.SteeringDirectiveID == id {
			return true
		}
	}
	return false
}

func semanticUsefulnessDiagnosticsContain(diagnostics []SemanticNodeUsefulnessDiagnostic, code string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}
