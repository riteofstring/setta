package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"setta/internal/codexapp"
)

const (
	codexGoalPreSinkMaxNotifications = 1024
	codexGoalPreSinkMaxBytes         = 4 * 1024 * 1024
	codexGoalPreSinkAttachDrainIdle  = 20 * time.Millisecond
	codexGoalFirstTurnTimeout        = 30 * time.Second
)

type codexGoalOperationState string

const (
	codexGoalOperationReserved     codexGoalOperationState = "reserved"
	codexGoalOperationAttached     codexGoalOperationState = "attached"
	codexGoalOperationRouteActive  codexGoalOperationState = "route_active"
	codexGoalOperationSinkAttached codexGoalOperationState = "sink_attached"
	codexGoalOperationStreaming    codexGoalOperationState = "streaming"
	codexGoalOperationFinishing    codexGoalOperationState = "finishing"
	codexGoalOperationFinished     codexGoalOperationState = "finished"
)

type codexGoalOperation struct {
	harness *CodexHarness
	session *codexapp.Session

	threadID       string
	logicalTurnID  string
	currentTurnID  string
	runID          string
	state          codexGoalOperationState
	sinkLinked     bool
	activeGoalSeen bool
	goalFinal      bool
	pendingDone    bool
	physicalActive bool

	mu                sync.Mutex
	attachOnce        sync.Once
	firstTurnOnce     sync.Once
	finishOnce        sync.Once
	attachCh          chan struct{}
	firstTurnCh       chan struct{}
	preSinkDone       chan struct{}
	preSinkStarted    bool
	finished          chan struct{}
	preSink           []codexapp.Event
	preSinkBytes      int
	finishErr         error
	finishComplete    TurnCompletion
	pendingCompletion TurnCompletion
}

func (harness *CodexHarness) reserveGoalOperation(session *codexapp.Session, threadID string) (*codexGoalOperation, error) {
	operation, err := harness.reserveGoalOperationThread(threadID)
	if err != nil {
		return nil, err
	}
	if err := operation.attachSession(session); err != nil {
		operation.finish(TurnCompletion{}, err)
		return nil, err
	}
	return operation, nil
}

func (harness *CodexHarness) reserveGoalOperationThread(threadID string) (*codexGoalOperation, error) {
	if threadID == "" {
		return nil, fmt.Errorf("codex goal operation thread ID is required")
	}
	operation := &codexGoalOperation{
		harness:  harness,
		threadID: threadID,
		state:    codexGoalOperationReserved,

		attachCh:    make(chan struct{}),
		firstTurnCh: make(chan struct{}),
		preSinkDone: make(chan struct{}),
		finished:    make(chan struct{}),
	}
	harness.goalMu.Lock()
	if existing := harness.goalOperations[threadID]; existing != nil {
		harness.goalMu.Unlock()
		return nil, fmt.Errorf("codex goal operation already owns thread %s", threadID)
	}
	harness.goalOperations[threadID] = operation
	harness.goalMu.Unlock()

	return operation, nil
}

func (operation *codexGoalOperation) attachSession(session *codexapp.Session) error {
	if session == nil {
		return fmt.Errorf("codex goal operation session is required")
	}

	operation.mu.Lock()
	if operation.state == codexGoalOperationFinished {
		err := operation.finishedErrorLocked()
		operation.mu.Unlock()
		return err
	}
	if operation.session != nil {
		operation.mu.Unlock()
		return fmt.Errorf("codex goal operation session is already attached for thread %s", operation.threadID)
	}
	operation.session = session
	operation.preSinkStarted = true
	operation.state = codexGoalOperationAttached
	operation.mu.Unlock()

	go operation.bufferPreSinkEvents()
	return nil
}

func (operation *codexGoalOperation) ownThread(session *codexapp.Session, threadID string) error {
	return session.OwnThreadWithActivation(threadID, operation.activateRouting)
}

func (operation *codexGoalOperation) activateRouting() error {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	if operation.state == codexGoalOperationFinished {
		return operation.finishedErrorLocked()
	}
	if operation.session == nil {
		return fmt.Errorf("codex goal operation session is required before route activation")
	}
	switch operation.state {
	case codexGoalOperationReserved, codexGoalOperationAttached:
		operation.state = codexGoalOperationRouteActive
	}
	return nil
}

