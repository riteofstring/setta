package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

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
	threadID     string
	start        agent.StartThreadRequest
	injected     []agent.InjectedTextItem
	replayErr    error
	cleanupErr   error
	unsubscribed []string
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
	context.Context,
	agent.TurnRequest,
	agent.EventSink,
) (agent.TurnResult, error) {
	return agent.TurnResult{}, errors.New("unexpected Director test turn")
}

func (provider *recordingDirectorProvider) UnsubscribeThread(
	_ context.Context,
	threadID string,
) error {
	provider.unsubscribed = append(provider.unsubscribed, threadID)
	return provider.cleanupErr
}
