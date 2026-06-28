package chat

import (
	"setta/internal/codexapp"
)

// Connection-scoped background terminal routing for
// docs/plans/background_terminal_lifecycle_plan.md.
//
// A Codex unified-exec process can keep running, emit output, and finally exit
// after the assistant turn that started it has completed. The per-turn session is
// closed when StartTurn returns, so those late notifications never reach the turn
// sink. These handlers are registered on the shared codexapp.Manager, whose
// dispatch loop lives for the provider connection, so they run regardless of any
// active turn.
//
// During an active turn the run-scoped TurnSink path is authoritative for
// unified-exec lifecycle, so these handlers defer to it: routing is gated by a
// per-thread turn-active flag. The flag is set when a turn starts and cleared by
// the connection-scoped turn/completed handler. Because the flag transition and
// the late-event handlers all run on the single manager dispatch goroutine in
// provider-message order, a process completion emitted right after turn/completed
// is deterministically observed as late (the flag is already cleared) rather than
// racing the turn teardown on the StartTurn goroutine.

func (harness *CodexHarness) registerBackgroundTerminalHandlers() {
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationItemStarted, harness.handleConnectionItemStarted)
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationTurnCompleted, harness.handleConnectionTurnCompleted)
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationItemCompleted, harness.handleConnectionItemCompleted)
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationItemCommandExecutionOutputDelta, harness.handleConnectionOutputDelta)
}

// SetBackgroundTerminalSink attaches the conversation-scoped sink that late
// unified-exec notifications update. It is set once after the chat service is
// constructed; handlers are no-ops until it is present.
func (harness *CodexHarness) SetBackgroundTerminalSink(sink BackgroundTerminalSink) {
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	harness.backgroundSink = sink
}

func (harness *CodexHarness) beginBackgroundTerminalTurn(threadID string, workspaceID string, conversationID string) {
	if threadID == "" {
		return
	}
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	harness.threadContexts[threadID] = backgroundTerminalThreadContext{workspaceID: workspaceID, conversationID: conversationID}
	harness.turnActiveByThread[threadID] = true
}

func (harness *CodexHarness) endBackgroundTerminalTurn(threadID string) {
	if threadID == "" {
		return
	}
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	harness.turnActiveByThread[threadID] = false
}

// backgroundTerminalLateRouting returns the sink and conversation context for a
// thread only when no turn is currently active on it, so the run-scoped TurnSink
// path owns during-turn lifecycle and these handlers own the late events. The
// overlapping case — an earlier turn's terminal emitting while a *different* turn
// is active on the same thread — is handled on the session path by
// routeCrossTurnBackgroundNotification, which has the active turn id, not here.
func (harness *CodexHarness) backgroundTerminalLateRouting(threadID string) (BackgroundTerminalSink, backgroundTerminalThreadContext, bool) {
	if threadID == "" {
		return nil, backgroundTerminalThreadContext{}, false
	}
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	if harness.turnActiveByThread[threadID] {
		return nil, backgroundTerminalThreadContext{}, false
	}
	context, ok := harness.threadContexts[threadID]
	if !ok || harness.backgroundSink == nil {
		return nil, backgroundTerminalThreadContext{}, false
	}
	return harness.backgroundSink, context, true
}

func (harness *CodexHarness) recordBackgroundItemID(providerItemID string) {
	if providerItemID == "" {
		return
	}
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	harness.backgroundItemIDs[providerItemID] = struct{}{}
}

func (harness *CodexHarness) isBackgroundItemID(providerItemID string) bool {
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	_, ok := harness.backgroundItemIDs[providerItemID]
	return ok
}

// backgroundSinkForThread resolves the conversation-scoped sink for a thread
// regardless of turn-active state, used by the session-path cross-turn router.
func (harness *CodexHarness) backgroundSinkForThread(threadID string) (BackgroundTerminalSink, backgroundTerminalThreadContext, bool) {
	if threadID == "" {
		return nil, backgroundTerminalThreadContext{}, false
	}
	harness.backgroundMu.Lock()
	defer harness.backgroundMu.Unlock()
	context, ok := harness.threadContexts[threadID]
	if !ok || harness.backgroundSink == nil {
		return nil, backgroundTerminalThreadContext{}, false
	}
	return harness.backgroundSink, context, true
}

// routeCrossTurnBackgroundNotification handles a unified-exec output or completion
// that reaches the active turn's session but belongs to a background terminal from
// an EARLIER turn on the same thread (its notification carries the earlier turn's
// id). Codex still delivers such thread-scoped notifications to the active session,
// where strict turn-id matching would otherwise fail the current turn. Instead it
// is routed to the background terminal registry and skipped on the run path. It
// returns handled=false for anything that is not a cross-turn background event, so
// during-turn (matching turn id) lifecycle still flows through the normal path.
func (harness *CodexHarness) routeCrossTurnBackgroundNotification(message jsonRPCMessage, threadID string, activeTurnID string) (bool, error) {
	switch message.Method {
	case codexapp.CodexNotificationItemCompleted:
		return harness.routeCrossTurnBackgroundCompletion(message, threadID, activeTurnID)
	case codexapp.CodexNotificationItemCommandExecutionOutputDelta:
		return harness.routeCrossTurnBackgroundOutput(message, threadID, activeTurnID)
	default:
		return false, nil
	}
}

