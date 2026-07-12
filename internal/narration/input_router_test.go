package narration

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
)

func TestConversationInputRouterUsesBoundedNarratorContextAndCommitsAudit(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	before := readStatusServiceSnapshot(t, fixture)

	first := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-first", nil)
	second := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-second", nil)
	assertAcceptedFixtureRouterInputs(t, first, second)
	for index := 0; index < 2; index++ {
		processed, err := router.ProcessNext(context.Background(), fixture.conversationID)
		if err != nil || !processed {
			t.Fatalf("ProcessNext(%d) = %t, %v", index, processed, err)
		}
	}
	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || processed {
		t.Fatalf("empty ProcessNext = %t, %v", processed, err)
	}

	state := readFixtureRoutingState(t, fixture, second.Input.ID)
	assertFixtureConversationRoute(t, state, before)
	after := readStatusServiceSnapshot(t, fixture)
	assertFixtureConversationRouteIsolation(t, before, after)
	assertFixtureRouterProviderRequests(t, fixture.provider, 2)
}

func assertAcceptedFixtureRouterInputs(
	t *testing.T,
	first conversation.AcceptedConversationInput,
	second conversation.AcceptedConversationInput,
) {
	t.Helper()
	if first.Status != conversation.ConversationInputStatusAccepted ||
		second.Status != conversation.ConversationInputStatusAccepted {
		t.Fatalf("accepted router inputs = %+v %+v", first, second)
	}
}

func assertFixtureConversationRoute(
	t *testing.T,
	state conversation.ConversationInputRoutingState,
	before conversation.ConversationSnapshot,
) {
	t.Helper()
	if state.Input.Status != conversation.ConversationInputStatusDispatched || len(state.Decisions) != 1 {
		t.Fatalf("second routed input state = %+v", state)
	}
	record := state.Decisions[0]
	if record.Decision.Kind != conversation.ConversationRouteDecisionKindQueueParentTurn ||
		record.RouterContext == nil || record.ResolvedInvocation == nil {
		t.Fatalf("routed decision audit = %+v", record)
	}
	assertFixtureConversationRouteInvocation(t, record.ResolvedInvocation)
	assertFixtureConversationRouteContext(t, record.RouterContext, before)
}

func assertFixtureConversationRouteInvocation(t *testing.T, invocation *conversation.ResolvedInvocation) {
	t.Helper()
	if invocation.Role != conversation.RoleNarrator ||
		invocation.Resolved.ModelID != "gpt-5.4-mini" ||
		invocation.Resolved.PermissionProfile.ToolAccess.Mode != conversation.ToolAccessNone ||
		invocation.ContextUsage.InputBytes <= 0 || invocation.ContextUsage.OutputBytes <= 0 {
		t.Fatalf("router invocation audit = %+v", invocation)
	}
}

func assertFixtureConversationRouteContext(
	t *testing.T,
	audit *conversation.ConversationRouteContextAudit,
	before conversation.ConversationSnapshot,
) {
	t.Helper()
	if audit.PriorRouteDecisionCount != 1 ||
		audit.LatestTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		audit.IncludedTrajectoryRange == nil ||
		!conversationRouteDecisionKindIncluded(
			audit.AllowedDecisionKinds,
			conversation.ConversationRouteDecisionKindQueueParentTurn,
		) {
		t.Fatalf("router context audit = %+v", audit)
	}
}

func assertFixtureConversationRouteIsolation(
	t *testing.T,
	before conversation.ConversationSnapshot,
	after conversation.ConversationSnapshot,
) {
	t.Helper()
	if after.NarratorState.ObservedThroughSequence != before.NarratorState.ObservedThroughSequence ||
		after.NarratorState.CheckpointThroughSequence != before.NarratorState.CheckpointThroughSequence ||
		after.Conversation.LastTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		len(after.Turns.Turns) != len(before.Turns.Turns) {
		t.Fatalf("input routing advanced narrator or agent state: before=%+v after=%+v", before, after)
	}
}

func TestConversationInputRouterResolvesOneClarificationAndExcludesAnother(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	fixture.provider.routeKinds = []conversation.ConversationRouteDecisionKind{
		conversation.ConversationRouteDecisionKindClarify,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
	}
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	root := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-clarify", nil)

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("clarification ProcessNext = %t, %v", processed, err)
	}
	awaiting := readFixtureRoutingState(t, fixture, root.Input.ID)
	assertFixtureAwaitingConversationRouteClarification(t, awaiting)
	reply := submitFixtureRouteInput(
		t,
		inputService,
		fixture.conversationID,
		"input-route-clarification-reply",
		&root.Input.ID,
	)
	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("clarification reply ProcessNext = %t, %v", processed, err)
	}
	resolved := readFixtureRoutingState(t, fixture, root.Input.ID)
	assertFixtureResolvedConversationRouteClarification(t, resolved, reply)
	assertFixtureFinalConversationRouteClarificationAudit(t, resolved.Decisions[1].RouterContext, reply)
	fixture.provider.mu.Lock()
	requests := append([]agent.FreshStructuredCallRequest{}, fixture.provider.routeRequests...)
	fixture.provider.mu.Unlock()
	assertFixtureClarifiedConversationRouteContext(t, requests[1], reply)
}