func (harness *CodexHarness) unregisterGoalOperation(threadID string, operation *codexGoalOperation) {
	harness.goalMu.Lock()
	defer harness.goalMu.Unlock()
	if harness.goalOperations[threadID] == operation {
		delete(harness.goalOperations, threadID)
	}
}

func (harness *CodexHarness) goalOperationForThread(threadID string) (*codexGoalOperation, bool) {
	if threadID == "" {
		return nil, false
	}
	harness.goalMu.Lock()
	defer harness.goalMu.Unlock()
	operation, ok := harness.goalOperations[threadID]
	return operation, ok
}

func (harness *CodexHarness) hasGoalOperation(threadID string) bool {
	_, ok := harness.goalOperationForThread(threadID)
	return ok
}

func (harness *CodexHarness) hasRoutableGoalOperation(threadID string) bool {
	operation, ok := harness.goalOperationForThread(threadID)
	if !ok {
		return false
	}
	return operation.routesConnectionNotifications()
}

func (operation *codexGoalOperation) routesConnectionNotifications() bool {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	switch operation.state {
	case codexGoalOperationRouteActive,
		codexGoalOperationSinkAttached,
		codexGoalOperationStreaming,
		codexGoalOperationFinishing:
		return true
	default:
		return false
	}
}

func (operation *codexGoalOperation) bufferPreSinkEvents() {
	defer close(operation.preSinkDone)
	for {
		select {
		case <-operation.attachCh:
			operation.drainQueuedPreSinkEvents()
			return
		case event, ok := <-operation.session.Events():
			if !ok {
				operation.finish(TurnCompletion{}, fmt.Errorf("codex app-server session closed before goal operation sink attached"))
				return
			}
			if event.Kind == codexapp.EventLifecycle {
				operation.handlePreSinkLifecycle(event)
				return
			}
			if err := operation.bufferPreSinkEvent(event); err != nil {
				operation.finishStartupFailure(err)
				return
			}
		}
	}
}

func (operation *codexGoalOperation) drainQueuedPreSinkEvents() {
	idle := time.NewTimer(codexGoalPreSinkAttachDrainIdle)
	defer idle.Stop()
	for {
		select {
		case event, ok := <-operation.session.Events():
			if !ok {
				operation.finish(TurnCompletion{}, fmt.Errorf("codex app-server session closed before goal operation sink attached"))
				return
			}
			if event.Kind == codexapp.EventLifecycle {
				operation.handlePreSinkLifecycle(event)
				return
			}
			resetTimer(idle, codexGoalPreSinkAttachDrainIdle)
			if err := operation.bufferPreSinkEvent(event); err != nil {
				operation.finishStartupFailure(err)
				return
			}
		case <-idle.C:
			return
		}
	}
}

func (operation *codexGoalOperation) handlePreSinkLifecycle(event codexapp.Event) {
	operation.mu.Lock()
	firstTurnSeen := operation.logicalTurnID != ""
	operation.mu.Unlock()
	if !firstTurnSeen {
		operation.finish(TurnCompletion{}, codexLifecycleError("codex app-server exited before goal operation sink attached", event.Err))
		return
	}
	if err := operation.appendPreSinkEvent(event); err != nil {
		operation.finishStartupFailure(err)
	}
}

func resetTimer(timer *time.Timer, duration time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(duration)
}

func (operation *codexGoalOperation) bufferPreSinkEvent(event codexapp.Event) error {
	switch event.Kind {
	case codexapp.EventNotification:
		threadID, scoped, err := codexNotificationThreadID(event.Message)
		if err != nil {
			return err
		}
		if scoped && threadID != operation.threadID {
			return fmt.Errorf("codex goal operation notification %s targeted thread %s, want %s", event.Message.Method, threadID, operation.threadID)
		}
		if !scoped {
			return operation.requirePreSinkThreadScope(event.Message)
		}
		return operation.appendPreSinkEvent(event)
	case codexapp.EventRequest:
		err := fmt.Errorf("codex goal operation received provider request %s before sink attached", event.Message.Method)
		_ = event.Message.RespondError(-32601, err.Error())
		return err
	default:
		return fmt.Errorf("unsupported codex app-server goal operation pre-sink event: %s", event.Kind)
	}
}

func (operation *codexGoalOperation) requirePreSinkThreadScope(message jsonRPCMessage) error {
	switch codexNotificationScopePolicies[message.Method] {
	case codexNotificationScopeThread, codexNotificationScopeTurnState:
		return fmt.Errorf("codex goal operation notification %s is missing thread scope", message.Method)
	default:
		return nil
	}
}

