package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/director"
)

func TestDirectorHistoryBudgetDropsWholeOldestTurns(t *testing.T) {
	history := []director.DirectorHistoryItem{
		{TurnID: "turn-1", Text: "first user"},
		{TurnID: "turn-1", Assistant: true, Text: "first assistant"},
		{TurnID: "turn-2", Text: "second user"},
		{TurnID: "turn-2", Assistant: true, Text: "second assistant"},
	}
	secondTurnBytes := len(history[2].Text) + len(history[3].Text)

	bounded := directorHistoryWithinBudget(history, secondTurnBytes)

	if len(bounded) != 2 ||
		bounded[0].TurnID != "turn-2" ||
		bounded[0].Assistant ||
		!bounded[1].Assistant {
		t.Fatalf("bounded Director history = %+v", bounded)
	}
}

func TestDirectorTurnSinkPrefersCompletedAssistantText(t *testing.T) {
	sink := &directorTurnSink{}
	events := []agent.Event{
		{
			Kind: agent.EventKindAgentTextDelta,
			Text: &agent.TextEvent{ProviderItemID: "message-1", Text: "partial"},
		},
		{
			Kind: agent.EventKindAgentTextCompleted,
			Text: &agent.TextEvent{ProviderItemID: "message-1", Text: "complete"},
		},
	}
	for _, event := range events {
		if err := sink.HandleAgentEvent(event); err != nil {
			t.Fatalf("HandleAgentEvent: %v", err)
		}
	}
	if reply := sink.replyText(); reply != "complete" {
		t.Fatalf("Director reply = %q, want complete", reply)
	}
}

func TestDirectorTurnSinkKeepsOnlyTextAfterTheLastToolCall(t *testing.T) {
	sink := &directorTurnSink{}
	events := []agent.Event{
		{
			Kind: agent.EventKindAgentTextCompleted,
			Text: &agent.TextEvent{ProviderItemID: "preamble", Text: "I'll route this now."},
		},
		{
			Kind: agent.EventKindActivityStarted,
			Activity: &agent.ActivityEvent{
				ProviderItemID: "setta-call",
				Kind:           agent.ActivityKindDynamicTool,
			},
		},
		{
			Kind: agent.EventKindAgentTextCompleted,
			Text: &agent.TextEvent{ProviderItemID: "confirmation", Text: "Started the requested work."},
		},
	}
	for _, event := range events {
		if err := sink.HandleAgentEvent(event); err != nil {
			t.Fatalf("HandleAgentEvent: %v", err)
		}
	}
	if reply := sink.replyText(); reply != "Started the requested work." {
		t.Fatalf("Director reply = %q, want post-tool confirmation", reply)
	}
}

func TestRunDirectorTurnCarriesOneResolvedInvocationThroughTokenAccountingAndProviderResult(t *testing.T) {
	provider := &recordingDirectorProvider{
		runEvents: []agent.Event{
			{
				Kind: agent.EventKindModelRerouted,
				ModelReroute: &agent.ModelRerouteEvent{
					FromModel: "gpt-5.6-terra",
					ToModel:   "gpt-5.6-sol",
					Reason:    agent.ModelRerouteReasonHighRiskCyberActivity,
				},
			},
			{
				Kind: agent.EventKindAgentTextCompleted,
				Text: &agent.TextEvent{ProviderItemID: "director-message", Text: "The work is underway."},
			},
		},
		runResult: agent.TurnResult{
			ProviderThreadID: "provider-director-carrier",
			ProviderTurnID:   "provider-director-turn",
			Outcome:          agent.TurnOutcomeCompleted,
		},
	}
	port, err := newDirectorCarrierPort(
		staticDirectorRoleResolver{configuration: directorCarrierTestRoleConfiguration(t)},
		provider,
		"/tmp/setta-director-carrier-test",
	)
	if err != nil {
		t.Fatalf("newDirectorCarrierPort: %v", err)
	}
	port.newID = func(prefix string) (string, error) { return prefix + "-test", nil }
	times := []time.Time{
		time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC),
		time.Date(2026, time.July, 31, 12, 0, 1, 0, time.UTC),
	}
	port.now = func() time.Time {
		value := times[0]
		times = times[1:]
		return value
	}

	turn, err := port.RunDirectorTurn(context.Background(), director.DirectorTurnRequest{
		Carrier: conversation.Carrier{
			OwnerID:  "director-owner",
			ThreadID: "provider-director-carrier",
		},
		TurnID: "director-intent",
		Text:   "Start the work.",
		Tools:  []director.SettaTool{directorCarrierTestTool()},
	})
	if err != nil {
		t.Fatalf("RunDirectorTurn: %v", err)
	}
	if turn.ReplyText != "The work is underway." {
		t.Fatalf("Director reply = %q", turn.ReplyText)
	}
	if err := turn.Invocation.Validate(); err != nil {
		t.Fatalf("Director resolved invocation: %v", err)
	}
	if turn.Invocation.ID != "director_invocation-test" ||
		turn.Invocation.ProviderReferences.TurnID == nil ||
		*turn.Invocation.ProviderReferences.TurnID != "provider-director-turn" ||
		len(turn.Invocation.ModelReroutes) != 1 {
		t.Fatalf("Director resolved invocation = %+v", turn.Invocation)
	}
	attribution := provider.runRequest.TokenUsageAttribution
	if attribution.Bucket != agent.TokenUsageBucketSystem ||
		attribution.Role != agent.TokenUsageRoleDirector ||
		attribution.InvocationID != turn.Invocation.ID ||
		attribution.Model != turn.Invocation.Resolved.ModelID ||
		attribution.ReasoningEffort != string(turn.Invocation.Resolved.ReasoningEffort) {
		t.Fatalf("Director token attribution = %+v", attribution)
	}
}

