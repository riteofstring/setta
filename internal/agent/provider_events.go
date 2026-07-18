package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/codexapp"
)

func (runtime *Runtime) handleProviderEvent(ctx context.Context, providerEvent codexapp.Event, base Event, sink EventSink) (TurnResult, bool, error) {
	switch providerEvent.Kind {
	case codexapp.EventLifecycle:
		message := "provider lifecycle changed"
		if providerEvent.Err != nil {
			message = providerEvent.Err.Error()
		}
		event := base
		event.Kind = EventKindLifecycleChanged
		event.Lifecycle = &LifecycleEvent{State: "unavailable", Reason: "provider_lifecycle", Error: &message}
		if err := emitAgentEvent(sink, event); err != nil {
			return TurnResult{}, false, err
		}
		return TurnResult{}, false, fmt.Errorf("agent provider lifecycle failed: %s", message)
	case codexapp.EventLag:
		event := base
		event.Kind = EventKindLifecycleChanged
		event.Lifecycle = &LifecycleEvent{State: "degraded", Reason: "provider_event_lag"}
		return TurnResult{}, false, emitAgentEvent(sink, event)
	case codexapp.EventRequest:
		if providerEvent.Message.Method == codexapp.CodexServerRequestItemToolCall {
			return runtime.handleDynamicToolCall(ctx, providerEvent.Message, base)
		}
		approval, err := runtime.captureApproval(providerEvent.Message, base)
		if err != nil {
			_ = providerEvent.Message.RespondError(-32601, err.Error())
			return TurnResult{}, false, err
		}
		event := base
		event.Kind = EventKindApprovalRequested
		event.Approval = &approval
		return TurnResult{}, false, emitAgentEvent(sink, event)
	case codexapp.EventNotification:
		return runtime.handleProviderNotification(providerEvent.Message, base, sink)
	default:
		return TurnResult{}, false, fmt.Errorf("unsupported codex session event kind %q", providerEvent.Kind)
	}
}

func (runtime *Runtime) handleDynamicToolCall(
	ctx context.Context,
	message codexapp.Message,
	base Event,
) (TurnResult, bool, error) {
	params, err := codexapp.DecodeDynamicToolCallParams(message.Params)
	if err != nil {
		_ = message.RespondError(-32602, err.Error())
		return TurnResult{}, false, err
	}
	if err := requireProviderScope(base, params.ThreadID, params.TurnID); err != nil {
		_ = message.RespondError(-32600, err.Error())
		return TurnResult{}, false, err
	}
	tool, call, err := runtime.dynamicToolForCall(base, params)
	if err != nil {
		_ = message.RespondError(-32601, err.Error())
		return TurnResult{}, false, err
	}
	result, err := tool.Handler(ctx, call)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			_ = message.RespondError(-32000, ctxErr.Error())
			return TurnResult{}, false, ctxErr
		}
		result = DynamicToolResult{
			ContentItems: []DynamicToolContentItem{{
				Type: "inputText",
				Text: err.Error(),
			}},
			Success: false,
		}
	}
	if err := validateDynamicToolResult(result); err != nil {
		_ = message.RespondError(-32603, err.Error())
		return TurnResult{}, false, err
	}
	if err := message.RespondResult(map[string]any{
		"contentItems": result.ContentItems,
		"success":      result.Success,
	}); err != nil {
		return TurnResult{}, false, err
	}
	return TurnResult{}, false, nil
}

