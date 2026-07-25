package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"

	"setta/internal/agent"
	"setta/internal/director"
	"setta/internal/master"
)

// The Director's structured decision caller.
//
// This is the consumer-owned half of the decision boundary: it holds provider
// identity, the resolved model, and the isolated thread the Director decides on,
// and it holds nothing about what a decision means. It returns raw structured
// output, because deciding what output means belongs to the protocol.
//
// Every decision runs on its own fresh, read-only, tool-less provider thread.
// The decision protocol supplies the model's entire authority in one context
// bundle and re-supplies it on a retry, so thread history is not just
// unnecessary — a decision that could be influenced by a previous request's
// history would be authorized by something the app never validated.

// directorDecisionRole resolves the app-global routing role one decision turn
// runs as. It is the same durable role profile Setta already owns; the Director
// does not get to choose its own model, effort, permissions, or input budget.
type directorDecisionRole interface {
	ResolveMasterRoleConfiguration(context.Context) (master.RoleConfiguration, error)
}

// directorStructuredCallProvider runs one isolated schema-constrained turn.
type directorStructuredCallProvider interface {
	RunFreshStructuredCall(
		context.Context,
		agent.FreshStructuredCallRequest,
	) (agent.FreshStructuredCallResult, error)
}

type directorDecisionCaller struct {
	roles         directorDecisionRole
	provider      directorStructuredCallProvider
	workspaceRoot string
	newID         func(string) (string, error)
}

func newDirectorDecisionCaller(
	roles directorDecisionRole,
	provider directorStructuredCallProvider,
	workspaceRoot string,
) (*directorDecisionCaller, error) {
	if roles == nil || provider == nil {
		return nil, errors.New("director decision caller requires a role resolver and a structured call provider")
	}
	if workspaceRoot == "" || !filepath.IsAbs(workspaceRoot) {
		return nil, fmt.Errorf("director decision workspace root must be absolute: %s", workspaceRoot)
	}
	return &directorDecisionCaller{
		roles:         roles,
		provider:      provider,
		workspaceRoot: filepath.Clean(workspaceRoot),
		newID:         randomDirectorRequestID,
	}, nil
}

// randomDirectorRequestID names one provider call. It is provider-facing
// correlation only: the durable decision is identified by the fact the executor
// commits, not by the request that produced it.
func randomDirectorRequestID(prefix string) (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(data[:]), nil
}

// CallDecision runs one Director decision turn and hands back exactly what the
// provider returned.
func (caller *directorDecisionCaller) CallDecision(
	ctx context.Context,
	call director.DecisionCall,
) (json.RawMessage, error) {
	if caller == nil || caller.roles == nil || caller.provider == nil {
		return nil, errors.New("director decision caller is unavailable")
	}
	if ctx == nil {
		return nil, errors.New("director decision call context is required")
	}
	input, err := director.DecisionCallInput(call)
	if err != nil {
		return nil, err
	}
	request, err := caller.structuredRequest(ctx, call, input)
	if err != nil {
		return nil, err
	}
	result, err := caller.provider.RunFreshStructuredCall(ctx, request)
	if err != nil {
		return nil, fmt.Errorf("run director decision turn %s: %w", request.ID, err)
	}
	return result.Output, nil
}

func (caller *directorDecisionCaller) structuredRequest(
	ctx context.Context,
	call director.DecisionCall,
	input json.RawMessage,
) (agent.FreshStructuredCallRequest, error) {
	configuration, err := caller.roles.ResolveMasterRoleConfiguration(ctx)
	if err != nil {
		return agent.FreshStructuredCallRequest{}, fmt.Errorf("resolve director decision role: %w", err)
	}
	// The role's input budget is the app's, not the model's. A request too large
	// to route is the caller's request being too large, so it is rejected rather
	// than sent truncated: a decision made from a clipped context would be
	// authorized against something the app never showed the Director.
	if len(input) > configuration.MaxInputBytes {
		return agent.FreshStructuredCallRequest{}, fmt.Errorf(
			"%w: the submitted request needs %d bytes of routing context, and the Director role allows %d",
			director.ErrDirectorIntentRejected,
			len(input),
			configuration.MaxInputBytes,
		)
	}
	invocation, err := configuration.PinnedInvocation()
	if err != nil {
		return agent.FreshStructuredCallRequest{}, err
	}
	requestID, err := caller.newID("director_decision")
	if err != nil {
		return agent.FreshStructuredCallRequest{}, err
	}
	request := agent.FreshStructuredCallRequest{
		ID:                    requestID,
		WorkspaceRoot:         caller.workspaceRoot,
		Invocation:            invocation,
		DeveloperInstructions: director.DecisionThreadInstructions(),
		Input:                 input,
		OutputSchema:          call.Schema,
	}
	if err := request.Validate(); err != nil {
		return agent.FreshStructuredCallRequest{}, fmt.Errorf("validate director decision turn: %w", err)
	}
	return request, nil
}