// The Director reaches Codex the way every other Setta conversation does: an
// ephemeral carrier, opened with its own tools, seeded with the durable history
// Setta already owns.
func TestStartDirectorCarrierIsEphemeralAndReplaysDurableHistory(t *testing.T) {
	provider := &recordingDirectorProvider{}
	port, err := newDirectorCarrierPort(
		staticDirectorRoleResolver{configuration: directorCarrierTestRoleConfiguration(t)},
		provider,
		"/tmp/setta-director-carrier-test",
	)
	if err != nil {
		t.Fatalf("newDirectorCarrierPort: %v", err)
	}

	threadID, err := port.StartDirectorCarrier(context.Background(), director.DirectorCarrierRequest{
		Instructions: "Coordinate Setta work.",
		Tools:        []director.SettaTool{directorCarrierTestTool()},
		History: []director.DirectorHistoryItem{
			{TurnID: "turn-1", Text: "Start the release."},
			{TurnID: "turn-1", Assistant: true, Text: "The release is underway."},
		},
	})
	if err != nil {
		t.Fatalf("StartDirectorCarrier: %v", err)
	}
	if threadID != provider.threadID {
		t.Fatalf("Director carrier = %q, want the started thread %q", threadID, provider.threadID)
	}
	start := provider.start
	if !start.Ephemeral ||
		start.EnableShellTools ||
		start.DeveloperInstructions != "Coordinate Setta work." ||
		len(start.DynamicTools) != 1 ||
		start.DynamicTools[0].Namespace != director.SettaToolNamespace {
		t.Fatalf("Director carrier start = %+v", start)
	}
	if len(provider.injected) != 2 ||
		provider.injected[0].Role != "user" ||
		provider.injected[0].Text != "Start the release." ||
		provider.injected[1].Role != "assistant" ||
		provider.injected[1].Text != "The release is underway." {
		t.Fatalf("Director carrier replay = %+v", provider.injected)
	}
	if len(provider.unsubscribed) != 0 {
		t.Fatalf("a started Director carrier was released: %+v", provider.unsubscribed)
	}
}

// A Director conversation with nothing to replay still needs one item: an empty
// Codex thread has no history for the first turn to continue from.
func TestStartDirectorCarrierMaterializesEmptyHistory(t *testing.T) {
	provider := &recordingDirectorProvider{}
	port, err := newDirectorCarrierPort(
		staticDirectorRoleResolver{configuration: directorCarrierTestRoleConfiguration(t)},
		provider,
		"/tmp/setta-director-carrier-test",
	)
	if err != nil {
		t.Fatalf("newDirectorCarrierPort: %v", err)
	}

	if _, err := port.StartDirectorCarrier(context.Background(), director.DirectorCarrierRequest{
		Instructions: "Coordinate Setta work.",
		Tools:        []director.SettaTool{directorCarrierTestTool()},
	}); err != nil {
		t.Fatalf("StartDirectorCarrier: %v", err)
	}
	if len(provider.injected) != 1 ||
		provider.injected[0].Role != "user" ||
		provider.injected[0].Text != directorCarrierInitialization {
		t.Fatalf("empty Director carrier replay = %+v", provider.injected)
	}
}

func TestDirectorCarrierReplayFailureReleasesStartedThread(t *testing.T) {
	replayErr := errors.New("scripted replay rejection")
	cleanupErr := errors.New("scripted cleanup rejection")
	provider := &recordingDirectorProvider{
		replayErr:  replayErr,
		cleanupErr: cleanupErr,
	}
	port, err := newDirectorCarrierPort(
		staticDirectorRoleResolver{configuration: directorCarrierTestRoleConfiguration(t)},
		provider,
		"/tmp/setta-director-carrier-test",
	)
	if err != nil {
		t.Fatalf("newDirectorCarrierPort: %v", err)
	}

	_, err = port.StartDirectorCarrier(context.Background(), director.DirectorCarrierRequest{
		Instructions: "Coordinate Setta work.",
		Tools:        []director.SettaTool{directorCarrierTestTool()},
	})
	if !errors.Is(err, replayErr) || !errors.Is(err, cleanupErr) {
		t.Fatalf("StartDirectorCarrier error = %v, want replay and cleanup failures", err)
	}
	if len(provider.unsubscribed) != 1 ||
		provider.unsubscribed[0] != provider.threadID {
		t.Fatalf("replay failure unsubscribed carriers = %+v", provider.unsubscribed)
	}
}

