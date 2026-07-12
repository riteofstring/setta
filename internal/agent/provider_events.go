package agent

import (
	"errors"
	"fmt"

	"setta/internal/codexapp"
)

func (runtime *Runtime) handleProviderEvent(
	providerEvent codexapp.Event,
	base Event,
	sink EventSink,
	usage *turnTokenUsage,
) (TurnResult, bool, error) {
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
		return runtime.handleProviderNotification(providerEvent.Message, base, sink, usage)
	default:
		return TurnResult{}, false, fmt.Errorf("unsupported codex session event kind %q", providerEvent.Kind)
	}
}

func (runtime *Runtime) handleProviderNotification(
	message codexapp.Message,
	base Event,
	sink EventSink,
	usage *turnTokenUsage,
) (TurnResult, bool, error) {
	if message.Method == codexapp.CodexNotificationThreadTokenUsageUpdated {
		if err := observeProviderTokenUsage(message.Params, base, usage); err != nil {
			return TurnResult{}, false, err
		}
		return TurnResult{}, false, nil
	}
	events, terminal, err := normalizedProviderNotification(message, base)
	if err != nil {
		return TurnResult{}, false, err
	}
	if err := emitNormalizedProviderEvents(events, sink, usage); err != nil {
		return TurnResult{}, false, err
	}
	if terminal == nil {
		return TurnResult{}, false, nil
	}
	terminal.Usage = tokenUsagePointer(usage.snapshot())
	return TurnResult{
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
		Outcome:          terminal.Outcome,
		Error:            terminal.Error,
		Usage:            tokenUsagePointer(usage.snapshot()),
	}, true, nil
}

func emitNormalizedProviderEvents(
	events []Event,
	sink EventSink,
	usage *turnTokenUsage,
) error {
	for _, event := range events {
		if event.Kind == EventKindAgentTextCompleted && event.Text != nil {
			if err := usage.addOutput(event.Text.Text); err != nil {
				return err
			}
		}
		if event.Kind == EventKindTurnTerminal && event.Terminal != nil {
			event.Terminal.Usage = tokenUsagePointer(usage.snapshot())
		}
		if err := emitAgentEvent(sink, event); err != nil {
			return err
		}
	}
	return nil
}

func observeProviderTokenUsage(
	raw []byte,
	base Event,
	usage *turnTokenUsage,
) error {
	notification, err := codexapp.DecodeThreadTokenUsageUpdatedNotification(raw)
	if err != nil {
		return err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return err
	}
	return usage.observeProvider(notification)
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