func (operation *codexGoalOperation) appendPreSinkEvent(event codexapp.Event) error {
	size := len(event.Message.Method) + len(event.Message.Params) + 64
	firstTurnID := ""
	if event.Kind == codexapp.EventNotification && event.Message.Method == codexapp.CodexNotificationTurnStarted {
		params, err := objectValue(event.Message.Params, "codex goal operation turn started params")
		if err != nil {
			return err
		}
		turnID, err := turnStartedID(params)
		if err != nil {
			return err
		}
		firstTurnID = turnID
	}

	var notifyFirstTurn bool
	operation.mu.Lock()
	if len(operation.preSink)+1 > codexGoalPreSinkMaxNotifications || operation.preSinkBytes+size > codexGoalPreSinkMaxBytes {
		operation.mu.Unlock()
		return fmt.Errorf("codex goal operation pre-sink buffer overflow for thread %s", operation.threadID)
	}
	operation.preSink = append(operation.preSink, event)
	operation.preSinkBytes += size
	if firstTurnID != "" && operation.logicalTurnID == "" {
		operation.logicalTurnID = firstTurnID
		operation.currentTurnID = firstTurnID
		notifyFirstTurn = true
	}
	operation.mu.Unlock()

	if notifyFirstTurn {
		operation.firstTurnOnce.Do(func() { close(operation.firstTurnCh) })
		if operation.session != nil {
			return operation.session.OwnTurn(operation.threadID, firstTurnID)
		}
	}
	return nil
}

func (operation *codexGoalOperation) waitForFirstRuntimeTurn(ctx context.Context) error {
	waitCtx := ctx
	cancel := func() {}
	if _, ok := ctx.Deadline(); !ok {
		waitCtx, cancel = context.WithTimeout(ctx, codexGoalFirstTurnTimeout)
	}
	defer cancel()

	select {
	case <-operation.firstTurnCh:
		return nil
	case <-operation.finished:
		operation.mu.Lock()
		defer operation.mu.Unlock()
		return operation.finishedErrorLocked()
	case <-waitCtx.Done():
		var err error
		if waitCtx.Err() == context.DeadlineExceeded {
			err = fmt.Errorf("timed out waiting for codex goal operation runtime turn/started for thread %s: %w", operation.threadID, waitCtx.Err())
		} else {
			err = fmt.Errorf("cancelled while waiting for codex goal operation runtime turn/started for thread %s: %w", operation.threadID, waitCtx.Err())
		}
		return operation.finishStartupFailure(err)
	}
}

func (operation *codexGoalOperation) finishStartupFailure(err error) error {
	if cleanupErr := operation.pauseProviderGoalAfterStartupFailureIfActivated(); cleanupErr != nil {
		err = fmt.Errorf("%w; pause provider goal after startup failure: %v", err, cleanupErr)
	}
	operation.finish(TurnCompletion{}, err)
	return err
}

func (operation *codexGoalOperation) pauseProviderGoalAfterStartupFailureIfActivated() error {
	operation.mu.Lock()
	activated := operation.providerGoalMayBeActiveLocked()
	operation.mu.Unlock()
	if !activated {
		return nil
	}
	return operation.pauseProviderGoalAfterStartupFailure()
}

func (operation *codexGoalOperation) providerGoalMayBeActiveLocked() bool {
	switch operation.state {
	case codexGoalOperationRouteActive,
		codexGoalOperationSinkAttached,
		codexGoalOperationStreaming,
		codexGoalOperationFinishing:
		return true
	default:
		return false
	}
}

func (operation *codexGoalOperation) pauseProviderGoalAfterStartupFailure() error {
	operation.mu.Lock()
	session := operation.session
	operation.mu.Unlock()
	if session == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	status := codexapp.ThreadGoalStatusPaused
	_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Status:   &status,
		ThreadID: operation.threadID,
	})
	return err
}

func (operation *codexGoalOperation) Wait(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := ctx.Err(); err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, err
	}
	operation.harness.registerActive(request.Run.ID, operation.session, request)
	operation.harness.updateActiveTurn(request.Run.ID, operation.threadID, "")
	defer operation.harness.unregisterActive(request.Run.ID)

	if err := operation.attachSink(request.Run.ID); err != nil {
		return TurnCompletion{}, err
	}
	if completion, done, err := operation.replayPreSinkEvents(ctx, sink); err != nil || done {
		return completion, err
	}
	return operation.consumeLiveEvents(ctx, sink)
}

