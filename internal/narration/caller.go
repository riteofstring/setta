package narration

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"setta/internal/agent"
	"setta/internal/conversation"
)

type AgentRuntime interface {
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
	StartThread(context.Context, agent.StartThreadRequest) (agent.Thread, error)
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
	UnsubscribeThread(context.Context, string) error
}

type AgentModelCaller struct {
	runtime AgentRuntime
}

func NewAgentModelCaller(runtime AgentRuntime) (*AgentModelCaller, error) {
	if runtime == nil {
		return nil, errors.New("narrator agent runtime is required")
	}
	return &AgentModelCaller{runtime: runtime}, nil
}

func (caller *AgentModelCaller) Call(ctx context.Context, request ModelCallRequest) (ModelCallResult, error) {
	invocation := narratorAgentInvocation(request.Profile)
	resolved, err := caller.runtime.ResolveInvocation(ctx, invocation)
	if err != nil {
		return ModelCallResult{}, err
	}
	thread, err := caller.runtime.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot: request.WorkspaceRoot, Invocation: invocation, Ephemeral: true,
		DeveloperInstructions: "You are Setta's narrator. Use only supplied public structured context and return exactly the requested JSON schema.",
	})
	if err != nil {
		return ModelCallResult{}, err
	}
	defer func() {
		_ = caller.runtime.UnsubscribeThread(context.Background(), thread.ID)
	}()
	sink := &narratorCallSink{}
	result, err := caller.runtime.RunTurn(ctx, agent.TurnRequest{
		ConversationID: "narrator_" + request.ConversationID,
		TurnID:         request.CallID, ProviderThreadID: thread.ID,
		ClientInputID: request.CallID + "_input", Text: request.Prompt,
		WorkspaceRoot: request.WorkspaceRoot, Invocation: invocation,
		OutputSchema: append([]byte{}, request.OutputSchema...),
	}, sink)
	if err != nil {
		return ModelCallResult{}, err
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return ModelCallResult{}, fmt.Errorf("narrator provider turn ended with %s", result.Outcome)
	}
	text := strings.TrimSpace(sink.completedText())
	if text == "" {
		return ModelCallResult{}, errors.New("narrator provider returned no completed text")
	}
	return ModelCallResult{
		Text: text, ResolvedInvocation: resolved,
		ProviderThreadID: result.ProviderThreadID, ProviderTurnID: result.ProviderTurnID,
	}, nil
}

func narratorAgentInvocation(profile conversation.RoleProfile) agent.Invocation {
	return conversation.AgentInvocation(profile)
}

type narratorCallSink struct {
	mu   sync.Mutex
	text string
}

func (sink *narratorCallSink) HandleAgentEvent(event agent.Event) error {
	if event.Kind != agent.EventKindAgentTextCompleted || event.Text == nil {
		return nil
	}
	sink.mu.Lock()
	sink.text = event.Text.Text
	sink.mu.Unlock()
	return nil
}

func (sink *narratorCallSink) completedText() string {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	return sink.text
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
