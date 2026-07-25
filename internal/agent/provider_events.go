package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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
		event.Lifecycle = &LifecycleEvent{
			State:  LifecycleStateUnavailable,
			Reason: LifecycleReasonSessionFailed,
			Error:  &message,
		}
		if err := emitAgentEvent(sink, event); err != nil {
			return TurnResult{}, false, err
		}
		return TurnResult{}, false, fmt.Errorf("agent provider lifecycle failed: %s", message)
	case codexapp.EventLag:
		// Dropped provider events mean the durable stream of this run is
		// incomplete, so the run needs reconciliation rather than more output.
		lagMessage := "provider event stream fell behind"
		event := base
		event.Kind = EventKindLifecycleChanged
		event.Lifecycle = &LifecycleEvent{
			State:  LifecycleStateUnavailable,
			Reason: LifecycleReasonEventLag,
			Error:  &lagMessage,
		}
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
		result, err = DynamicToolFailureResult(dynamicToolHandlerFailure(call, err))
		if err != nil {
			_ = message.RespondError(-32603, err.Error())
			return TurnResult{}, false, err
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

func dynamicToolHandlerFailure(call DynamicToolCall, err error) DynamicToolFailure {
	return DynamicToolFailure{
		Code:                "dynamic_tool_handler_failed",
		Message:             err.Error(),
		Retryable:           true,
		FieldErrors:         []DynamicToolFieldError{},
		DiagnosticReference: dynamicToolDiagnosticReference(call, "handler_failed"),
	}
}

func dynamicToolDiagnosticReference(call DynamicToolCall, reason string) string {
	display := call.Tool
	if call.Namespace != "" {
		display = call.Namespace + "." + display
	}
	if call.CallID == "" {
		return "dynamic_tool:" + display + ":" + reason
	}
	return "dynamic_tool:" + display + ":" + call.CallID + ":" + reason
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
	events, terminal, err := normalizedProviderNotification(runtime, message, base)
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

func normalizedProviderNotification(runtime *Runtime, message codexapp.Message, base Event) ([]Event, *TerminalEvent, error) {
	handler := providerNotificationHandlers[message.Method]
	if handler == nil {
		return nil, nil, nil
	}
	return handler(runtime, message.Params, base)
}

// providerNotificationHandler takes the runtime because a few notifications
// report on state only this client holds, such as whether an approval request
// is still waiting on the user here.
type providerNotificationHandler func(*Runtime, []byte, Event) ([]Event, *TerminalEvent, error)

var providerNotificationHandlers = map[string]providerNotificationHandler{
	codexapp.CodexNotificationTurnStarted:                             ignoreRuntime(normalizeTurnStarted),
	codexapp.CodexNotificationItemAgentMessageDelta:                   ignoreRuntime(normalizeAgentTextDelta),
	codexapp.CodexNotificationItemReasoningSummaryTextDelta:           ignoreRuntime(normalizeReasoningDelta),
	codexapp.CodexNotificationTurnPlanUpdated:                         ignoreRuntime(normalizePlanUpdated),
	codexapp.CodexNotificationItemStarted:                             ignoreRuntime(normalizeItemStarted),
	codexapp.CodexNotificationItemCompleted:                           ignoreRuntime(normalizeItemCompleted),
	codexapp.CodexNotificationItemCommandExecutionOutputDelta:         ignoreRuntime(normalizeCommandOutputDelta),
	codexapp.CodexNotificationItemCommandExecutionTerminalInteraction: ignoreRuntime(normalizeTerminalInteraction),
	codexapp.CodexNotificationItemFileChangePatchUpdated:              ignoreRuntime(normalizeFilePatchUpdated),
	codexapp.CodexNotificationItemMcpToolCallProgress:                 ignoreRuntime(normalizeMcpToolProgress),
	codexapp.CodexNotificationHookStarted:                             ignoreRuntime(normalizeHookStarted),
	codexapp.CodexNotificationHookCompleted:                           ignoreRuntime(normalizeHookCompleted),
	codexapp.CodexNotificationModelRerouted:                           ignoreRuntime(normalizeModelRerouted),
	codexapp.CodexNotificationTurnCompleted:                           ignoreRuntime(normalizeTurnCompleted),
	codexapp.CodexNotificationError:                                   ignoreRuntime(normalizeProviderError),
	codexapp.CodexNotificationThreadStatusChanged:                     ignoreRuntime(normalizeThreadStatusChanged),
	codexapp.CodexNotificationThreadEnvironmentConnected:              ignoreRuntime(normalizeEnvironmentConnected),
	codexapp.CodexNotificationThreadEnvironmentDisconnected:           ignoreRuntime(normalizeEnvironmentDisconnected),
	codexapp.CodexNotificationThreadClosed:                            ignoreRuntime(normalizeThreadClosed),
	codexapp.CodexNotificationItemAutoApprovalReviewStarted:           ignoreRuntime(normalizeGuardianReviewStarted),
	codexapp.CodexNotificationItemAutoApprovalReviewCompleted:         ignoreRuntime(normalizeGuardianReviewCompleted),
	codexapp.CodexNotificationModelVerification:                       ignoreRuntime(normalizeModelVerification),
	codexapp.CodexNotificationServerRequestResolved:                   normalizeServerRequestResolved,
}

// ignoreRuntime adapts a normalizer that reads only the notification and the
// active turn, which is all but one of them.
func ignoreRuntime(
	normalize func([]byte, Event) ([]Event, *TerminalEvent, error),
) providerNotificationHandler {
	return func(_ *Runtime, raw []byte, base Event) ([]Event, *TerminalEvent, error) {
		return normalize(raw, base)
	}
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

func normalizeTerminalInteraction(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeTerminalInteractionNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	// The keystrokes sent to an interactive process can carry a passphrase or
	// another secret the user typed into a prompt, so the durable fact is that
	// the command was driven, not what was typed into it.
	return normalizedActivityUpdate(base, notification.ThreadID, notification.TurnID, ActivityEvent{
		ProviderItemID: notification.ItemId, Kind: ActivityKindCommand,
		Status: "in_progress", Title: "Terminal input sent",
	})
}

func normalizeMcpToolProgress(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeMcpToolCallProgressNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedActivityUpdate(base, notification.ThreadID, notification.TurnID, ActivityEvent{
		ProviderItemID: notification.ItemId, Kind: ActivityKindMCPTool,
		Status: "in_progress", Title: "MCP tool progress", Summary: notification.Message,
	})
}

func normalizeHookStarted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeHookStartedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedHookRun(base, notification.ThreadID, notification.TurnID, notification.Run, EventKindActivityStarted)
}

func normalizeHookCompleted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeHookCompletedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedHookRun(base, notification.ThreadID, notification.TurnID, notification.Run, EventKindActivityCompleted)
}

// normalizedHookRun makes a hook execution a typed activity of the run that
// triggered it. A hook that names no turn is thread-scoped provider work, so it
// produces no event rather than being attributed to whichever run is active.
func normalizedHookRun(
	base Event,
	threadID string,
	turnID *string,
	run codexapp.HookRunSummary,
	kind EventKind,
) ([]Event, *TerminalEvent, error) {
	if turnID == nil {
		return nil, nil, nil
	}
	if err := requireProviderScope(base, threadID, *turnID); err != nil {
		return nil, nil, err
	}
	event := base
	event.Kind = kind
	event.ProviderEventID = stringPointer(run.ID)
	event.Activity = &ActivityEvent{
		ProviderItemID: run.ID,
		Kind:           ActivityKindHook,
		Status:         string(run.Status),
		Title:          string(run.EventName) + " hook",
		Summary:        hookAttribution(run),
	}
	return []Event{event}, nil, nil
}

// hookAttribution keeps the trusted answer to "whose hook was this" with the
// activity, so a hook that blocks or fails is attributable to the plugin,
// project, or user configuration that installed it.
func hookAttribution(run codexapp.HookRunSummary) string {
	parts := []string{}
	if run.Source != nil {
		parts = append(parts, string(*run.Source))
	}
	if trimmed := strings.TrimSpace(run.SourcePath); trimmed != "" {
		parts = append(parts, trimmed)
	}
	if run.StatusMessage != nil {
		if trimmed := strings.TrimSpace(*run.StatusMessage); trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return strings.Join(parts, " · ")
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
	event.Lifecycle = &LifecycleEvent{
		State:  LifecycleStateUnavailable,
		Reason: LifecycleReasonTurnError,
		Error:  &message,
	}
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
