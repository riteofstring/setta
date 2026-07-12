package master

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestRouteOutputDecodesEveryStrictAuthorizedDecision(t *testing.T) {
	context := fullTestRouteContext()
	tests := []struct {
		kind RouteDecisionKind
		raw  string
	}{
		{RouteDecisionKindSendToAgent, `{"decision":{"kind":"send_to_agent","conversationId":"conversation-alpha","authoredInput":"Continue the implementation."}}`},
		{RouteDecisionKindQueueAgentTurn, `{"decision":{"kind":"queue_agent_turn","conversationId":"conversation-alpha","authoredInput":"Run the next verification afterward."}}`},
		{RouteDecisionKindSteerActiveTurn, `{"decision":{"kind":"steer_active_turn","conversationId":"conversation-alpha","authoredInput":"Use the strict contract instead."}}`},
		{RouteDecisionKindAskNarrator, `{"decision":{"kind":"ask_narrator","conversationId":"conversation-alpha","question":"What is the current status?"}}`},
		{RouteDecisionKindFocusConversation, `{"decision":{"kind":"focus_conversation","conversationId":"conversation-alpha"}}`},
		{RouteDecisionKindCreateConversation, `{"decision":{"kind":"create_conversation","workspaceId":"workspace-alpha","initialInput":"Build the indexed view.","proposedTitle":"Indexed view"}}`},
		{RouteDecisionKindCreateSideConversation, `{"decision":{"kind":"create_side_conversation","parentConversationId":"conversation-alpha","input":"Investigate this tangent."}}`},
		{RouteDecisionKindForkConversation, `{"decision":{"kind":"fork_conversation","parentConversationId":"conversation-alpha","forkedAtTurnId":"turn-completed","input":"Continue from this checkpoint."}}`},
		{RouteDecisionKindClarify, `{"decision":{"kind":"clarify","question":"Should this preserve or steer the active turn?"}}`},
		{RouteDecisionKindAnswerGlobal, `{"decision":{"kind":"answer_global","text":"The master router is ready."}}`},
	}
	for _, test := range tests {
		t.Run(string(test.kind), func(t *testing.T) {
			decision, err := decodeRouteOutput(json.RawMessage(test.raw), context)
			if err != nil {
				t.Fatalf("decodeRouteOutput: %v", err)
			}
			if decision.Kind != test.kind {
				t.Fatalf("decision kind = %s, want %s", decision.Kind, test.kind)
			}
			if err := decision.Validate(); err != nil {
				t.Fatalf("decision validation: %v", err)
			}
		})
	}
}

