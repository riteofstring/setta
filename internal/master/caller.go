package master

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
	ResumeThread(context.Context, string) (agent.Thread, error)
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
}

type ModelCallRequest struct {
	CallID           string
	SessionID        string
	ProviderThreadID *string
	RuntimeRoot      string
	Profile          conversation.RoleProfile
	Prompt           string
	OutputSchema     []byte
}

type ModelCallResult struct {
	Text               string
	ResolvedInvocation agent.ResolvedInvocation
	ProviderThreadID   string
	ProviderTurnID     string
}

type ModelCaller interface {
	Call(context.Context, ModelCallRequest) (ModelCallResult, error)
}

type AgentModelCaller struct {
	runtime AgentRuntime
}

func NewAgentModelCaller(runtime AgentRuntime) (*AgentModelCaller, error) {
	if runtime == nil {
		return nil, errors.New("master agent runtime is required")
	}
	return &AgentModelCaller{runtime: runtime}, nil
}

func (caller *AgentModelCaller) Call(ctx context.Context, request ModelCallRequest) (ModelCallResult, error) {
	invocation := conversation.AgentInvocation(request.Profile)
	resolved, err := caller.runtime.ResolveInvocation(ctx, invocation)
	if err != nil {
		return ModelCallResult{}, err
	}
	threadID, err := caller.ensureThread(ctx, request, invocation)
	if err != nil {
		return ModelCallResult{}, err
	}
	sink := &masterCallSink{}
	result, err := caller.runtime.RunTurn(ctx, agent.TurnRequest{
		ConversationID:   "master_" + request.SessionID,
		TurnID:           request.CallID,
		ProviderThreadID: threadID,
		ClientInputID:    request.CallID + "_input",
		Text:             request.Prompt,
		WorkspaceRoot:    request.RuntimeRoot,
		Invocation:       invocation,
		OutputSchema:     append([]byte{}, request.OutputSchema...),
	}, sink)
	if err != nil {
		return ModelCallResult{}, err
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return ModelCallResult{}, fmt.Errorf("master provider turn ended with %s", result.Outcome)
	}
	text := strings.TrimSpace(sink.completedText())
	if text == "" {
		return ModelCallResult{}, errors.New("master provider returned no completed route decision")
	}
	return ModelCallResult{
		Text: text, ResolvedInvocation: resolved,
		ProviderThreadID: result.ProviderThreadID, ProviderTurnID: result.ProviderTurnID,
	}, nil
}

func (caller *AgentModelCaller) ensureThread(ctx context.Context, request ModelCallRequest, invocation agent.Invocation) (string, error) {
	if request.ProviderThreadID != nil {
		thread, err := caller.runtime.ResumeThread(ctx, *request.ProviderThreadID)
		if err != nil {
			return "", fmt.Errorf("resume durable master thread: %w", err)
		}
		return thread.ID, nil
	}
	thread, err := caller.runtime.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot:         request.RuntimeRoot,
		Invocation:            invocation,
		DeveloperInstructions: "You are Setta's restricted global routing master. Return only the requested route-decision schema. Never call tools, inspect files, run commands, mutate a workspace, or request approval. Workspace work must be delegated through the typed decision.",
	})
	if err != nil {
		return "", err
	}
	return thread.ID, nil
}

type masterCallSink struct {
	mu   sync.Mutex
	text string
}

func (sink *masterCallSink) HandleAgentEvent(event agent.Event) error {
	switch event.Kind {
	case agent.EventKindAgentTextCompleted:
		if event.Text != nil {
			sink.mu.Lock()
			sink.text = event.Text.Text
			sink.mu.Unlock()
		}
	case agent.EventKindActivityStarted,
		agent.EventKindActivityUpdated,
		agent.EventKindActivityCompleted,
		agent.EventKindApprovalRequested:
		return fmt.Errorf("restricted master attempted provider activity %s", event.Kind)
	}
	return nil
}

func (sink *masterCallSink) completedText() string {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	return sink.text
}
