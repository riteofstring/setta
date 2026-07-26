package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

func (runtime *Runtime) RunTurn(ctx context.Context, request TurnRequest, sink EventSink) (TurnResult, error) {
	if err := validateRunTurn(runtime, request, sink); err != nil {
		return TurnResult{}, err
	}
	if runtime.workloadLease == nil {
		if err := runtime.admitTurn(ctx); err != nil {
			return TurnResult{}, err
		}
		return runtime.runTurn(ctx, request, sink)
	}
	select {
	case <-ctx.Done():
		return TurnResult{}, ctx.Err()
	case <-runtime.workloadSlot:
	}
	defer func() {
		runtime.workloadSlot <- struct{}{}
	}()
	if err := runtime.admitTurn(ctx); err != nil {
		return TurnResult{}, err
	}
	return runtime.workloadLease.run(ctx, func(leaseCtx context.Context) (TurnResult, error) {
		return runtime.runTurn(leaseCtx, request, sink)
	})
}

func (runtime *Runtime) admitTurn(ctx context.Context) error {
	if runtime.admit == nil {
		return nil
	}
	if err := runtime.admit.AdmitTurn(ctx); err != nil {
		return fmt.Errorf("admit agent turn: %w", err)
	}
	return nil
}

func (runtime *Runtime) runTurn(ctx context.Context, request TurnRequest, sink EventSink) (TurnResult, error) {
	session, err := runtime.openTurnSession(ctx, request)
	if err != nil {
		return TurnResult{}, err
	}
	defer session.Close()
	defer runtime.releaseTurn(request.ConversationID)
	base, err := runtime.startProviderTurn(ctx, request, sink, session)
	if err != nil {
		return TurnResult{}, err
	}
	return runtime.waitForProviderTurn(ctx, session, base, sink)
}

func validateRunTurn(runtime *Runtime, request TurnRequest, sink EventSink) error {
	if runtime == nil || runtime.manager == nil {
		return errors.New("agent runtime is required")
	}
	if sink == nil {
		return errors.New("agent event sink is required")
	}
	return request.Validate()
}

func (runtime *Runtime) openTurnSession(ctx context.Context, request TurnRequest) (*codexapp.Session, error) {
	session, err := runtime.manager.NewSession(ctx)
	if err != nil {
		return nil, fmt.Errorf("create agent turn session: %w", err)
	}
	if err := session.OwnThread(request.ProviderThreadID); err != nil {
		session.Close()
		return nil, err
	}
	if err := runtime.reserveTurn(request, session); err != nil {
		session.Close()
		return nil, err
	}
	return session, nil
}

func (runtime *Runtime) startProviderTurn(ctx context.Context, request TurnRequest, sink EventSink, session *codexapp.Session) (Event, error) {
	params, err := turnStartParams(request)
	if err != nil {
		return Event{}, err
	}
	raw, err := session.Call(ctx, codexapp.CodexMethodTurnStart, params)
	if err != nil {
		return Event{}, providerThreadOperationError("start agent turn", request.ProviderThreadID, err)
	}
	response, err := codexapp.DecodeTurnStartResponse(raw)
	if err != nil {
		return Event{}, fmt.Errorf("decode agent turn start: %w", err)
	}
	providerTurnID := response.Turn.ID
	if providerTurnID == "" {
		return Event{}, errors.New("agent turn start response has no provider turn id")
	}
	if err := session.OwnTurn(request.ProviderThreadID, providerTurnID); err != nil {
		return Event{}, err
	}
	if err := runtime.setProviderTurnID(request.ConversationID, providerTurnID); err != nil {
		return Event{}, err
	}
	base := eventBase(request, providerTurnID)
	err = emitAgentEvent(sink, Event{
		Kind:             EventKindTurnStarted,
		ConversationID:   base.ConversationID,
		TurnID:           base.TurnID,
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
	})
	if err != nil {
		return Event{}, err
	}
	return base, nil
}

func (runtime *Runtime) waitForProviderTurn(ctx context.Context, session *codexapp.Session, base Event, sink EventSink) (TurnResult, error) {
	for {
		select {
		case <-ctx.Done():
			return TurnResult{}, ctx.Err()
		case providerEvent, ok := <-session.Events():
			if !ok {
				return TurnResult{}, errors.New("agent provider session closed before turn completed")
			}
			result, done, err := runtime.handleProviderEvent(ctx, providerEvent, base, sink)
			if err != nil {
				return TurnResult{}, err
			}
			if done {
				return result, nil
			}
		}
	}
}