func (runtime *Runtime) dynamicToolForCall(
	base Event,
	params codexapp.DynamicToolCallParams,
) (DynamicTool, DynamicToolCall, error) {
	runtime.mu.Lock()
	active := runtime.active[base.ConversationID]
	runtime.mu.Unlock()
	if active == nil {
		return DynamicTool{}, DynamicToolCall{}, fmt.Errorf("conversation %s has no active provider turn", base.ConversationID)
	}
	namespace := ""
	if params.Namespace != nil {
		namespace = *params.Namespace
	}
	key := dynamicToolKey{namespace: namespace, name: params.Tool}
	tool, ok := active.dynamicTools[key]
	if !ok {
		return DynamicTool{}, DynamicToolCall{}, fmt.Errorf("dynamic tool %s is not registered for conversation %s turn %s", key.display(), active.conversationID, active.settaTurnID)
	}
	return tool, DynamicToolCall{
		CallID:           params.CallId,
		ConversationID:   active.conversationID,
		TurnID:           active.settaTurnID,
		ProviderThreadID: params.ThreadID,
		ProviderTurnID:   params.TurnID,
		Namespace:        namespace,
		Tool:             params.Tool,
		Arguments:        append(json.RawMessage{}, params.Arguments...),
	}, nil
}

func (runtime *Runtime) handleProviderNotification(message codexapp.Message, base Event, sink EventSink) (TurnResult, bool, error) {
	events, terminal, err := normalizedProviderNotification(message, base)
	if err != nil {
		return TurnResult{}, false, err
	}
	for _, event := range events {
		if err := emitAgentEvent(sink, event); err != nil {
			return TurnResult{}, false, err
		}
	}
	if terminal == nil {
		return TurnResult{}, false, nil
	}
	return TurnResult{
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
		Outcome:          terminal.Outcome,
		Error:            terminal.Error,
	}, true, nil
}

func normalizedProviderNotification(message codexapp.Message, base Event) ([]Event, *TerminalEvent, error) {
	handler := providerNotificationHandlers[message.Method]
	if handler == nil {
		return nil, nil, nil
	}
	return handler(message.Params, base)
}

type providerNotificationHandler func([]byte, Event) ([]Event, *TerminalEvent, error)

var providerNotificationHandlers = map[string]providerNotificationHandler{
	codexapp.CodexNotificationTurnStarted:                     normalizeTurnStarted,
	codexapp.CodexNotificationItemAgentMessageDelta:           normalizeAgentTextDelta,
	codexapp.CodexNotificationItemReasoningSummaryTextDelta:   normalizeReasoningDelta,
	codexapp.CodexNotificationTurnPlanUpdated:                 normalizePlanUpdated,
	codexapp.CodexNotificationItemStarted:                     normalizeItemStarted,
	codexapp.CodexNotificationItemCompleted:                   normalizeItemCompleted,
	codexapp.CodexNotificationItemCommandExecutionOutputDelta: normalizeCommandOutputDelta,
	codexapp.CodexNotificationItemFileChangePatchUpdated:      normalizeFilePatchUpdated,
	codexapp.CodexNotificationModelRerouted:                   normalizeModelRerouted,
	codexapp.CodexNotificationTurnCompleted:                   normalizeTurnCompleted,
	codexapp.CodexNotificationError:                           normalizeProviderError,
}

func normalizeTurnStarted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeTurnStartedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return nil, nil, requireProviderScope(base, notification.ThreadID, notification.Turn.ID)
}

func normalizeAgentTextDelta(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeAgentMessageDeltaNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedTextDelta(base, notification.ThreadID, notification.TurnID, notification.ItemId, notification.Delta, EventKindAgentTextDelta)
}

func normalizeReasoningDelta(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeReasoningSummaryTextDeltaNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedTextDelta(base, notification.ThreadID, notification.TurnID, notification.ItemId, notification.Delta, EventKindReasoningSummary)
}

func normalizedTextDelta(base Event, threadID string, turnID string, itemID string, text string, kind EventKind) ([]Event, *TerminalEvent, error) {
	if err := requireProviderScope(base, threadID, turnID); err != nil {
		return nil, nil, err
	}
	event := base
	event.Kind = kind
	event.ProviderEventID = stringPointer(itemID)
	event.Text = &TextEvent{ProviderItemID: itemID, Text: text}
	return []Event{event}, nil, nil
}

