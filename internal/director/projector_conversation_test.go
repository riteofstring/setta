package director

import (
	"encoding/json"
	"testing"

	"setta/internal/conversation"
)

func directorLaneEntry(
	id string,
	kind conversation.DirectorConversationEntryKind,
	recordedAt string,
) conversation.DirectorConversationEntry {
	return conversation.DirectorConversationEntry{
		ID:         id,
		Kind:       kind,
		TurnID:     "director-intent-1",
		RecordedAt: recordedAt,
	}
}

// directorLaneTurn is one whole Director turn: the request, the Setta tool it
// called, what that call reported, and the reply.
func directorLaneTurn(callSucceeded bool) []conversation.DirectorConversationEntry {
	request := directorLaneEntry("entry-request", conversation.DirectorConversationUserTurn, "2026-07-25T12:00:00Z")
	request.Text = &conversation.DirectorConversationText{Text: "start a parser rewrite in setta"}

	call := directorLaneEntry("entry-call", conversation.DirectorConversationToolCall, "2026-07-25T12:00:01Z")
	call.Tool = &conversation.DirectorConversationToolActivity{
		Tool:    "create_workstream",
		Payload: json.RawMessage(`{"title":"Parser rewrite"}`),
	}

	callID := call.ID
	receipt := directorLaneEntry("entry-receipt", conversation.DirectorConversationToolReceipt, "2026-07-25T12:00:02Z")
	summary := "Started the workstream \"Parser rewrite\"."
	if !callSucceeded {
		summary = "Setta refused this call: no such workspace."
	}
	receipt.Tool = &conversation.DirectorConversationToolActivity{
		Tool:      "create_workstream",
		Payload:   json.RawMessage(`{"tool":"create_workstream","summary":` + quoteJSON(summary) + `}`),
		Succeeded: callSucceeded,
		CallID:    &callID,
	}

	reply := directorLaneEntry("entry-reply", conversation.DirectorConversationAssistantText, "2026-07-25T12:00:03Z")
	reply.Text = &conversation.DirectorConversationText{
		Text: "Started it in setta.",
		Model: &conversation.DirectorConversationModel{
			Provider: conversation.ProviderCodex,
			Model:    "gpt-test",
		},
	}
	return []conversation.DirectorConversationEntry{request, call, receipt, reply}
}

func quoteJSON(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(encoded)
}

func projectDirectorLane(
	t *testing.T,
	entries []conversation.DirectorConversationEntry,
) *DirectorGraphProjector {
	t.Helper()
	projector := NewDirectorGraphProjector()
	for index := range entries {
		entry := entries[index]
		if err := projector.Apply(ProjectorEvent{
			Sequence:             index + 1,
			DirectorConversation: &entry,
		}); err != nil {
			t.Fatalf("apply director conversation entry %s: %v", entry.ID, err)
		}
	}
	return projector
}

func laneNode(t *testing.T, projector *DirectorGraphProjector, identity SemanticNodeIdentity, sourceID string) SemanticNode {
	t.Helper()
	nodeID, err := SemanticNodeID(identity, sourceID)
	if err != nil {
		t.Fatalf("SemanticNodeID: %v", err)
	}
	index, exists := projector.lane.nodeIndex[nodeID]
	if !exists {
		t.Fatalf("the director lane holds no node %q: %+v", nodeID, projector.lane.nodes)
	}
	return projector.lane.nodes[index]
}

func laneFollowedBy(
	t *testing.T,
	projector *DirectorGraphProjector,
	fromIdentity SemanticNodeIdentity,
	fromSourceID string,
	toIdentity SemanticNodeIdentity,
	toSourceID string,
) bool {
	t.Helper()
	from, err := SemanticNodeID(fromIdentity, fromSourceID)
	if err != nil {
		t.Fatalf("from SemanticNodeID: %v", err)
	}
	to, err := SemanticNodeID(toIdentity, toSourceID)
	if err != nil {
		t.Fatalf("to SemanticNodeID: %v", err)
	}
	for _, edge := range projector.lane.edges {
		if edge.Kind == SemanticEdgeFollowedBy &&
			edge.FromNodeID == from &&
			edge.ToNodeID == to {
			return true
		}
	}
	return false
}