func assertFixtureAwaitingConversationRouteClarification(
	t *testing.T,
	awaiting conversation.ConversationInputRoutingState,
) {
	t.Helper()
	if awaiting.Input.Status != conversation.ConversationInputStatusAwaitingClarification ||
		len(awaiting.Decisions) != 1 ||
		awaiting.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindClarify {
		t.Fatalf("awaiting clarification state = %+v", awaiting)
	}
}

func assertFixtureResolvedConversationRouteClarification(
	t *testing.T,
	resolved conversation.ConversationInputRoutingState,
	reply conversation.AcceptedConversationInput,
) {
	t.Helper()
	if resolved.Input.Status != conversation.ConversationInputStatusDispatched ||
		resolved.ClarificationReply == nil ||
		resolved.ClarificationReply.Input.ID != reply.Input.ID ||
		resolved.ClarificationReply.Status != conversation.ConversationInputStatusDispatched ||
		len(resolved.Decisions) != 2 ||
		resolved.Decisions[1].Decision.Kind != conversation.ConversationRouteDecisionKindSteerParentTurn {
		t.Fatalf("resolved clarification state = %+v", resolved)
	}
}

func assertFixtureFinalConversationRouteClarificationAudit(
	t *testing.T,
	finalAudit *conversation.ConversationRouteContextAudit,
	reply conversation.AcceptedConversationInput,
) {
	t.Helper()
	if finalAudit == nil || finalAudit.ClarificationInputSequence == nil ||
		*finalAudit.ClarificationInputSequence != reply.Sequence ||
		conversationRouteDecisionKindIncluded(
			finalAudit.AllowedDecisionKinds,
			conversation.ConversationRouteDecisionKindClarify,
		) {
		t.Fatalf("clarification final audit = %+v", finalAudit)
	}
}

func assertFixtureClarifiedConversationRouteContext(
	t *testing.T,
	request agent.FreshStructuredCallRequest,
	reply conversation.AcceptedConversationInput,
) {
	t.Helper()
	var finalContext ConversationRouteContextBundle
	if err := json.Unmarshal(request.Input, &finalContext); err != nil {
		t.Fatalf("decode clarified router context: %v", err)
	}
	if finalContext.Input.ClarificationQuestion == nil ||
		finalContext.Input.ClarificationReply == nil ||
		finalContext.Input.ClarificationReply.Text != reply.Input.Text ||
		conversationRouteDecisionKindIncluded(
			finalContext.AllowedDecisionKinds,
			conversation.ConversationRouteDecisionKindClarify,
		) {
		t.Fatalf("clarified provider context = %+v", finalContext)
	}
}

func TestConversationInputRouterPersistsInvalidOutputFailureAndRetriesExplicitly(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	fixture.provider.invalidRouteOutput = true
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	accepted := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-retry", nil)

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("failed ProcessNext = %t, %v", processed, err)
	}
	failed := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if failed.Input.Status != conversation.ConversationInputStatusFailed || failed.Input.Failure == nil ||
		!failed.Input.Failure.Retryable ||
		failed.Input.Failure.Code != "conversation_router_provider_output_invalid" ||
		len(failed.Decisions) != 0 {
		t.Fatalf("router failure state = %+v", failed)
	}
	fixture.provider.mu.Lock()
	fixture.provider.invalidRouteOutput = false
	fixture.provider.mu.Unlock()
	retriedAt := time.Now().UTC().Add(time.Second).Format(time.RFC3339Nano)
	if _, err := fixture.store.RetryConversationInputRouting(
		context.Background(),
		fixture.workspace.ID,
		fixture.conversationID,
		accepted.Input.ID,
		retriedAt,
	); err != nil {
		t.Fatalf("RetryConversationInputRouting: %v", err)
	}
	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("retried ProcessNext = %t, %v", processed, err)
	}
	recovered := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if recovered.Input.Status != conversation.ConversationInputStatusDispatched ||
		recovered.Input.RoutingAttempt != 2 || len(recovered.Decisions) != 1 {
		t.Fatalf("recovered router state = %+v", recovered)
	}
}