func normalizePlanUpdated(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeTurnPlanUpdatedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return nil, nil, err
	}
	steps := make([]PlanStep, 0, len(notification.Plan))
	for _, step := range notification.Plan {
		steps = append(steps, PlanStep{Step: step.Step, Status: string(step.Status)})
	}
	event := base
	event.Kind = EventKindPlanChanged
	event.Plan = &PlanEvent{Explanation: cloneString(notification.Explanation), Steps: steps}
	return []Event{event}, nil, nil
}

func normalizeItemStarted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeItemStartedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return nil, nil, err
	}
	return normalizedThreadItem(base, notification.Item, false)
}

func normalizeItemCompleted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeItemCompletedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return nil, nil, err
	}
	return normalizedThreadItem(base, notification.Item, true)
}

func normalizeCommandOutputDelta(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeCommandExecutionOutputDeltaNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedActivityUpdate(base, notification.ThreadID, notification.TurnID, ActivityEvent{
		ProviderItemID: notification.ItemId, Kind: ActivityKindCommand,
		Status: "in_progress", Title: "Command output updated",
	})
}

func normalizeFilePatchUpdated(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeFileChangePatchUpdatedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedActivityUpdate(base, notification.ThreadID, notification.TurnID, ActivityEvent{
		ProviderItemID: notification.ItemId, Kind: ActivityKindFileChange,
		Status: "in_progress", Title: fmt.Sprintf("Updating %d file(s)", len(notification.Changes)),
	})
}

func normalizedActivityUpdate(base Event, threadID string, turnID string, activity ActivityEvent) ([]Event, *TerminalEvent, error) {
	if err := requireProviderScope(base, threadID, turnID); err != nil {
		return nil, nil, err
	}
	event := base
	event.Kind = EventKindActivityUpdated
	event.ProviderEventID = stringPointer(activity.ProviderItemID)
	event.Activity = &activity
	return []Event{event}, nil, nil
}

func normalizeModelRerouted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeModelReroutedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return nil, nil, err
	}
	event := base
	event.Kind = EventKindModelRerouted
	event.ModelReroute = &ModelRerouteEvent{FromModel: notification.FromModel, ToModel: notification.ToModel, Reason: string(notification.Reason)}
	return []Event{event}, nil, nil
}

func normalizeTurnCompleted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeTurnCompletedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.Turn.ID); err != nil {
		return nil, nil, err
	}
	outcome, errorMessage, err := terminalOutcome(notification.Turn)
	if err != nil {
		return nil, nil, err
	}
	terminal := &TerminalEvent{Outcome: outcome, Error: errorMessage}
	event := base
	event.Kind = EventKindTurnTerminal
	event.Terminal = terminal
	return []Event{event}, terminal, nil
}

func normalizeProviderError(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeErrorNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return nil, nil, err
	}
	message := notification.Error.Message
	event := base
	event.Kind = EventKindLifecycleChanged
	event.Lifecycle = &LifecycleEvent{State: "degraded", Reason: "provider_error", Error: &message}
	return []Event{event}, nil, nil
}

func requireProviderScope(base Event, threadID string, turnID string) error {
	if threadID != base.ProviderThreadID || turnID != base.ProviderTurnID {
		return fmt.Errorf("provider event scope %s/%s does not match active turn %s/%s", threadID, turnID, base.ProviderThreadID, base.ProviderTurnID)
	}
	return nil
}

func terminalOutcome(turn codexapp.Turn) (TurnOutcome, *string, error) {
	switch turn.Status {
	case codexapp.TurnStatusCompleted:
		return TurnOutcomeCompleted, nil, nil
	case codexapp.TurnStatusInterrupted:
		return TurnOutcomeInterrupted, nil, nil
	case codexapp.TurnStatusFailed:
		message := "provider turn failed"
		if turn.Error != nil && turn.Error.Message != "" {
			message = turn.Error.Message
		}
		return TurnOutcomeFailed, &message, nil
	default:
		return "", nil, fmt.Errorf("provider terminal notification has nonterminal status %q", turn.Status)
	}
}

func stringPointer(value string) *string {
	return &value
}

var errUnsupportedThreadItem = errors.New("unsupported provider thread item")