func (runtime *Runtime) SteerTurn(ctx context.Context, request TurnControlRequest) error {
	if err := request.Validate(true); err != nil {
		return err
	}
	active, err := runtime.activeTurnFor(request)
	if err != nil {
		return err
	}
	input, err := textUserInput(request.Text)
	if err != nil {
		return err
	}
	raw, err := active.session.Call(ctx, codexapp.CodexMethodTurnSteer, codexapp.TurnSteerParams{
		ClientUserMessageId: &request.ClientInputID,
		ExpectedTurnId:      request.ProviderTurnID,
		Input:               []codexapp.UserInput{input},
		ThreadID:            request.ProviderThreadID,
	})
	if err != nil {
		return fmt.Errorf("steer agent turn %s: %w", request.ProviderTurnID, err)
	}
	response, err := codexapp.DecodeTurnSteerResponse(raw)
	if err != nil {
		return fmt.Errorf("decode agent turn steering %s: %w", request.ProviderTurnID, err)
	}
	if response.TurnID != request.ProviderTurnID {
		return fmt.Errorf("agent steering rebound turn %s to unexpected turn %s", request.ProviderTurnID, response.TurnID)
	}
	return nil
}

func (runtime *Runtime) InterruptTurn(ctx context.Context, request TurnControlRequest) error {
	if err := request.Validate(false); err != nil {
		return err
	}
	active, err := runtime.activeTurnFor(request)
	if err != nil {
		return err
	}
	raw, err := active.session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: request.ProviderThreadID,
		TurnID:   request.ProviderTurnID,
	})
	if err != nil {
		return fmt.Errorf("interrupt agent turn %s: %w", request.ProviderTurnID, err)
	}
	if _, err := codexapp.DecodeTurnInterruptResponse(raw); err != nil {
		return fmt.Errorf("decode agent turn interruption %s: %w", request.ProviderTurnID, err)
	}
	return nil
}

// InterruptProviderTurn targets a provider-owned turn without requiring the
// in-memory RunTurn attachment. Side disposal uses it while the current process
// still owns the ephemeral carrier but no local RunTurn attachment remains.
func (runtime *Runtime) InterruptProviderTurn(ctx context.Context, threadID string, turnID string) error {
	if strings.TrimSpace(threadID) == "" || strings.TrimSpace(turnID) == "" {
		return errors.New("provider turn interruption requires thread and turn ids")
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: threadID,
		TurnID:   turnID,
	})
	if err != nil {
		return fmt.Errorf("interrupt provider turn %s: %w", turnID, err)
	}
	if _, err := codexapp.DecodeTurnInterruptResponse(raw); err != nil {
		return fmt.Errorf("decode provider turn interruption %s: %w", turnID, err)
	}
	return nil
}

func turnStartParams(request TurnRequest) (codexapp.TurnStartParams, error) {
	input, err := textUserInput(request.Text)
	if err != nil {
		return codexapp.TurnStartParams{}, err
	}
	params := codexapp.TurnStartParams{
		ClientUserMessageId: &request.ClientInputID,
		CWD:                 &request.WorkspaceRoot,
		Input:               []codexapp.UserInput{input},
		ServiceTier:         cloneString(request.Invocation.ServiceTier),
		ThreadID:            request.ProviderThreadID,
	}
	if !request.Invocation.ModelSelectionProviderDefault {
		params.Model = &request.Invocation.Model
	}
	if request.Invocation.ReasoningEffort != "" {
		effort := codexapp.ReasoningEffort(request.Invocation.ReasoningEffort)
		params.Effort = &effort
	}
	if len(request.OutputSchema) > 0 {
		if !json.Valid(request.OutputSchema) {
			return codexapp.TurnStartParams{}, errors.New("agent turn output schema must be valid JSON")
		}
		params.OutputSchema = append(json.RawMessage{}, request.OutputSchema...)
	}
	return params, nil
}

func textUserInput(text string) (codexapp.UserInput, error) {
	if strings.TrimSpace(text) == "" {
		return nil, errors.New("agent text input is required")
	}
	raw, err := json.Marshal(map[string]string{"type": "text", "text": text})
	if err != nil {
		return nil, fmt.Errorf("encode agent text input: %w", err)
	}
	return raw, nil
}

func eventBase(request TurnRequest, providerTurnID string) Event {
	return Event{
		ConversationID:   request.ConversationID,
		TurnID:           request.TurnID,
		ProviderThreadID: request.ProviderThreadID,
		ProviderTurnID:   providerTurnID,
	}
}

func emitAgentEvent(sink EventSink, event Event) error {
	if err := event.Validate(); err != nil {
		return err
	}
	return sink.HandleAgentEvent(event)
}
