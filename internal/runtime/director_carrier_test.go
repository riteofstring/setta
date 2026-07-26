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

func TestDirectorCarrierReplayFailureReleasesStartedThread(t *testing.T) {
	replayErr := errors.New("scripted replay rejection")
	cleanupErr := errors.New("scripted cleanup rejection")
	provider := &replayRejectingDirectorProvider{
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
		Tools: []director.SettaTool{{
			Name:        "test_tool",
			Description: "A test-only Director tool.",
			InputSchema: json.RawMessage(`{"type":"object"}`),
		}},
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

type replayRejectingDirectorProvider struct {
	threadID     string
	replayErr    error
	cleanupErr   error
	unsubscribed []string
}

func (provider *replayRejectingDirectorProvider) StartThread(
	context.Context,
	agent.StartThreadRequest,
) (agent.Thread, error) {
	provider.threadID = "provider-director-carrier"
	return agent.Thread{ID: provider.threadID}, nil
}

func (provider *replayRejectingDirectorProvider) InjectItems(
	context.Context,
	string,
	[]agent.InjectedTextItem,
) error {
	return provider.replayErr
}

func (provider *replayRejectingDirectorProvider) RunTurn(
	context.Context,
	agent.TurnRequest,
	agent.EventSink,
) (agent.TurnResult, error) {
	return agent.TurnResult{}, errors.New("unexpected Director test turn")
}

func (provider *replayRejectingDirectorProvider) UnsubscribeThread(
	_ context.Context,
	threadID string,
) error {
	provider.unsubscribed = append(provider.unsubscribed, threadID)
	return provider.cleanupErr
}