func (harness *CodexHarness) routeCrossTurnBackgroundCompletion(message jsonRPCMessage, threadID string, activeTurnID string) (bool, error) {
	params, err := codexapp.DecodeItemCompletedNotification(message.Params)
	if err != nil || isSameTurn(params.TurnID, activeTurnID) {
		return false, nil
	}
	item, err := objectValue(params.Item, "codex item")
	if err != nil {
		return false, nil
	}
	fields, err := codexRunItemExecutionFieldsFromItem(item)
	if err != nil || fields.source == nil || *fields.source != RunItemCommandSourceUnifiedExecStartup {
		return false, nil
	}
	providerItemID, err := requireString(item, "id", "codex item")
	if err != nil {
		return false, nil
	}
	sink, context, ok := harness.backgroundSinkForThread(threadID)
	if !ok {
		return true, nil
	}
	return true, sink.BackgroundTerminalCompleted(context.workspaceID, context.conversationID, providerItemID, fields.processID, fields.exitCode, "")
}

func (harness *CodexHarness) routeCrossTurnBackgroundOutput(message jsonRPCMessage, threadID string, activeTurnID string) (bool, error) {
	params, err := codexapp.DecodeCommandExecutionOutputDeltaNotification(message.Params)
	if err != nil || params.Delta == "" || isSameTurn(params.TurnID, activeTurnID) {
		return false, nil
	}
	if !harness.isBackgroundItemID(params.ItemId) {
		return false, nil
	}
	sink, context, ok := harness.backgroundSinkForThread(threadID)
	if !ok {
		return true, nil
	}
	return true, sink.BackgroundTerminalOutputDelta(context.workspaceID, context.conversationID, params.ItemId, "", codexCommandExecutionOutputStream, params.Delta)
}

// isSameTurn reports whether a notification's turn id belongs to the active turn.
// An empty notification turn id is treated as the active turn (not cross-turn).
func isSameTurn(notificationTurnID string, activeTurnID string) bool {
	return notificationTurnID == "" || notificationTurnID == activeTurnID
}

// handleConnectionItemStarted records every unified-exec startup's command-execution
// item ID so the session-path cross-turn router can recognize an earlier turn's
// background terminal output (which carries no source field) by item ID. It runs
// for the connection, so the set survives across turns on the same thread.
func (harness *CodexHarness) handleConnectionItemStarted(message codexapp.Message) {
	params, err := codexapp.DecodeItemStartedNotification(message.Params)
	if err != nil {
		return
	}
	item, err := objectValue(params.Item, "codex item")
	if err != nil {
		return
	}
	fields, err := codexRunItemExecutionFieldsFromItem(item)
	if err != nil || fields.source == nil || *fields.source != RunItemCommandSourceUnifiedExecStartup {
		return
	}
	providerItemID, err := requireString(item, "id", "codex item")
	if err != nil {
		return
	}
	harness.recordBackgroundItemID(providerItemID)
}

func (harness *CodexHarness) handleConnectionTurnCompleted(message codexapp.Message) {
	params, err := codexapp.DecodeTurnCompletedNotification(message.Params)
	if err != nil {
		return
	}
	harness.endBackgroundTerminalTurn(params.ThreadID)
}

func (harness *CodexHarness) handleConnectionItemCompleted(message codexapp.Message) {
	params, err := codexapp.DecodeItemCompletedNotification(message.Params)
	if err != nil {
		return
	}
	item, err := objectValue(params.Item, "codex item")
	if err != nil {
		return
	}
	fields, err := codexRunItemExecutionFieldsFromItem(item)
	if err != nil || fields.source == nil || *fields.source != RunItemCommandSourceUnifiedExecStartup {
		return
	}
	providerItemID, err := requireString(item, "id", "codex item")
	if err != nil {
		return
	}
	sink, context, ok := harness.backgroundTerminalLateRouting(params.ThreadID)
	if !ok {
		return
	}
	_ = sink.BackgroundTerminalCompleted(context.workspaceID, context.conversationID, providerItemID, fields.processID, fields.exitCode, "")
}

func (harness *CodexHarness) handleConnectionOutputDelta(message codexapp.Message) {
	params, err := codexapp.DecodeCommandExecutionOutputDeltaNotification(message.Params)
	if err != nil || params.Delta == "" {
		return
	}
	sink, context, ok := harness.backgroundTerminalLateRouting(params.ThreadID)
	if !ok {
		return
	}
	_ = sink.BackgroundTerminalOutputDelta(context.workspaceID, context.conversationID, params.ItemId, "", codexCommandExecutionOutputStream, params.Delta)
}