type staticDirectorRoleResolver struct {
	configuration conversation.DirectorRoleConfiguration
}

func (resolver staticDirectorRoleResolver) ResolveDirectorRoleConfiguration(
	context.Context,
) (conversation.DirectorRoleConfiguration, error) {
	return resolver.configuration, nil
}

func directorCarrierTestRoleConfiguration(t *testing.T) conversation.DirectorRoleConfiguration {
	t.Helper()
	profile := conversation.DefaultDirectorRoleProfile()
	requestedProfile, err := json.Marshal(profile)
	if err != nil {
		t.Fatalf("marshal Director profile: %v", err)
	}
	requested := agent.Invocation{
		Model:           *profile.ModelSelection.ModelID,
		ReasoningEffort: string(profile.ReasoningEffort),
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}
	return conversation.DirectorRoleConfiguration{
		RequestedProfile: requestedProfile,
		ResolvedInvocation: agent.ResolvedInvocation{
			Requested:       requested,
			Model:           requested.Model,
			ReasoningEffort: requested.ReasoningEffort,
			PermissionMode:  requested.PermissionMode,
			ApprovalMode:    requested.ApprovalMode,
		},
		MaxInputBytes: profile.ContextBudget.MaxInputBytes,
	}
}

func directorCarrierTestTool() director.SettaTool {
	return director.SettaTool{
		Name:        "test_tool",
		Description: "A test-only Director tool.",
		InputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

// recordingDirectorProvider is one Codex carrier as the Director's port sees it.
// The scripted replay and cleanup rejections stay unset unless a test is about
// what happens when the provider refuses.
type recordingDirectorProvider struct {
	threadID         string
	start            agent.StartThreadRequest
	injected         []agent.InjectedTextItem
	structured       agent.FreshStructuredCallRequest
	structuredResult agent.FreshStructuredCallResult
	structuredErr    error
	replayErr        error
	cleanupErr       error
	runRequest       agent.TurnRequest
	runEvents        []agent.Event
	runResult        agent.TurnResult
	runErr           error
	unsubscribed     []string
}

func (provider *recordingDirectorProvider) RunFreshStructuredCall(
	_ context.Context,
	request agent.FreshStructuredCallRequest,
) (agent.FreshStructuredCallResult, error) {
	provider.structured = request
	if provider.structuredErr != nil {
		return agent.FreshStructuredCallResult{}, provider.structuredErr
	}
	if len(provider.structuredResult.Output) == 0 {
		return agent.FreshStructuredCallResult{
			ProviderThreadID: "provider-readiness-thread",
			ProviderTurnID:   "provider-readiness-turn",
			Output:           json.RawMessage(`{"disposition":"work_permitted","question":""}`),
		}, nil
	}
	return provider.structuredResult, nil
}

func (provider *recordingDirectorProvider) StartThread(
	_ context.Context,
	request agent.StartThreadRequest,
) (agent.Thread, error) {
	provider.threadID = "provider-director-carrier"
	provider.start = request
	return agent.Thread{ID: provider.threadID, Ephemeral: request.Ephemeral}, nil
}

func (provider *recordingDirectorProvider) InjectItems(
	_ context.Context,
	_ string,
	items []agent.InjectedTextItem,
) error {
	if provider.replayErr != nil {
		return provider.replayErr
	}
	provider.injected = append(provider.injected, items...)
	return nil
}

func (provider *recordingDirectorProvider) RunTurn(
	_ context.Context,
	request agent.TurnRequest,
	sink agent.EventSink,
) (agent.TurnResult, error) {
	provider.runRequest = request
	if provider.runErr != nil {
		return agent.TurnResult{}, provider.runErr
	}
	if provider.runResult.ProviderTurnID == "" {
		return agent.TurnResult{}, errors.New("unexpected Director test turn")
	}
	for _, event := range provider.runEvents {
		if err := sink.HandleAgentEvent(event); err != nil {
			return agent.TurnResult{}, err
		}
	}
	return provider.runResult, nil
}

func (provider *recordingDirectorProvider) UnsubscribeThread(
	_ context.Context,
	threadID string,
) error {
	provider.unsubscribed = append(provider.unsubscribed, threadID)
	return provider.cleanupErr
}