// TestDirectorTurnIsProjectedIntoItsOwnLane proves the Director's conversation
// is real graph state: the request, the tool it called, the receipt that
// resolved the call, and the reply are all drawn, in the order they happened,
// in a scope that is not a workstream.
func TestDirectorTurnIsProjectedIntoItsOwnLane(t *testing.T) {
	projector := projectDirectorLane(t, directorLaneTurn(true))

	if len(projector.Projection().WorkstreamIDs) != 0 {
		t.Fatalf("the Director lane was admitted as a workstream: %+v", projector.Projection().WorkstreamIDs)
	}
	graph, err := projector.GraphFor(DirectorLaneID, WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("GraphFor the director lane: %v", err)
	}
	if len(graph.Nodes) != 3 {
		t.Fatalf("director lane nodes = %+v, want the request, the call, and the reply", graph.Nodes)
	}

	request := laneNode(t, projector, SemanticNodeIdentityDirectorTurn, "entry-request")
	if request.Kind != SemanticNodeUserGoal || request.Actor != SemanticActorUser {
		t.Fatalf("director request node = %q/%q", request.Kind, request.Actor)
	}
	if request.PublicSummary != "start a parser rewrite in setta" {
		t.Fatalf("director request summary = %q, want the user's own words", request.PublicSummary)
	}
	if request.Status != SemanticNodeStatusSucceeded {
		t.Fatalf("an answered request is still %q", request.Status)
	}

	call := laneNode(t, projector, SemanticNodeIdentityToolCall, "entry-call")
	if call.Kind != SemanticNodeAction || call.Actor != SemanticActorDirector {
		t.Fatalf("director tool call node = %q/%q", call.Kind, call.Actor)
	}
	if call.Status != SemanticNodeStatusSucceeded {
		t.Fatalf("an answered tool call is still %q", call.Status)
	}
	if call.PublicSummary != "Started the workstream \"Parser rewrite\"." {
		t.Fatalf("tool call summary = %q, want the receipt's own account", call.PublicSummary)
	}

	reply := laneNode(t, projector, SemanticNodeIdentityDirectorReply, "entry-reply")
	if reply.EvidenceClass != EvidenceDirectorInterpretation || reply.Interpretation == nil {
		t.Fatalf("the Director's reply is not attributable: %+v", reply)
	}
	if reply.Interpretation.Model.Model != "gpt-test" ||
		reply.Interpretation.Model.Provider != string(conversation.ProviderCodex) {
		t.Fatalf("reply attribution = %+v", reply.Interpretation.Model)
	}
	if err := ValidateWorkstreamGraph(graph, projector.liveAuthority()); err != nil {
		t.Fatalf("the director lane graph is invalid: %v", err)
	}
}

// TestRefusedDirectorToolCallFailsItsNode proves a call Setta refused is drawn
// as failed and labelled with Setta's own reason, so the canvas cannot show a
// refusal as work that happened.
func TestRefusedDirectorToolCallFailsItsNode(t *testing.T) {
	projector := projectDirectorLane(t, directorLaneTurn(false))

	call := laneNode(t, projector, SemanticNodeIdentityToolCall, "entry-call")
	if call.Status != SemanticNodeStatusFailed {
		t.Fatalf("a refused call is %q", call.Status)
	}
	if call.PublicSummary != "Setta refused this call: no such workspace." {
		t.Fatalf("refused call summary = %q", call.PublicSummary)
	}
}

// TestDirectorRequestStaysOpenUntilTheTurnEnds proves a turn that acted without
// replying does not claim to still be in progress once the next request arrives.
func TestDirectorRequestStaysOpenUntilTheTurnEnds(t *testing.T) {
	turn := directorLaneTurn(true)
	acted := turn[:3]
	projector := projectDirectorLane(t, acted)
	if request := laneNode(t, projector, SemanticNodeIdentityDirectorTurn, "entry-request"); request.Status != SemanticNodeStatusActive {
		t.Fatalf("an unanswered request is already %q", request.Status)
	}

	next := directorLaneEntry("entry-request-2", conversation.DirectorConversationUserTurn, "2026-07-25T12:01:00Z")
	next.TurnID = "director-intent-2"
	next.Text = &conversation.DirectorConversationText{Text: "what happened?"}
	if err := projector.Apply(ProjectorEvent{Sequence: len(acted) + 1, DirectorConversation: &next}); err != nil {
		t.Fatalf("apply the next request: %v", err)
	}

	if request := laneNode(t, projector, SemanticNodeIdentityDirectorTurn, "entry-request"); request.Status != SemanticNodeStatusSucceeded {
		t.Fatalf("a finished request is still %q", request.Status)
	}
	if next := laneNode(t, projector, SemanticNodeIdentityDirectorTurn, "entry-request-2"); next.Status != SemanticNodeStatusActive {
		t.Fatalf("the current request is %q", next.Status)
	}
}

// TestDirectorToolReceiptRequiresItsCall proves a receipt cannot resolve work
// the conversation never recorded.
func TestDirectorToolReceiptRequiresItsCall(t *testing.T) {
	turn := directorLaneTurn(true)
	projector := NewDirectorGraphProjector()
	request := turn[0]
	if err := projector.Apply(ProjectorEvent{Sequence: 1, DirectorConversation: &request}); err != nil {
		t.Fatalf("apply the request: %v", err)
	}
	receipt := turn[2]
	err := projector.Apply(ProjectorEvent{Sequence: 2, DirectorConversation: &receipt})
	if err == nil {
		t.Fatal("a receipt resolved a call that was never recorded")
	}
}