func TestRouteOutputRejectsInventedAuthorityAndMalformedJSON(t *testing.T) {
	context := routeContextWithTwoForkTargets()
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "invented conversation",
			raw:  `{"decision":{"kind":"focus_conversation","conversationId":"conversation-invented"}}`,
			want: "authoritative context",
		},
		{
			name: "invented workspace",
			raw:  `{"decision":{"kind":"create_conversation","workspaceId":"workspace-invented","initialInput":"Do work.","proposedTitle":"Work"}}`,
			want: "not active",
		},
		{
			name: "wrong fork parent",
			raw:  `{"decision":{"kind":"fork_conversation","parentConversationId":"conversation-beta","forkedAtTurnId":"turn-completed","input":"Continue."}}`,
			want: "unavailable",
		},
		{
			name: "unknown command field",
			raw:  `{"decision":{"kind":"focus_conversation","conversationId":"conversation-alpha","rendererCommand":"open-pane"}}`,
			want: "unknown field",
		},
		{
			name: "multiple values",
			raw:  `{"decision":{"kind":"answer_global","text":"One"}} {"decision":{"kind":"answer_global","text":"Two"}}`,
			want: "exactly one",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := decodeRouteOutput(json.RawMessage(test.raw), context)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("decode error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestRouteOutputSchemaBindsForkPointsToTheirAuthorizedParent(t *testing.T) {
	variants, err := routeForkDecisionOutputSchemas(routeContextWithTwoForkTargets().ConversationTargets)
	if err != nil {
		t.Fatalf("routeForkDecisionOutputSchemas: %v", err)
	}
	if len(variants) != 2 {
		t.Fatalf("fork schema variants = %d, want 2", len(variants))
	}
	wantTurns := map[string]string{
		"conversation-alpha": "turn-completed",
		"conversation-beta":  "turn-beta",
	}
	for _, rawVariant := range variants {
		variant, ok := rawVariant.(map[string]any)
		if !ok {
			t.Fatalf("fork schema variant = %T, want object", rawVariant)
		}
		properties, ok := variant["properties"].(map[string]any)
		if !ok {
			t.Fatalf("fork schema properties = %T", variant["properties"])
		}
		parent := onlySchemaEnumString(t, properties["parentConversationId"])
		turn := onlySchemaEnumString(t, properties["forkedAtTurnId"])
		if wantTurns[parent] != turn {
			t.Fatalf("fork schema paired parent %q with turn %q", parent, turn)
		}
	}
}

func TestRouteOutputSchemaContainsOnlyAuthorizedSettaReferences(t *testing.T) {
	schema, err := routeOutputSchema(fullTestRouteContext())
	if err != nil {
		t.Fatalf("routeOutputSchema: %v", err)
	}
	for _, forbidden := range [][]byte{
		[]byte("providerThreadId"),
		[]byte("providerTurnId"),
		[]byte("endpoint"),
		[]byte("rendererCommand"),
		[]byte("filesystem"),
	} {
		if bytes.Contains(schema, forbidden) {
			t.Fatalf("schema exposes forbidden authority %q: %s", forbidden, schema)
		}
	}
	for _, required := range [][]byte{
		[]byte(`"conversation-alpha"`),
		[]byte(`"workspace-alpha"`),
		[]byte(`"turn-completed"`),
		[]byte(`focus, show, open, or bring up`),
		[]byte(`"additionalProperties":false`),
	} {
		if !bytes.Contains(schema, required) {
			t.Fatalf("schema misses %q: %s", required, schema)
		}
	}
}

func TestRouteContextMaterializationRejectsProviderInputAndAuditDrift(t *testing.T) {
	bundle := fullTestRouteContext()
	materialized, err := freezeRouteContext(bundle, 1024*1024)
	if err != nil {
		t.Fatalf("freeze route context: %v", err)
	}

	driftedInput := materialized
	driftedInput.Input = json.RawMessage(`{"kind":"master_route"}`)
	if err := driftedInput.Validate(); err == nil || !strings.Contains(err.Error(), "provider input differs") {
		t.Fatalf("provider input drift error = %v", err)
	}

	driftedAudit := materialized
	driftedAudit.Audit.PriorDecisionCount++
	if err := driftedAudit.Validate(); err == nil || !strings.Contains(err.Error(), "audit differs") {
		t.Fatalf("context audit drift error = %v", err)
	}
}

func fullTestRouteContext() RouteContextBundle {
	input := MasterInput{
		ID:          "master-input",
		Text:        "Route this request.",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-13T18:00:00Z",
	}
	targetKinds := []RouteDecisionKind{
		RouteDecisionKindSendToAgent,
		RouteDecisionKindQueueAgentTurn,
		RouteDecisionKindSteerActiveTurn,
		RouteDecisionKindAskNarrator,
		RouteDecisionKindFocusConversation,
		RouteDecisionKindCreateSideConversation,
		RouteDecisionKindForkConversation,
	}
	context := RouteContextBundle{
		Kind:      RouteContextKind,
		Task:      routeTaskContext(),
		SessionID: "master-session",
		Input: AcceptedMasterInput{
			Sequence:      1,
			Input:         input,
			ReplyDelivery: ReplyDeliveryForInput(input),
			AcceptedAt:    "2026-07-13T18:00:01Z",
		},
		Retrieval:            RouteRetrievalContext{Query: "route request"},
		OpenWorkspaces:       []RouteWorkspaceContext{{WorkspaceID: "workspace-alpha", WorkspaceName: "Alpha"}},
		Focus:                RouteFocusContext{},
		Candidates:           []RouteCandidateContext{},
		ConversationTargets:  []RouteConversationTarget{{ConversationID: "conversation-alpha", WorkspaceID: "workspace-alpha", Title: "Alpha", Status: "working", OpenPaneIDs: []string{"pane-alpha"}, OpenPaneCount: 1, CompletedForkPoints: []RouteForkPoint{{TurnID: "turn-completed", InputExcerpt: "Initial work", CompletedAt: "2026-07-13T18:00:02Z"}}, AllowedDecisionKinds: targetKinds}},
		RecentRouteDecisions: []RouteDecisionSummary{},
		AllowedDecisionKinds: []RouteDecisionKind{},
	}
	context.AllowedDecisionKinds = routeContextAllowedDecisionKinds(
		[]string{"workspace-alpha"},
		context.ConversationTargets,
	)
	return context
}

func routeContextWithTwoForkTargets() RouteContextBundle {
	context := fullTestRouteContext()
	context.ConversationTargets = append(context.ConversationTargets, RouteConversationTarget{
		ConversationID:      "conversation-beta",
		WorkspaceID:         "workspace-alpha",
		Title:               "Beta",
		Status:              "idle",
		OpenPaneIDs:         []string{},
		CompletedForkPoints: []RouteForkPoint{{TurnID: "turn-beta", InputExcerpt: "Beta work", CompletedAt: "2026-07-13T18:00:03Z"}},
		AllowedDecisionKinds: []RouteDecisionKind{
			RouteDecisionKindFocusConversation,
			RouteDecisionKindForkConversation,
		},
	})
	return context
}

func onlySchemaEnumString(t *testing.T, raw any) string {
	t.Helper()
	schema, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("schema = %T, want object", raw)
	}
	values, ok := schema["enum"].([]string)
	if !ok || len(values) != 1 {
		t.Fatalf("schema enum = %#v, want one string", schema["enum"])
	}
	return values[0]
}