func (operation *codexGoalOperation) attachSink(runID string) error {
	operation.mu.Lock()
	if operation.state == codexGoalOperationFinished {
		err := operation.finishedErrorLocked()
		operation.mu.Unlock()
		operation.attachOnce.Do(func() { close(operation.attachCh) })
		<-operation.preSinkDone
		return err
	}
	operation.runID = runID
	operation.state = codexGoalOperationSinkAttached
	operation.mu.Unlock()

	operation.attachOnce.Do(func() { close(operation.attachCh) })
	<-operation.preSinkDone

	operation.mu.Lock()
	defer operation.mu.Unlock()
	if operation.state == codexGoalOperationFinished {
		return operation.finishedErrorLocked()
	}
	return nil
}

func (operation *codexGoalOperation) replayPreSinkEvents(ctx context.Context, sink TurnSink) (TurnCompletion, bool, error) {
	operation.mu.Lock()
	events := append([]codexapp.Event(nil), operation.preSink...)
	operation.preSink = nil
	operation.preSinkBytes = 0
	if operation.state != codexGoalOperationFinished {
		operation.state = codexGoalOperationStreaming
	}
	operation.mu.Unlock()

	for index, event := range events {
		if err := ctx.Err(); err != nil {
			operation.finish(TurnCompletion{}, err)
			return TurnCompletion{}, true, err
		}
		completion, done, err := operation.applyEvent(ctx, event, sink)
		if err != nil || done {
			if err == nil && done {
				err = operation.replayPostFinishBackgroundTerminalEvents(events[index+1:])
			}
			return completion, done, err
		}
	}
	return TurnCompletion{}, false, nil
}

func (operation *codexGoalOperation) replayPostFinishBackgroundTerminalEvents(events []codexapp.Event) error {
	for _, event := range events {
		if event.Kind != codexapp.EventNotification {
			continue
		}
		_, err := operation.routeBackgroundTerminalNotification(event.Message)
		if err != nil {
			return err
		}
	}
	return nil
}

func (operation *codexGoalOperation) consumeLiveEvents(ctx context.Context, sink TurnSink) (TurnCompletion, error) {
	for {
		select {
		case <-ctx.Done():
			err := ctx.Err()
			operation.finish(TurnCompletion{}, err)
			return TurnCompletion{}, err
		case event, ok := <-operation.session.Events():
			if !ok {
				err := fmt.Errorf("codex app-server session closed before goal operation completed")
				operation.finish(TurnCompletion{}, err)
				return TurnCompletion{}, err
			}
			completion, done, err := operation.applyEvent(ctx, event, sink)
			if err != nil || done {
				return completion, err
			}
		}
	}
}