// TestDirectorToolReceiptDoesNotRewindTheLane proves resolving an earlier call
// does not make the reply skip durable work the handler committed before the
// receipt. This is the production create order: request, call, decision,
// workstream record, receipt, reply.
func TestDirectorToolReceiptDoesNotRewindTheLane(t *testing.T) {
	turn := directorLaneTurn(true)
	projector := NewDirectorGraphProjector()
	for index := 0; index < 2; index++ {
		entry := turn[index]
		if err := projector.Apply(ProjectorEvent{
			Sequence:             index + 1,
			DirectorConversation: &entry,
		}); err != nil {
			t.Fatalf("apply director entry %s: %v", entry.ID, err)
		}
	}
	target := "workstream:conversation-created"
	decision := DirectorFactEvent{
		ID:        "decision-create",
		EmittedAt: "2026-07-25T12:00:01.5Z",
		Kind:      DirectorFactDecisionCommitted,
		Actor:     SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:             DirectorDecisionCreateWorkstream,
			IntentID:             "director-intent-1",
			PublicSummary:        "Started the workstream \"Parser rewrite\".",
			TargetWorkstreamID:   &target,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceRequired),
		},
	}
	if err := projector.Apply(ProjectorEvent{Sequence: 3, Director: &decision}); err != nil {
		t.Fatalf("apply create decision: %v", err)
	}
	for index := 2; index < len(turn); index++ {
		entry := turn[index]
		if err := projector.Apply(ProjectorEvent{
			Sequence:             index + 2,
			DirectorConversation: &entry,
		}); err != nil {
			t.Fatalf("apply director entry %s: %v", entry.ID, err)
		}
	}

	for _, edge := range []struct {
		fromIdentity SemanticNodeIdentity
		fromSource   string
		toIdentity   SemanticNodeIdentity
		toSource     string
	}{
		{SemanticNodeIdentityDirectorTurn, "entry-request", SemanticNodeIdentityToolCall, "entry-call"},
		{SemanticNodeIdentityToolCall, "entry-call", SemanticNodeIdentityDecision, "decision-create"},
		{SemanticNodeIdentityDecision, "decision-create", SemanticNodeIdentityDirectorReply, "entry-reply"},
	} {
		if !laneFollowedBy(
			t,
			projector,
			edge.fromIdentity,
			edge.fromSource,
			edge.toIdentity,
			edge.toSource,
		) {
			t.Fatalf(
				"director lane omitted followed_by %s:%s -> %s:%s: %+v",
				edge.fromIdentity,
				edge.fromSource,
				edge.toIdentity,
				edge.toSource,
				projector.lane.edges,
			)
		}
	}
	if laneFollowedBy(
		t,
		projector,
		SemanticNodeIdentityToolCall,
		"entry-call",
		SemanticNodeIdentityDirectorReply,
		"entry-reply",
	) {
		t.Fatalf("the receipt rewound the reply around the decision: %+v", projector.lane.edges)
	}
}

func TestDirectorToolReceiptMustMatchOneUnresolvedCall(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		mutate func(*conversation.DirectorConversationEntry)
	}{
		{
			name: "turn",
			mutate: func(entry *conversation.DirectorConversationEntry) {
				entry.TurnID = "director-intent-other"
			},
		},
		{
			name: "tool",
			mutate: func(entry *conversation.DirectorConversationEntry) {
				entry.Tool.Tool = "rename_workstream"
			},
		},
		{
			name: "payload tool",
			mutate: func(entry *conversation.DirectorConversationEntry) {
				entry.Tool.Payload = json.RawMessage(
					`{"tool":"rename_workstream","summary":"Renamed it."}`,
				)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			turn := directorLaneTurn(true)
			projector := projectDirectorLane(t, turn[:2])
			receipt := turn[2]
			testCase.mutate(&receipt)
			if err := projector.Apply(ProjectorEvent{
				Sequence:             3,
				DirectorConversation: &receipt,
			}); err == nil {
				t.Fatalf("a receipt with mismatched %s resolved the call", testCase.name)
			}
		})
	}

	turn := directorLaneTurn(true)
	projector := projectDirectorLane(t, turn[:3])
	duplicate := turn[2]
	duplicate.ID = "entry-receipt-duplicate"
	duplicate.RecordedAt = "2026-07-25T12:00:02.5Z"
	if err := projector.Apply(ProjectorEvent{
		Sequence:             4,
		DirectorConversation: &duplicate,
	}); err == nil {
		t.Fatal("a second receipt resolved the same call")
	}
}
