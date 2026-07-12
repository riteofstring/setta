package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// RestrictedStructuredTurnRequest runs one schema-constrained turn on an
// existing durable restricted thread. The caller owns the durable thread
// identity; this surface cannot create, fork, unsubscribe, or widen it.
type RestrictedStructuredTurnRequest struct {
	ID               string          `json:"id"`
	ProviderThreadID string          `json:"providerThreadId"`
	WorkspaceRoot    string          `json:"workspaceRoot"`
	Invocation       Invocation      `json:"invocation"`
	Input            json.RawMessage `json:"input"`
	OutputSchema     json.RawMessage `json:"outputSchema"`
}

type RestrictedStructuredTurnResult struct {
	ProviderThreadID string          `json:"providerThreadId"`
	ProviderTurnID   string          `json:"providerTurnId"`
	Output           json.RawMessage `json:"output"`
}

func (request RestrictedStructuredTurnRequest) Validate() error {
	if strings.TrimSpace(request.ID) == "" || strings.TrimSpace(request.ID) != request.ID {
		return errors.New("restricted structured turn id must be non-empty without surrounding whitespace")
	}
	if strings.TrimSpace(request.ProviderThreadID) == "" ||
		strings.TrimSpace(request.ProviderThreadID) != request.ProviderThreadID {
		return errors.New("restricted structured turn provider thread id must be non-empty without surrounding whitespace")
	}
	if err := validateWorkspaceRoot(request.WorkspaceRoot); err != nil {
		return err
	}
	if err := validateRestrictedThreadInvocation(request.Invocation); err != nil {
		return err
	}
	if _, err := strictJSONObject(request.Input, "restricted structured turn input"); err != nil {
		return err
	}
	return validateStrictOutputSchema(request.OutputSchema)
}

// RunRestrictedStructuredTurn preserves durable provider history while using
// the same strict response and no-provider-activity checks as isolated
// structured calls. An unfinished turn is interrupted, but its durable thread
// is never unsubscribed by this operation.
func (runtime *Runtime) RunRestrictedStructuredTurn(
	ctx context.Context,
	request RestrictedStructuredTurnRequest,
) (result RestrictedStructuredTurnResult, returnErr error) {
	if runtime == nil || runtime.manager == nil {
		return RestrictedStructuredTurnResult{}, errors.New("agent runtime is required")
	}
	if ctx == nil {
		return RestrictedStructuredTurnResult{}, errors.New("restricted structured turn context is required")
	}
	if err := request.Validate(); err != nil {
		return RestrictedStructuredTurnResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return RestrictedStructuredTurnResult{}, err
	}

	session, err := runtime.manager.NewSession(ctx)
	if err != nil {
		return RestrictedStructuredTurnResult{}, fmt.Errorf("create restricted structured turn session: %w", err)
	}
	defer session.Close()
	if err := session.OwnThread(request.ProviderThreadID); err != nil {
		return RestrictedStructuredTurnResult{}, err
	}
	turnID, err := runtime.startSchemaConstrainedTurn(
		ctx,
		session,
		request.ProviderThreadID,
		schemaConstrainedTurnRequest{
			ID:            request.ID,
			WorkspaceRoot: request.WorkspaceRoot,
			Invocation:    request.Invocation,
			Input:         request.Input,
			OutputSchema:  request.OutputSchema,
		},
	)
	if err != nil {
		return RestrictedStructuredTurnResult{}, err
	}
	terminalReceived := false
	cleanup := structuredTurnCleanup{
		session:          session,
		threadID:         request.ProviderThreadID,
		turnID:           turnID,
		requestID:        request.ID,
		terminalReceived: &terminalReceived,
	}
	defer cleanup.apply(&returnErr)

	output, err := runtime.waitForStructuredTurn(
		ctx,
		session,
		request.ID,
		request.ProviderThreadID,
		turnID,
		&terminalReceived,
	)
	if err != nil {
		return RestrictedStructuredTurnResult{}, err
	}
	return RestrictedStructuredTurnResult{
		ProviderThreadID: request.ProviderThreadID,
		ProviderTurnID:   turnID,
		Output:           output,
	}, nil
}