func (operation *codexGoalOperation) applyEvent(ctx context.Context, event codexapp.Event, sink TurnSink) (TurnCompletion, bool, error) {
	switch event.Kind {
	case codexapp.EventRequest:
		message, err := operation.rewriteMessageToLogicalTurn(event.Message)
		if err != nil {
			operation.finish(TurnCompletion{}, err)
			return TurnCompletion{}, true, err
		}
		if err := operation.harness.handleCodexServerRequestForTurn(ctx, message, operation.runID, operation.threadID, operation.logicalTurn(), sink); err != nil {
			operation.finish(TurnCompletion{}, err)
			return TurnCompletion{}, true, err
		}
		return TurnCompletion{}, false, nil
	case codexapp.EventNotification:
		return operation.applyNotification(ctx, event.Message, sink)
	case codexapp.EventLifecycle:
		err := codexLifecycleError("codex app-server exited before goal operation completed", event.Err)
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	default:
		err := fmt.Errorf("unsupported codex app-server goal operation event: %s", event.Kind)
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
}

func (operation *codexGoalOperation) applyNotification(ctx context.Context, message jsonRPCMessage, sink TurnSink) (TurnCompletion, bool, error) {
	if err := operation.requireGoalNotificationThread(message); err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	if operation.dropGoalClearedBeforeActive(message) {
		return TurnCompletion{}, false, nil
	}
	if handled, err := operation.routeBackgroundTerminalNotification(message); handled {
		return operation.applyBackgroundTerminalRouteResult(err)
	}
	switch message.Method {
	case codexapp.CodexNotificationTurnStarted:
		return operation.applyTurnStarted(ctx, message, sink)
	case codexapp.CodexNotificationTurnCompleted:
		return operation.applyTurnCompleted(ctx, message, sink)
	}
	message, err := operation.rewriteMessageToLogicalTurn(message)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	result, err := operation.harness.handleCodexNotification(ctx, operation.session, message, operation.runID, operation.threadID, operation.logicalTurn(), sink)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	return operation.applyNotificationResult(message, result, sink)
}

func (operation *codexGoalOperation) dropGoalClearedBeforeActive(message jsonRPCMessage) bool {
	return message.Method == codexapp.CodexNotificationThreadGoalCleared && !operation.hasSeenActiveGoalUpdate()
}

func (operation *codexGoalOperation) applyBackgroundTerminalRouteResult(err error) (TurnCompletion, bool, error) {
	if err != nil {
		operation.finish(TurnCompletion{}, err)
	}
	return TurnCompletion{}, err != nil, err
}

func (operation *codexGoalOperation) applyNotificationResult(message jsonRPCMessage, result codexNotificationResult, sink TurnSink) (TurnCompletion, bool, error) {
	if message.Method == codexapp.CodexNotificationThreadGoalUpdated {
		completion, done, err := operation.recordGoalUpdate(message)
		if err != nil {
			operation.finish(TurnCompletion{}, err)
			return TurnCompletion{}, true, err
		}
		if done {
			operation.finish(completion, nil)
			return completion, true, nil
		}
	}
	if message.Method == codexapp.CodexNotificationThreadGoalCleared {
		completion, done := operation.recordGoalCleared()
		if done {
			operation.finish(completion, nil)
			return completion, true, nil
		}
	}
	return TurnCompletion{}, false, nil
}

func (operation *codexGoalOperation) hasSeenActiveGoalUpdate() bool {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	return operation.activeGoalSeen
}

func (operation *codexGoalOperation) recordGoalUpdate(message jsonRPCMessage) (TurnCompletion, bool, error) {
	params, err := codexapp.DecodeThreadGoalUpdatedNotification(message.Params)
	if err != nil {
		return TurnCompletion{}, false, err
	}
	operation.mu.Lock()
	defer operation.mu.Unlock()
	if params.Goal.Status == codexapp.ThreadGoalStatusActive {
		operation.activeGoalSeen = true
		operation.goalFinal = false
		operation.pendingDone = false
		operation.pendingCompletion = TurnCompletion{}
		return TurnCompletion{}, false, nil
	}
	if !codexGoalStatusIsFinal(params.Goal.Status) {
		return TurnCompletion{}, false, fmt.Errorf("unsupported codex goal operation status: %s", params.Goal.Status)
	}
	operation.goalFinal = true
	if operation.pendingDone {
		return operation.pendingCompletion, true, nil
	}
	return TurnCompletion{}, false, nil
}

func codexGoalStatusIsFinal(status codexapp.ThreadGoalStatus) bool {
	switch status {
	case codexapp.ThreadGoalStatusBlocked,
		codexapp.ThreadGoalStatusBudgetLimited,
		codexapp.ThreadGoalStatusComplete,
		codexapp.ThreadGoalStatusPaused,
		codexapp.ThreadGoalStatusUsageLimited:
		return true
	default:
		return false
	}
}

func (operation *codexGoalOperation) recordGoalCleared() (TurnCompletion, bool) {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	operation.goalFinal = true
	if operation.pendingDone {
		return operation.pendingCompletion, true
	}
	return TurnCompletion{}, false
}

func (operation *codexGoalOperation) routeBackgroundTerminalNotification(message jsonRPCMessage) (bool, error) {
	notification, handled, err := operation.harness.classifyBackgroundTerminalNotification(message)
	if err != nil || !handled {
		return false, err
	}
	if notification.threadID != operation.threadID {
		return false, fmt.Errorf("codex goal operation background terminal notification targeted thread %s, want %s", notification.threadID, operation.threadID)
	}
	if operation.backgroundNotificationBelongsToActivePhysicalTurn(notification) {
		return false, nil
	}
	sink, context, ok := operation.harness.backgroundSinkForThread(operation.threadID)
	if !ok {
		return true, nil
	}
	return true, routeBackgroundTerminalNotification(sink, context, notification)
}

func (operation *codexGoalOperation) backgroundNotificationBelongsToActivePhysicalTurn(notification codexBackgroundTerminalNotification) bool {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	return operation.physicalActive && isSameTurn(notification.turnID, operation.currentTurnID)
}

func (operation *codexGoalOperation) requireGoalNotificationThread(message jsonRPCMessage) error {
	threadID, scoped, err := codexNotificationThreadID(message)
	if err != nil {
		return err
	}
	if !scoped {
		return operation.requirePreSinkThreadScope(message)
	}
	if threadID != operation.threadID {
		return fmt.Errorf("codex goal operation notification %s targeted thread %s, want %s", message.Method, threadID, operation.threadID)
	}
	return nil
}

func (operation *codexGoalOperation) applyTurnStarted(ctx context.Context, message jsonRPCMessage, sink TurnSink) (TurnCompletion, bool, error) {
	physicalTurnID, err := turnStartedNotificationID(message)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	emitLogicalStart, err := operation.recordPhysicalTurnStarted(physicalTurnID)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	if !emitLogicalStart {
		return TurnCompletion{}, false, nil
	}
	logicalMessage, err := operation.rewriteMessageToLogicalTurn(message)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	result, err := operation.harness.handleCodexNotification(ctx, operation.session, logicalMessage, operation.runID, operation.threadID, operation.logicalTurn(), sink)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	if result.TurnID == "" {
		err := fmt.Errorf("codex goal operation logical turn/started did not expose a turn id")
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	if err := operation.linkLogicalTurn(sink); err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	return TurnCompletion{}, false, nil
}

func (operation *codexGoalOperation) applyTurnCompleted(ctx context.Context, message jsonRPCMessage, sink TurnSink) (TurnCompletion, bool, error) {
	if err := operation.requireCurrentPhysicalTurnCompleted(message); err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	logicalMessage, err := operation.rewriteMessageToLogicalTurn(message)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	result, err := operation.harness.handleCodexNotification(ctx, operation.session, logicalMessage, operation.runID, operation.threadID, operation.logicalTurn(), sink)
	if err != nil {
		operation.finish(TurnCompletion{}, err)
		return TurnCompletion{}, true, err
	}
	completion, done := operation.recordPhysicalTurnCompleted(result.Completion)
	if done {
		operation.finish(completion, nil)
		return completion, true, nil
	}
	return TurnCompletion{}, false, nil
}

func (operation *codexGoalOperation) recordPhysicalTurnStarted(turnID string) (bool, error) {
	operation.mu.Lock()
	if operation.logicalTurnID == "" {
		operation.logicalTurnID = turnID
	}
	operation.currentTurnID = turnID
	operation.physicalActive = true
	operation.pendingDone = false
	operation.pendingCompletion = TurnCompletion{}
	emitLogicalStart := !operation.sinkLinked
	runID := operation.runID
	logicalTurnID := operation.logicalTurnID
	operation.mu.Unlock()

	operation.harness.updateActiveGoalTurn(runID, operation.threadID, logicalTurnID, turnID)
	if err := operation.session.OwnTurn(operation.threadID, turnID); err != nil {
		return false, err
	}
	return emitLogicalStart, nil
}

func (operation *codexGoalOperation) recordPhysicalTurnCompleted(completion TurnCompletion) (TurnCompletion, bool) {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	operation.physicalActive = false
	if completion.Outcome == TurnOutcomeFailed || completion.Outcome == TurnOutcomeCancelled {
		return completion, true
	}
	if completion.Outcome == "" {
		return TurnCompletion{}, false
	}
	operation.pendingCompletion = completion
	operation.pendingDone = true
	if operation.goalFinal {
		return completion, true
	}
	return TurnCompletion{}, false
}

func (operation *codexGoalOperation) linkLogicalTurn(sink TurnSink) error {
	operation.mu.Lock()
	if operation.sinkLinked {
		operation.mu.Unlock()
		return nil
	}
	logicalTurnID := operation.logicalTurnID
	operation.sinkLinked = true
	operation.mu.Unlock()
	return sink.ThreadLinked(operation.threadID, "", logicalTurnID, nil)
}

func (operation *codexGoalOperation) currentTurn() string {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	return operation.currentTurnID
}

func (operation *codexGoalOperation) logicalTurn() string {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	return operation.logicalTurnID
}

func (operation *codexGoalOperation) requireCurrentPhysicalTurnCompleted(message jsonRPCMessage) error {
	params, err := objectValue(message.Params, "codex goal operation turn completed params")
	if err != nil {
		return err
	}
	messageThreadID, err := requireString(params, "threadId", "codex goal operation turn completed")
	if err != nil {
		return err
	}
	if messageThreadID != operation.threadID {
		return fmt.Errorf("codex goal operation turn/completed targeted thread %s, want %s", messageThreadID, operation.threadID)
	}
	turn, err := requireObject(params, "turn", "codex goal operation turn completed")
	if err != nil {
		return err
	}
	messageTurnID, err := requireString(turn, "id", "codex goal operation turn completed turn")
	if err != nil {
		return err
	}
	currentTurnID := operation.currentTurn()
	if messageTurnID != currentTurnID {
		return fmt.Errorf("codex goal operation turn/completed targeted turn %s, want current physical turn %s", messageTurnID, currentTurnID)
	}
	return nil
}

func (operation *codexGoalOperation) rewriteMessageToLogicalTurn(message jsonRPCMessage) (jsonRPCMessage, error) {
	logicalTurnID := operation.logicalTurn()
	if logicalTurnID == "" {
		return message, fmt.Errorf("codex goal operation logical turn id is not bound for notification %s", message.Method)
	}
	return rewriteCodexNotificationTurnID(message, logicalTurnID)
}

func turnStartedNotificationID(message jsonRPCMessage) (string, error) {
	params, err := objectValue(message.Params, "codex goal operation turn started params")
	if err != nil {
		return "", err
	}
	return turnStartedID(params)
}

func rewriteCodexNotificationTurnID(message jsonRPCMessage, turnID string) (jsonRPCMessage, error) {
	if len(message.Params) == 0 {
		return message, nil
	}
	params, err := objectValue(message.Params, "codex notification params")
	if err != nil {
		return message, err
	}
	changed := false
	if _, ok := params["turnId"].(string); ok {
		params["turnId"] = turnID
		changed = true
	}
	if turn, ok := params["turn"].(map[string]any); ok {
		if _, ok := turn["id"].(string); ok {
			turn["id"] = turnID
			changed = true
		}
	}
	if !changed {
		return message, nil
	}
	data, err := json.Marshal(params)
	if err != nil {
		return message, fmt.Errorf("rewrite codex notification %s turn id: %w", message.Method, err)
	}
	message.Params = data
	return message, nil
}

func (operation *codexGoalOperation) Close() {
	operation.finish(TurnCompletion{}, nil)
}

func (operation *codexGoalOperation) finish(completion TurnCompletion, err error) {
	operation.finishOnce.Do(func() {
		var session *codexapp.Session
		closePreSinkDone := false
		operation.mu.Lock()
		operation.state = codexGoalOperationFinishing
		operation.finishErr = err
		operation.finishComplete = completion
		session = operation.session
		if !operation.preSinkStarted {
			operation.preSinkStarted = true
			closePreSinkDone = true
		}
		operation.state = codexGoalOperationFinished
		operation.mu.Unlock()

		operation.harness.unregisterGoalOperation(operation.threadID, operation)
		if session != nil {
			session.Close()
		}
		if closePreSinkDone {
			close(operation.preSinkDone)
		}
		close(operation.finished)
	})
}

func (operation *codexGoalOperation) finishedErrorLocked() error {
	if operation.finishErr != nil {
		return operation.finishErr
	}
	if operation.finishComplete.Outcome != "" {
		return nil
	}
	return fmt.Errorf("codex goal operation for thread %s is closed", operation.threadID)
}

func codexLifecycleError(prefix string, err error) error {
	if err == nil {
		return fmt.Errorf("%s", prefix)
	}
	return fmt.Errorf("%s: %w", prefix, err)
}

func codexNotificationThreadID(message jsonRPCMessage) (string, bool, error) {
	if len(message.Params) == 0 {
		return "", false, nil
	}
	var params map[string]any
	if err := json.Unmarshal(message.Params, &params); err != nil {
		return "", false, fmt.Errorf("decode codex notification %s params: %w", message.Method, err)
	}
	if threadID, ok := params["threadId"].(string); ok && threadID != "" {
		return threadID, true, nil
	}
	thread, ok := params["thread"].(map[string]any)
	if !ok {
		return "", false, nil
	}
	threadID, ok := thread["id"].(string)
	return threadID, ok && threadID != "", nil
}