func TestConversationRouteOutputDecodesEveryAllowedStrictVariant(t *testing.T) {
	kinds := []conversation.ConversationRouteDecisionKind{
		conversation.ConversationRouteDecisionKindSendToParent,
		conversation.ConversationRouteDecisionKindQueueParentTurn,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
		conversation.ConversationRouteDecisionKindAnswerAsNarrator,
		conversation.ConversationRouteDecisionKindCreateSideConversation,
		conversation.ConversationRouteDecisionKindForkConversation,
		conversation.ConversationRouteDecisionKindEscalateToMaster,
		conversation.ConversationRouteDecisionKindClarify,
	}
	contextBundle := ConversationRouteContextBundle{
		Kind:                 ConversationRouteContextKind,
		AllowedDecisionKinds: kinds,
		ValidCompletedForkPoints: []conversation.ConversationRouterForkPoint{{
			TurnID: "completed-turn",
		}},
	}
	for _, kind := range kinds {
		t.Run(string(kind), func(t *testing.T) {
			output := map[string]any{"kind": string(kind)}
			switch kind {
			case conversation.ConversationRouteDecisionKindAnswerAsNarrator,
				conversation.ConversationRouteDecisionKindClarify:
				output["question"] = "What should happen next?"
			case conversation.ConversationRouteDecisionKindForkConversation:
				output["authoredInput"] = "Continue this as a durable child."
				output["forkedAtTurnId"] = "completed-turn"
				output["proposedTitle"] = "Durable child"
			default:
				output["authoredInput"] = "Continue the parent work."
			}
			raw, err := json.Marshal(map[string]any{"decision": output})
			if err != nil {
				t.Fatalf("marshal output: %v", err)
			}
			decision, err := decodeConversationRouteOutput(raw, contextBundle)
			if err != nil || decision.Kind != kind {
				t.Fatalf("decode %s = %+v, %v", kind, decision, err)
			}
		})
	}
	invalid := json.RawMessage(`{"decision":{"kind":"clarify","question":"Again?","extra":true}}`)
	if _, err := decodeConversationRouteOutput(invalid, contextBundle); err == nil {
		t.Fatal("conversation router accepted unknown output field")
	}
	assertConversationRouteOutputSchema(t, contextBundle)
}

func assertConversationRouteOutputSchema(t *testing.T, contextBundle ConversationRouteContextBundle) {
	t.Helper()
	raw, err := conversationRouteOutputSchema(contextBundle)
	if err != nil {
		t.Fatalf("conversationRouteOutputSchema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatalf("decode conversation route output schema: %v", err)
	}
	properties := schema["properties"].(map[string]any)
	decision := properties["decision"].(map[string]any)
	variants := decision["anyOf"].([]any)
	if schema["type"] != "object" || schema["additionalProperties"] != false ||
		len(properties) != 1 || len(variants) != len(contextBundle.AllowedDecisionKinds) {
		t.Fatalf("conversation route output schema is not a strict bounded union: %+v", schema)
	}
	for _, rawVariant := range variants {
		variant := rawVariant.(map[string]any)
		variantProperties := variant["properties"].(map[string]any)
		if variant["type"] != "object" || variant["additionalProperties"] != false ||
			len(variant["required"].([]any)) != len(variantProperties) {
			t.Fatalf("conversation route output variant is not strict: %+v", variant)
		}
	}
}

func TestSanitizeConversationRouteTrajectoryRemovesProviderAuthority(t *testing.T) {
	providerEventID := "provider-event-secret"
	providerThreadID := "provider-thread-secret"
	providerTurnID := "provider-turn-secret"
	processID := "provider-process-secret"
	event := conversation.TrajectoryEvent{
		ProviderEventID:  &providerEventID,
		ProviderThreadID: &providerThreadID,
		ProviderTurnID:   &providerTurnID,
		TurnStarted: &conversation.TrajectoryTurnStarted{Invocation: conversation.ResolvedInvocation{
			ProviderReferences: conversation.InvocationProviderReferences{
				ThreadID: &providerThreadID,
				TurnID:   &providerTurnID,
			},
		}},
		AgentPublicTextDelta: &conversation.TrajectoryAgentPublicTextDelta{
			ProviderItemID: "provider-item-text-secret",
		},
		AgentMessageCompleted: &conversation.TrajectoryAgentMessageCompleted{
			ProviderItemID: "provider-item-message-secret",
		},
		PublicReasoningSummaryUpdated: &conversation.TrajectoryPublicReasoningSummaryUpdated{
			ProviderItemID: "provider-item-reasoning-secret",
		},
		ActivityStarted: &conversation.TrajectoryActivityStarted{Activity: conversation.TrajectoryActivity{
			ProcessID: &processID,
		}},
		ActivityCompleted: &conversation.TrajectoryActivityCompleted{Activity: conversation.TrajectoryActivity{
			ProcessID: &processID,
		}},
		ActivityFailed: &conversation.TrajectoryActivityFailed{Activity: conversation.TrajectoryActivity{
			ProcessID: &processID,
		}},
		FileChangeProposed: &conversation.TrajectoryFileChangeProposed{
			ProviderItemID: "provider-item-file-proposed-secret",
		},
		FileChangeCompleted: &conversation.TrajectoryFileChangeCompleted{
			ProviderItemID: "provider-item-file-completed-secret",
		},
		ApprovalRequested: &conversation.TrajectoryApprovalRequested{Approval: conversation.TrajectoryApprovalRequest{
			ProviderItemID: "provider-item-approval-secret",
		}},
		SubagentStarted: &conversation.TrajectorySubagentStarted{Subagent: conversation.Subagent{
			ProviderThreadID: "provider-subagent-started-secret",
		}},
		SubagentUpdated: &conversation.TrajectorySubagentUpdated{Subagent: conversation.Subagent{
			ProviderThreadID: "provider-subagent-updated-secret",
		}},
		SubagentCompleted: &conversation.TrajectorySubagentCompleted{Subagent: conversation.Subagent{
			ProviderThreadID: "provider-subagent-completed-secret",
		}},
	}

	encoded, err := json.Marshal(sanitizeConversationRouteTrajectory(event))
	if err != nil {
		t.Fatalf("marshal sanitized route trajectory: %v", err)
	}
	for _, forbidden := range []string{
		providerEventID,
		providerThreadID,
		providerTurnID,
		processID,
		"provider-item-text-secret",
		"provider-item-message-secret",
		"provider-item-reasoning-secret",
		"provider-item-file-proposed-secret",
		"provider-item-file-completed-secret",
		"provider-item-approval-secret",
		"provider-subagent-started-secret",
		"provider-subagent-updated-secret",
		"provider-subagent-completed-secret",
	} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("sanitized router trajectory leaked %q: %s", forbidden, encoded)
		}
	}
	if event.ActivityStarted.Activity.ProcessID == nil ||
		event.TurnStarted.Invocation.ProviderReferences.ThreadID == nil {
		t.Fatal("router trajectory sanitization mutated the authoritative event")
	}
}

