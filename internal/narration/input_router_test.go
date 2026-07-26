package narration

import (
	"context"
	"encoding/json"
	"errors"
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
	if record.Decision.Kind != conversation.ConversationRouteDecisionKindQueueParentTurn {
		t.Fatalf("routed decision audit = %+v", record)
	}
	assertFixtureConversationRouteInvocation(t, record.ResolvedInvocation)
	assertFixtureConversationRouteContext(t, record.RouterContext, before)
}

func assertFixtureConversationRouteInvocation(t *testing.T, invocation conversation.ResolvedInvocation) {
	t.Helper()
	if invocation.Role != conversation.RoleNarrator ||
		invocation.Resolved.ModelID != "gpt-5.4-mini" ||
		invocation.Resolved.PermissionProfile.ToolAccess.Mode != conversation.ToolAccessNone {
		t.Fatalf("router invocation audit = %+v", invocation)
	}
}

func assertFixtureConversationRouteContext(
	t *testing.T,
	audit conversation.ConversationRouteContextAudit,
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

func TestConversationInputRouterDispatchesBlankConversationWithoutModelRouting(t *testing.T) {
	fixture := newBlankStatusServiceFixture(t)
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	accepted, err := inputService.SubmitInput(context.Background(), conversation.ConversationInput{
		ID:             "input-route-blank",
		ConversationID: fixture.conversationID,
		Text:           "Count the lines of code and break them down by language.",
		Modality:       conversation.ConversationInputModalityVoice,
		SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("SubmitInput: %v", err)
	}

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("ProcessNext = %t, %v", processed, err)
	}
	state := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if state.Input.Status != conversation.ConversationInputStatusDispatched ||
		len(state.Decisions) != 1 ||
		state.Decisions[0].RouterContext.DecisionAuthority != conversation.ConversationRouteDecisionAuthorityProductInvariant ||
		state.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindSendToParent ||
		state.Decisions[0].ResultingCommand.SendToParent.AuthoredInput.Text != accepted.Input.Text ||
		state.Decisions[0].ResolvedInvocation.Resolved.ModelID != "product-invariant" ||
		state.Decisions[0].ResolvedInvocation.ProviderReferences.TurnID != nil ||
		state.Decisions[0].ResolvedInvocation.ProviderReferences.RequestID != nil {
		t.Fatalf("blank route state = %+v", state)
	}
	assertFixtureRouterProviderRequests(t, fixture.provider, 0)
}

func TestConversationInputRouterRoutesFolderlessChatToNarrator(t *testing.T) {
	fixture := newFolderlessBlankStatusServiceFixture(t)
	fixture.provider.routeKinds = []conversation.ConversationRouteDecisionKind{
		conversation.ConversationRouteDecisionKindAnswerAsNarrator,
	}
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	accepted, err := inputService.SubmitInput(context.Background(), conversation.ConversationInput{
		ID:             "input-route-folderless-chat",
		ConversationID: fixture.conversationID,
		Text:           "hi",
		Modality:       conversation.ConversationInputModalityText,
		SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("SubmitInput: %v", err)
	}

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("ProcessNext = %t, %v", processed, err)
	}
	state := readFixtureRoutingStateWithWorkspace(t, fixture, "", accepted.Input.ID)
	if state.Input.Status != conversation.ConversationInputStatusDispatched ||
		len(state.Decisions) != 1 ||
		state.Decisions[0].RouterContext.DecisionAuthority != conversation.ConversationRouteDecisionAuthorityNarratorModel ||
		state.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindAnswerAsNarrator ||
		state.Decisions[0].ResultingCommand.AnswerAsNarrator.Question != "hi" ||
		!conversationRouteDecisionKindIncluded(
			state.Decisions[0].RouterContext.AllowedDecisionKinds,
			conversation.ConversationRouteDecisionKindAnswerAsNarrator,
		) {
		t.Fatalf("folderless chat route state = %+v", state)
	}
	assertFixtureRouterProviderRequests(t, fixture.provider, 1)
}

// TestConversationInputRouterDeliversFolderlessParentWork proves work delivered
// to the conversation itself is routed without a project folder. A workspace is
// context for reading the user's files, not a precondition for running a turn.
func TestConversationInputRouterDeliversFolderlessParentWork(t *testing.T) {
	fixture := newFolderlessBlankStatusServiceFixture(t)
	fixture.provider.routeKinds = []conversation.ConversationRouteDecisionKind{
		conversation.ConversationRouteDecisionKindSendToParent,
	}
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	accepted, err := inputService.SubmitInput(context.Background(), conversation.ConversationInput{
		ID:             "input-route-folderless-work",
		ConversationID: fixture.conversationID,
		Text:           "Inspect the repository files.",
		Modality:       conversation.ConversationInputModalityText,
		SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("SubmitInput: %v", err)
	}

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("ProcessNext = %t, %v", processed, err)
	}
	state := readFixtureRoutingStateWithWorkspace(t, fixture, "", accepted.Input.ID)
	if state.Input.Status != conversation.ConversationInputStatusDispatched ||
		state.Input.Failure != nil ||
		len(state.Decisions) != 1 ||
		state.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindSendToParent ||
		state.Decisions[0].ResultingCommand.SendToParent == nil {
		t.Fatalf("folderless parent work route state = %+v", state)
	}
	for _, kind := range []conversation.ConversationRouteDecisionKind{
		conversation.ConversationRouteDecisionKindCreateSideConversation,
		conversation.ConversationRouteDecisionKindForkConversation,
	} {
		if conversationRouteDecisionKindIncluded(state.Decisions[0].RouterContext.AllowedDecisionKinds, kind) {
			t.Fatalf("folderless conversation was offered %s: %+v", kind, state.Decisions[0].RouterContext)
		}
	}
	assertFixtureRouterProviderRequests(t, fixture.provider, 1)
}

func TestConversationInputRouterContextLimitsUseEffectiveUnboundProfile(t *testing.T) {
	fixture := newFolderlessBlankStatusServiceFixture(t)
	profile := conversation.DefaultNarratorRoleProfile()
	profile.ContextBudget.MaxInputBytes--
	profiles := &modelResolverProfileSource{profile: &profile}
	fixture.service.inputRouter.profiles = profiles

	workspaceID, resolved, limits, err := fixture.service.inputRouter.contextLimits(
		context.Background(),
		fixture.conversationID,
	)
	if err != nil {
		t.Fatalf("contextLimits: %v", err)
	}
	if workspaceID != "" ||
		profiles.calls != 1 ||
		profiles.workspaceID != nil ||
		profiles.conversationID != fixture.conversationID ||
		resolved.ContextBudget.MaxInputBytes != profile.ContextBudget.MaxInputBytes ||
		limits.MaxInputBytes != profile.ContextBudget.MaxInputBytes {
		t.Fatalf(
			"unbound router context = workspace:%q profile:%+v limits:%+v source:%+v",
			workspaceID,
			resolved,
			limits,
			profiles,
		)
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
	finalAudit conversation.ConversationRouteContextAudit,
	reply conversation.AcceptedConversationInput,
) {
	t.Helper()
	if finalAudit.ClarificationInputSequence == nil ||
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

func TestConversationInputRouterRepairsInvalidModelOutputBeforeFailingInput(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	fixture.provider.invalidRouteOutputsRemaining = 1
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	accepted := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-retry", nil)

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("repaired ProcessNext = %t, %v", processed, err)
	}
	recovered := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if recovered.Input.Status != conversation.ConversationInputStatusDispatched ||
		recovered.Input.RoutingAttempt != 1 || recovered.Input.Failure != nil ||
		len(recovered.Decisions) != 1 ||
		recovered.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindQueueParentTurn {
		t.Fatalf("repaired router state = %+v", recovered)
	}
	fixture.provider.mu.Lock()
	requests := append([]agent.FreshStructuredCallRequest{}, fixture.provider.routeRequests...)
	fixture.provider.mu.Unlock()
	if len(requests) != 2 ||
		requests[1].ID != requests[0].ID+"_repair" ||
		!strings.Contains(
			requests[1].DeveloperInstructions,
			"The previous routing decision was rejected by Setta's validator.",
		) {
		t.Fatalf("repair requests = %+v", requests)
	}
}

func TestConversationInputRouterFallsBackToClarificationWhenInvalidOutputCannotRepair(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	fixture.provider.invalidRouteOutputsRemaining = 2
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	accepted := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-repair-fallback", nil)

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("fallback ProcessNext = %t, %v", processed, err)
	}
	state := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if state.Input.Status != conversation.ConversationInputStatusAwaitingClarification ||
		state.Input.Failure != nil ||
		len(state.Decisions) != 1 ||
		state.Decisions[0].RouterContext.DecisionAuthority != conversation.ConversationRouteDecisionAuthorityProductInvariant ||
		state.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindClarify ||
		state.Decisions[0].Decision.Clarify.Question !=
			"Should I change the current run or queue this as the next task?" ||
		state.Decisions[0].ResolvedInvocation.Resolved.ModelID != "product-invariant" ||
		state.Decisions[0].ResolvedInvocation.ProviderReferences.TurnID != nil ||
		state.Decisions[0].ResolvedInvocation.ProviderReferences.RequestID != nil {
		t.Fatalf("fallback route state = %+v", state)
	}
	assertFixtureRouterProviderRequests(t, fixture.provider, 2)
}

func TestConversationInputRouterInvalidClarificationOutputDoesNotExposeModelInternals(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	fixture.provider.routeKinds = []conversation.ConversationRouteDecisionKind{
		conversation.ConversationRouteDecisionKindClarify,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
	}
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	inputService := fixtureInputService(t, fixture.store)
	root := submitFixtureRouteInput(
		t,
		inputService,
		fixture.conversationID,
		"input-route-invalid-clarification-root",
		nil,
	)

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("clarification ProcessNext = %t, %v", processed, err)
	}
	reply := submitFixtureRouteInput(
		t,
		inputService,
		fixture.conversationID,
		"input-route-invalid-clarification-reply",
		&root.Input.ID,
	)
	fixture.provider.invalidRouteOutputsRemaining = 2
	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("invalid clarification ProcessNext = %t, %v", processed, err)
	}

	state := readFixtureRoutingState(t, fixture, root.Input.ID)
	if state.ClarificationReply == nil ||
		state.ClarificationReply.Input.ID != reply.Input.ID ||
		state.ClarificationReply.Status != conversation.ConversationInputStatusFailed ||
		state.ClarificationReply.Failure == nil ||
		state.ClarificationReply.Failure.Code != "conversation_router_provider_output_invalid" ||
		state.ClarificationReply.Failure.Message != "Conversation routing is temporarily unavailable." ||
		strings.Contains(strings.ToLower(state.ClarificationReply.Failure.Message), "invalid decision") ||
		strings.Contains(strings.ToLower(state.ClarificationReply.Failure.Message), "model") {
		t.Fatalf("invalid clarification route state = %+v", state)
	}
	assertFixtureRouterProviderRequests(t, fixture.provider, 3)
}