func configuredFixtureInputRouter(router *ConversationInputRouter) *ConversationInputRouter {
	counters := map[string]int{}
	router.newID = func(prefix string) (string, error) {
		counters[prefix]++
		return fmt.Sprintf("%s-%d", prefix, counters[prefix]), nil
	}
	return router
}

func fixtureInputService(t *testing.T, store *conversation.Store) *conversation.InputService {
	t.Helper()
	service, err := conversation.NewInputService(store)
	if err != nil {
		t.Fatalf("NewInputService: %v", err)
	}
	return service
}

func submitFixtureRouteInput(
	t *testing.T,
	service *conversation.InputService,
	conversationID string,
	inputID string,
	replyTo *string,
) conversation.AcceptedConversationInput {
	t.Helper()
	text := "Queue this after the active work."
	if replyTo != nil {
		text = "Steer the active turn with the update."
	}
	accepted, err := service.SubmitInput(context.Background(), conversation.ConversationInput{
		ID:             inputID,
		ConversationID: conversationID,
		ReplyToInputID: replyTo,
		Text:           text,
		Modality:       conversation.ConversationInputModalityText,
		RequestedMode:  conversation.ConversationInputModeRoute,
		SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("SubmitInput(%s): %v", inputID, err)
	}
	return accepted
}

func readFixtureRoutingState(
	t *testing.T,
	fixture statusServiceFixture,
	inputID string,
) conversation.ConversationInputRoutingState {
	t.Helper()
	state, err := fixture.store.ReadConversationInputRoutingState(
		context.Background(),
		fixture.workspace.ID,
		fixture.conversationID,
		inputID,
	)
	if err != nil {
		t.Fatalf("ReadConversationInputRoutingState(%s): %v", inputID, err)
	}
	return state
}

func assertFixtureRouterProviderRequests(
	t *testing.T,
	provider *statusServiceAgentRuntime,
	want int,
) {
	t.Helper()
	provider.mu.Lock()
	requests := append([]agent.FreshStructuredCallRequest{}, provider.routeRequests...)
	provider.mu.Unlock()
	if len(requests) != want {
		t.Fatalf("router provider requests = %d, want %d", len(requests), want)
	}
	for _, request := range requests {
		if request.Invocation.PermissionMode != agent.PermissionModeReadOnly ||
			request.Invocation.ApprovalMode != agent.ApprovalModeNever || request.OutputSchema == nil {
			t.Fatalf("router provider authority = %+v", request)
		}
		input := string(request.Input)
		for _, forbidden := range []string{"provider-primary-thread", "provider-primary-turn"} {
			if strings.Contains(input, forbidden) {
				t.Fatalf("router context leaked provider reference %q: %s", forbidden, input)
			}
		}
	}
}