func TestConversationInputRouterClassifiesCommandIDFailureAsInternal(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	generatedID := router.newID
	router.newID = func(prefix string) (string, error) {
		if prefix == "conversation_turn" {
			return "", errors.New("id source unavailable")
		}
		return generatedID(prefix)
	}
	inputService := fixtureInputService(t, fixture.store)
	accepted := submitFixtureRouteInput(t, inputService, fixture.conversationID, "input-route-id-failure", nil)

	if processed, err := router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("ProcessNext = %t, %v", processed, err)
	}
	failed := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if failed.Input.Status != conversation.ConversationInputStatusFailed || failed.Input.Failure == nil ||
		failed.Input.Failure.Code != "conversation_router_internal_error" ||
		!failed.Input.Failure.Retryable || len(failed.Decisions) != 0 {
		t.Fatalf("command id failure state = %+v", failed)
	}
}

func TestConversationInputRouterReplaysCommittedCommandBeforeNewInput(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	executor := &failingConversationRouteCommandExecutor{failuresRemaining: 1}
	router.executor = executor
	inputService := fixtureInputService(t, fixture.store)
	accepted, err := inputService.SubmitInput(context.Background(), conversation.ConversationInput{
		ID:             "input-route-replay",
		ConversationID: fixture.conversationID,
		Text:           "Replay this exact queue request.",
		Modality:       conversation.ConversationInputModalityText,
		SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("SubmitInput: %v", err)
	}

	processed, err := router.ProcessNext(context.Background(), fixture.conversationID)
	var committed *committedConversationRouteCommandError
	if !processed || !errors.As(err, &committed) {
		t.Fatalf("first ProcessNext = %t, %T %v, want committed command failure", processed, err, err)
	}
	state := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if state.Input.Status != conversation.ConversationInputStatusDispatched || len(state.Decisions) != 1 {
		t.Fatalf("committed replay state = %+v", state)
	}

	if processed, err = router.ProcessNext(context.Background(), fixture.conversationID); err != nil || !processed {
		t.Fatalf("replayed ProcessNext = %t, %v", processed, err)
	}
	if len(executor.records) != 2 || executor.records[0].ID != state.Decisions[0].ID ||
		executor.records[1].ID != state.Decisions[0].ID {
		t.Fatalf("replayed route command records = %+v", executor.records)
	}
	if processed, err = router.ProcessNext(context.Background(), fixture.conversationID); err != nil || processed {
		t.Fatalf("completed ProcessNext = %t, %v", processed, err)
	}
}

func TestConversationRouteQueueRetriesCommittedCommandWithoutAnotherNotification(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	router := configuredFixtureInputRouter(fixture.service.inputRouter)
	executor := &failingConversationRouteCommandExecutor{failuresRemaining: 1}
	router.executor = executor
	inputService := fixtureInputService(t, fixture.store)
	accepted, err := inputService.SubmitInput(context.Background(), conversation.ConversationInput{
		ID:             "input-route-queue-worker-retry",
		ConversationID: fixture.conversationID,
		Text:           "Retry this committed queue command in process.",
		Modality:       conversation.ConversationInputModalityText,
		SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("SubmitInput: %v", err)
	}

	var retryDelays []time.Duration
	queue := &conversationRouteQueue{notified: true, running: true}
	service := &Service{
		inputRouter: router,
		routing:     map[string]*conversationRouteQueue{fixture.conversationID: queue},
	}
	service.retryWait = func(_ context.Context, delay time.Duration) error {
		retryDelays = append(retryDelays, delay)
		return nil
	}
	service.tasks.Add(1)
	service.runConversationRouteQueue(context.Background(), fixture.conversationID, queue)

	state := readFixtureRoutingState(t, fixture, accepted.Input.ID)
	if state.Input.Status != conversation.ConversationInputStatusDispatched ||
		len(executor.records) != 2 || len(retryDelays) != 1 ||
		retryDelays[0] != initialRetryDelay {
		t.Fatalf(
			"worker retry state=%+v records=%d delays=%v",
			state,
			len(executor.records),
			retryDelays,
		)
	}
	if _, found, err := fixture.store.ReadNextPendingConversationRouteCommand(
		context.Background(),
		fixture.conversationID,
	); err != nil || found {
		t.Fatalf("pending command after worker retry = %t, %v", found, err)
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
			output := map[string]any{
				"authoredInput":  nil,
				"forkedAtTurnId": nil,
				"kind":           string(kind),
				"proposedTitle":  nil,
				"question":       nil,
			}
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
	invalid := json.RawMessage(`{"decision":{"kind":"clarify","authoredInput":null,"question":"Again?","forkedAtTurnId":null,"proposedTitle":null,"extra":true}}`)
	if _, err := decodeConversationRouteOutput(invalid, contextBundle); err == nil {
		t.Fatal("conversation router accepted unknown output field")
	}
	mismatched := json.RawMessage(`{"decision":{"kind":"send_to_parent","authoredInput":"Continue.","question":"Status?","forkedAtTurnId":null,"proposedTitle":null}}`)
	if _, err := decodeConversationRouteOutput(mismatched, contextBundle); err == nil {
		t.Fatal("conversation router accepted payload fields from two decision branches")
	}
	missing := json.RawMessage(`{"decision":{"kind":"send_to_parent","authoredInput":"Continue.","question":null,"forkedAtTurnId":null}}`)
	if _, err := decodeConversationRouteOutput(missing, contextBundle); err == nil {
		t.Fatal("conversation router accepted a missing required wire field")
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
	decisionProperties := decision["properties"].(map[string]any)
	kind := decisionProperties["kind"].(map[string]any)
	values := kind["enum"].([]any)
	if schema["type"] != "object" || schema["additionalProperties"] != false ||
		len(properties) != 1 || decision["type"] != "object" ||
		decision["additionalProperties"] != false || len(decisionProperties) != 5 ||
		len(decision["required"].([]any)) != len(decisionProperties) ||
		len(values) != len(contextBundle.AllowedDecisionKinds) {
		t.Fatalf("conversation route output schema is not a strict bounded decision: %+v", schema)
	}
	for _, field := range []string{"authoredInput", "forkedAtTurnId", "proposedTitle", "question"} {
		fieldSchema := decisionProperties[field].(map[string]any)
		if len(fieldSchema["anyOf"].([]any)) != 2 {
			t.Fatalf("conversation route output field %s is not nullable and bounded: %+v", field, fieldSchema)
		}
	}
}

func TestSanitizeConversationRouteTrajectoryRemovesProviderAuthority(t *testing.T) {
	providerEventID := "provider-event-secret"
	providerThreadID := "provider-thread-secret"
	providerTurnID := "provider-turn-secret"
	processID := "provider-process-secret"
	event := conversation.TrajectoryEvent{
		ProviderEventID: &providerEventID,
		ProviderTurnID:  &providerTurnID,
		TurnStarted: &conversation.TrajectoryTurnStarted{Invocation: conversation.ResolvedInvocation{
			ProviderReferences: conversation.InvocationProviderReferences{
				TurnID: &providerTurnID,
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
	} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("sanitized router trajectory leaked %q: %s", forbidden, encoded)
		}
	}
	if event.ActivityStarted.Activity.ProcessID == nil ||
		event.TurnStarted.Invocation.ProviderReferences.TurnID == nil {
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

type failingConversationRouteCommandExecutor struct {
	failuresRemaining int
	records           []conversation.ConversationRouteDecisionRecord
}

func (executor *failingConversationRouteCommandExecutor) ExecuteConversationRouteCommand(
	_ context.Context,
	record conversation.ConversationRouteDecisionRecord,
) error {
	executor.records = append(executor.records, record)
	if executor.failuresRemaining > 0 {
		executor.failuresRemaining--
		return errors.New("route command effect unavailable")
	}
	return nil
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
	return readFixtureRoutingStateWithWorkspace(t, fixture, fixture.workspace.ID, inputID)
}

func readFixtureRoutingStateWithWorkspace(
	t *testing.T,
	fixture statusServiceFixture,
	workspaceID string,
	inputID string,
) conversation.ConversationInputRoutingState {
	t.Helper()
	state, err := fixture.store.ReadConversationInputRoutingState(
		context.Background(),
		workspaceID,
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
		var contextBundle ConversationRouteContextBundle
		if err := json.Unmarshal(request.Input, &contextBundle); err != nil {
			t.Fatalf("decode router provider context: %v", err)
		}
		wantTask := ConversationRouteTask{
			Operation:       routeTaskOperation,
			InputSemantics:  routeTaskInputSemantics,
			OutputSemantics: routeTaskOutputSemantics,
			Directive:       routeTaskDirective,
		}
		if contextBundle.Task != wantTask {
			t.Fatalf("router provider task = %+v, want %+v", contextBundle.Task, wantTask)
		}
		for _, forbidden := range []string{"provider-primary-thread", "provider-primary-turn"} {
			if strings.Contains(input, forbidden) {
				t.Fatalf("router context leaked provider reference %q: %s", forbidden, input)
			}
		}
	}
}
