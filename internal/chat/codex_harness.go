package chat

import (
	"context"
	"fmt"
	"sync"

	"setta/internal/codexapp"
)

type CodexHarnessConfig struct {
	Command             string
	Args                []string
	Env                 []string
	Manager             *codexapp.Manager
	Tools               *AgentToolRegistry
	AttestationProvider AttestationProvider
}

type CodexHarness struct {
	config  CodexHarnessConfig
	manager *codexapp.Manager

	mu                   sync.Mutex
	active               map[string]*codexActiveTurn
	activeThreads        map[string]string
	approvals            map[string]codexPendingApproval
	approvalsByRequestID map[string]string
	goalMu               sync.Mutex
	goalOperations       map[string]*codexGoalOperation

	connectionDiagnosticMu   sync.Mutex
	connectionDiagnosticSink ConnectionDiagnosticSink

	// Background terminal lifecycle state outlives any single turn. It is guarded
	// by its own mutex because connection-scoped notification handlers run on the
	// shared manager dispatch goroutine, concurrently with turn machinery.
	backgroundMu       sync.Mutex
	backgroundSink     BackgroundTerminalSink
	threadContexts     map[string]backgroundTerminalThreadContext
	turnActiveByThread map[string]bool
	// backgroundItemIDs is the connection-scoped set of provider command-execution
	// item IDs that are background terminals (learned from unifiedExecStartup). It
	// lets the session path recognize an earlier turn's background terminal output
	// (which carries that turn's id) and route it instead of failing turn scope.
	backgroundItemIDs map[string]struct{}
}

var _ Harness = (*CodexHarness)(nil)

// backgroundTerminalThreadContext routes a Codex thread's late unified-exec
// notifications to the conversation that owns it, set when a turn starts the
// thread and retained for the provider connection.
type backgroundTerminalThreadContext struct {
	workspaceID    string
	conversationID string
}

type codexActiveTurn struct {
	request       TurnRequest
	session       *codexapp.Session
	threadID      string
	turnID        string
	logicalTurnID string
}

type codexPendingApproval struct {
	method            string
	permissionProfile map[string]any
	request           jsonRPCMessage
	requestID         any
	requestKey        string
	runID             string
	questions         []ApprovalQuestion
	structuredInput   *StructuredInputRequest
}

type codexApprovalReply struct {
	errorMessage string
	result       any
}

type codexTurnWaitResult struct {
	activeTurnID string
	completion   TurnCompletion
	done         bool
}

type codexTurnWaitState struct {
	activeTurnID      string
	allowTurnIDRebind bool
}

func NewCodexHarness(config CodexHarnessConfig) *CodexHarness {
	if config.Command == "" {
		config.Command = "codex"
	}
	if len(config.Args) == 0 {
		config.Args = []string{"app-server", "--listen", "stdio://"}
	}
	if config.Tools == nil {
		config.Tools = mustNewSettaAgentToolRegistry()
	}
	manager := config.Manager
	if manager == nil {
		manager = codexapp.NewManager(codexapp.ManagerConfig{
			Process: codexapp.ProcessConfig{
				Command: config.Command,
				Args:    config.Args,
				Env:     config.Env,
			},
			InitializeParams: CodexInitializeParams(config),
		})
	}
	harness := &CodexHarness{
		config:               config,
		manager:              manager,
		active:               map[string]*codexActiveTurn{},
		activeThreads:        map[string]string{},
		approvals:            map[string]codexPendingApproval{},
		approvalsByRequestID: map[string]string{},
		goalOperations:       map[string]*codexGoalOperation{},
		threadContexts:       map[string]backgroundTerminalThreadContext{},
		turnActiveByThread:   map[string]bool{},
		backgroundItemIDs:    map[string]struct{}{},
	}
	harness.registerBackgroundTerminalHandlers()
	harness.registerConnectionNotificationHandlers()
	harness.registerConnectionRequestHandlers()
	return harness
}

func (harness *CodexHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := ctx.Err(); err != nil {
		return TurnCompletion{}, err
	}
	if err := harness.rejectLinkedGoalOperationThread(request.ThreadRef); err != nil {
		return TurnCompletion{}, err
	}
	reservedThreadID, releaseReservedThread, err := harness.reserveLinkedActiveThread(request)
	if err != nil {
		return TurnCompletion{}, err
	}
	defer releaseReservedThread()

	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return TurnCompletion{}, err
	}
	defer session.Close()
	harness.registerActive(request.Run.ID, session, request)
	defer harness.unregisterActive(request.Run.ID)

	thread, err := harness.startOrResumeThread(ctx, session, request)
	if err != nil {
		return TurnCompletion{}, err
	}
	threadID := thread.Ref.ThreadID
	if harness.hasGoalOperation(threadID) {
		return TurnCompletion{}, fmt.Errorf("codex goal operation already owns thread %s", threadID)
	}
	releaseStartedThread, err := harness.reserveStartedActiveThread(reservedThreadID, threadID, request.Run.ID)
	if err != nil {
		return TurnCompletion{}, err
	}
	defer releaseStartedThread()
	if err := session.OwnThread(threadID); err != nil {
		return TurnCompletion{}, err
	}
	// Record the thread's conversation and mark its turn active before the turn
	// produces any notification, so late unified-exec events are routed to the
	// right conversation and during-turn events defer to the run-scoped sink. The
	// connection-scoped turn/completed handler clears the active flag in the normal
	// path (required for deterministic late routing); this defer is the safety net
	// for a turn that errors before any turn/completed arrives, so the flag cannot
	// leak true and suppress this thread's later background-terminal events.
	harness.beginBackgroundTerminalTurn(threadID, request.Workspace.ID, request.Conversation.ID)
	defer harness.endBackgroundTerminalTurn(threadID)
	turnID, err := startCodexTurn(ctx, session, threadID, request)
	if err != nil {
		return TurnCompletion{}, err
	}
	harness.updateActiveTurn(request.Run.ID, threadID, turnID)
	if err := sink.ThreadLinked(threadID, thread.Ref.SessionID, turnID, chatCodexEffectiveSettingsFromCommandSettings(thread.Settings)); err != nil {
		return TurnCompletion{}, err
	}
	return harness.waitForTurn(ctx, session, request.Run.ID, threadID, turnID, sink)
}

func (harness *CodexHarness) reserveLinkedActiveThread(request TurnRequest) (string, func(), error) {
	threadID := linkedCodexThreadID(request.ThreadRef)
	if threadID == "" {
		return "", func() {}, nil
	}
	if err := harness.reserveActiveThread(threadID, request.Run.ID); err != nil {
		return "", nil, err
	}
	return threadID, func() {
		harness.releaseActiveThread(threadID, request.Run.ID)
	}, nil
}

func (harness *CodexHarness) reserveStartedActiveThread(reservedThreadID string, threadID string, runID string) (func(), error) {
	if reservedThreadID != "" {
		if reservedThreadID != threadID {
			return nil, fmt.Errorf("codex linked thread %s resumed as different thread %s", reservedThreadID, threadID)
		}
		return func() {}, nil
	}
	if err := harness.reserveActiveThread(threadID, runID); err != nil {
		return nil, err
	}
	return func() {
		harness.releaseActiveThread(threadID, runID)
	}, nil
}

func (harness *CodexHarness) rejectLinkedGoalOperationThread(threadRef HarnessThreadRef) error {
	threadID := linkedCodexThreadID(threadRef)
	if threadID == "" || !harness.hasGoalOperation(threadID) {
		return nil
	}
	return fmt.Errorf("codex goal operation already owns thread %s", threadID)
}

func (harness *CodexHarness) RunTask(ctx context.Context, request HarnessTaskRequest) (HarnessTaskResult, error) {
	if request.TurnMode == HarnessTurnStructuredTask {
		return harness.runStructuredTask(ctx, request)
	}
	return runConversationHarnessTask(ctx, request, harness.StartTurn)
}

func (harness *CodexHarness) waitForTurn(ctx context.Context, session *codexapp.Session, runID string, threadID string, turnID string, sink TurnSink) (TurnCompletion, error) {
	state := codexTurnWaitState{activeTurnID: turnID, allowTurnIDRebind: true}
	for {
		select {
		case <-ctx.Done():
			return TurnCompletion{}, ctx.Err()
		case event, ok := <-session.Events():
			if !ok {
				return TurnCompletion{}, fmt.Errorf("codex app-server session closed before turn completed")
			}
			completion, done, err := harness.applyCodexSessionEventForWait(ctx, session, event, runID, threadID, &state, sink)
			if err != nil {
				return TurnCompletion{}, err
			}
			if done {
				return completion, nil
			}
		}
	}
}

func (harness *CodexHarness) applyCodexSessionEventForWait(ctx context.Context, session *codexapp.Session, event codexapp.Event, runID string, threadID string, state *codexTurnWaitState, sink TurnSink) (TurnCompletion, bool, error) {
	if event.Kind == codexapp.EventNotification {
		// A background terminal from an earlier turn can emit output or completion that
		// the active session still receives, carrying the earlier turn id. Intercept and
		// route it to the background terminal registry BEFORE the rebind logic: otherwise,
		// if it is the first scoped notification of the active turn, its earlier turn id
		// would rebind the active turn and then fail the real one. The active turn id
		// (state.activeTurnID) is reliable here, before any rebind for this event.
		if handled, err := harness.routeCrossTurnBackgroundNotification(event.Message, threadID, state.activeTurnID); handled {
			return TurnCompletion{}, false, err
		}
		if err := harness.applyNotificationRebindForWait(session, event.Message, runID, threadID, state, sink); err != nil {
			return TurnCompletion{}, false, err
		}
	}
	result, err := harness.handleCodexSessionEvent(ctx, session, event, runID, threadID, state.activeTurnID, sink)
	if err != nil {
		return TurnCompletion{}, false, err
	}
	if err := sessionOwnResultTurn(session, threadID, state.activeTurnID, result.activeTurnID); err != nil {
		return TurnCompletion{}, false, err
	}
	state.activeTurnID = result.activeTurnID
	return result.completion, result.done, nil
}

func (harness *CodexHarness) applyNotificationRebindForWait(session *codexapp.Session, message jsonRPCMessage, runID string, threadID string, state *codexTurnWaitState, sink TurnSink) error {
	nextTurnID, rebound, scoped, err := harness.maybeRebindActiveTurnFromNotification(runID, threadID, state.activeTurnID, state.allowTurnIDRebind, message, sink)
	if err != nil {
		return err
	}
	if rebound {
		state.activeTurnID = nextTurnID
		state.allowTurnIDRebind = false
		return session.OwnTurn(threadID, state.activeTurnID)
	}
	if scoped {
		state.allowTurnIDRebind = false
		if state.activeTurnID != "" {
			return session.OwnTurn(threadID, state.activeTurnID)
		}
	}
	return nil
}

func sessionOwnResultTurn(session *codexapp.Session, threadID string, previousTurnID string, nextTurnID string) error {
	if nextTurnID == "" || nextTurnID == previousTurnID {
		return nil
	}
	return session.OwnTurn(threadID, nextTurnID)
}

func (harness *CodexHarness) maybeRebindActiveTurnFromNotification(runID string, threadID string, activeTurnID string, allow bool, message jsonRPCMessage, sink TurnSink) (string, bool, bool, error) {
	notificationTurnID, scoped, err := notificationTurnIDForRebind(message, threadID)
	if err != nil || !scoped {
		return activeTurnID, false, scoped, err
	}
	if notificationTurnID == "" || notificationTurnID == activeTurnID {
		return activeTurnID, false, true, nil
	}
	if !allow {
		return activeTurnID, false, true, nil
	}
	harness.updateActiveTurn(runID, threadID, notificationTurnID)
	if err := sink.ThreadLinked(threadID, "", notificationTurnID, nil); err != nil {
		return "", false, true, err
	}
	return notificationTurnID, true, true, nil
}

func notificationTurnIDForRebind(message jsonRPCMessage, expectedThreadID string) (string, bool, error) {
	policy, ok := codexNotificationScopePolicies[message.Method]
	if !ok {
		return "", false, nil
	}
	if policy != codexNotificationScopeTurnState && message.Method != codexapp.CodexNotificationTurnStarted {
		return "", false, nil
	}
	params, err := objectValue(message.Params, "codex notification params")
	if err != nil {
		return "", true, err
	}
	match := codexThreadMatch(params, expectedThreadID)
	if match.Kind != codexNotificationMatches {
		return "", true, nil
	}
	if message.Method == codexapp.CodexNotificationTurnCompleted {
		turn, err := requireObject(params, "turn", "codex turn completed")
		if err != nil {
			return "", true, err
		}
		turnID, err := requireString(turn, "id", "codex turn completed turn")
		return turnID, true, err
	}
	if message.Method == codexapp.CodexNotificationTurnStarted {
		turnID, err := turnStartedID(params)
		return turnID, true, err
	}
	turnID, err := optionalString(params, "turnId", "codex notification")
	return turnID, true, err
}

func (harness *CodexHarness) handleCodexSessionEvent(ctx context.Context, session *codexapp.Session, event codexapp.Event, runID string, threadID string, activeTurnID string, sink TurnSink) (codexTurnWaitResult, error) {
	switch event.Kind {
	case codexapp.EventRequest:
		if err := harness.handleCodexServerRequestForTurn(ctx, event.Message, runID, threadID, activeTurnID, sink); err != nil {
			return codexTurnWaitResult{}, err
		}
		return codexTurnWaitResult{activeTurnID: activeTurnID}, nil
	case codexapp.EventNotification:
		return harness.handleCodexNotificationForTurn(ctx, session, event.Message, runID, threadID, activeTurnID, sink)
	case codexapp.EventLag:
		if err := handleCodexBackpressureLag(event.Lag, sink); err != nil {
			return codexTurnWaitResult{}, err
		}
		return codexTurnWaitResult{activeTurnID: activeTurnID}, nil
	case codexapp.EventLifecycle:
		return codexTurnWaitResult{}, &HarnessProviderLifecycleError{
			Err:     event.Err,
			Message: "codex app-server exited before turn completed",
			Reason:  RunLivenessReasonProviderRestarted,
		}
	default:
		return codexTurnWaitResult{}, fmt.Errorf("unsupported codex app-server session event: %s", event.Kind)
	}
}

func handleCodexBackpressureLag(lag *codexapp.LagEvent, sink TurnSink) error {
	if lag == nil || lag.SkippedCount <= 0 {
		return nil
	}
	message := fmt.Sprintf("%s skipped %d %s notifications", lag.EventClass, lag.SkippedCount, lag.Method)
	if err := sink.Trace("codex_app_server_backpressure", message); err != nil {
		return err
	}
	if lag.ProviderItemID == "" {
		return sink.ProviderDiagnostic(
			"codex_app_server_backpressure",
			"Codex app-server output was skipped under backpressure.",
			codexBackpressureLagDiagnosticContext(lag),
			false,
			DiagnosticSeverityInfo,
		)
	}
	stream := lag.Stream
	if stream == "" || lag.Method == codexapp.CodexNotificationItemCommandExecutionOutputDelta {
		stream = codexCommandExecutionOutputStream
	}
	return sink.RunItemOutputDelta(
		lag.ProviderItemID,
		stream,
		fmt.Sprintf("[output skipped: %d %s notifications omitted due to backpressure]\n", lag.SkippedCount, lag.Method),
	)
}

func codexBackpressureLagDiagnosticContext(lag *codexapp.LagEvent) map[string]string {
	context := map[string]string{
		"eventClass":        string(lag.EventClass),
		"method":            lag.Method,
		"queueDepth":        fmt.Sprintf("%d", lag.QueueDepth),
		"queueHighWater":    fmt.Sprintf("%d", lag.QueueHighWater),
		"skippedCount":      fmt.Sprintf("%d", lag.SkippedCount),
		"firstSkippedAt":    lag.FirstSkippedAt,
		"lastSkippedAt":     lag.LastSkippedAt,
		"providerItemId":    lag.ProviderItemID,
		"providerProcessId": lag.ProviderProcessID,
		"runId":             lag.RunID,
		"stream":            lag.Stream,
		"threadId":          lag.ThreadID,
		"turnId":            lag.TurnID,
	}
	for key, value := range context {
		if value == "" {
			delete(context, key)
		}
	}
	return context
}

func (harness *CodexHarness) handleCodexNotificationForTurn(ctx context.Context, session *codexapp.Session, message jsonRPCMessage, runID string, threadID string, activeTurnID string, sink TurnSink) (codexTurnWaitResult, error) {
	result, err := harness.handleCodexNotification(ctx, session, message, runID, threadID, activeTurnID, sink)
	if err != nil {
		return codexTurnWaitResult{}, err
	}
	nextTurnID, err := harness.applyNotificationTurnID(runID, threadID, activeTurnID, result, sink)
	if err != nil {
		return codexTurnWaitResult{}, err
	}
	return codexTurnWaitResult{
		activeTurnID: nextTurnID,
		completion:   result.Completion,
		done:         result.Completion.Outcome != "",
	}, nil
}

func (harness *CodexHarness) handleCodexServerRequestForTurn(ctx context.Context, message jsonRPCMessage, runID string, threadID string, activeTurnID string, sink TurnSink) error {
	if err := harness.handleCodexServerRequest(ctx, message, runID, threadID, activeTurnID, sink); err != nil {
		_ = message.RespondError(-32601, err.Error())
		return err
	}
	return nil
}

func (harness *CodexHarness) CancelTurn(ctx context.Context, request CancelRequest) error {
	active := harness.activeTurnSnapshot(request.RunID)
	if active == nil {
		return fmt.Errorf("%w: codex turn is not active for run %s", ErrTurnNotStarted, request.RunID)
	}
	if operation, ok := harness.goalOperationForThread(active.threadID); ok {
		return operation.Cancel(ctx)
	}
	if active.threadID == "" || active.turnID == "" {
		return ErrTurnNotStarted
	}
	_, err := active.session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: active.threadID,
		TurnID:   active.turnID,
	})
	if err != nil {
		harness.retryInterruptTypedActiveTurn(ctx, active, err)
	}
	return nil
}

func (harness *CodexHarness) retryInterruptTypedActiveTurn(ctx context.Context, active *codexActiveTurn, interruptErr error) {
	activeTurnID, ok, parseErr := codexActiveTurnIDFromRPCErrorData(interruptErr)
	if parseErr != nil || !ok || activeTurnID == active.turnID {
		return
	}
	harness.updateActiveTurn(active.request.Run.ID, active.threadID, activeTurnID)
	if err := active.session.OwnTurn(active.threadID, activeTurnID); err != nil {
		return
	}
	_, _ = active.session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: active.threadID,
		TurnID:   activeTurnID,
	})
}

func (harness *CodexHarness) SteerTurn(ctx context.Context, request SteerRequest) error {
	active := harness.activeTurnSnapshot(request.RunID)
	if active == nil {
		return fmt.Errorf("%w: codex turn is not active for run %s", ErrTurnNotStarted, request.RunID)
	}
	if active.threadID == "" || active.turnID == "" {
		return ErrTurnNotStarted
	}
	if request.ThreadID != "" && request.ThreadID != active.threadID {
		return fmt.Errorf("steering thread %s does not match active thread %s", request.ThreadID, active.threadID)
	}
	if request.TurnID != "" && request.TurnID != active.turnID {
		if active.logicalTurnID == "" || request.TurnID != active.logicalTurnID {
			return fmt.Errorf("steering turn %s does not match active turn %s", request.TurnID, active.turnID)
		}
	}
	input, err := codexUserInputForSteer(request)
	if err != nil {
		return err
	}
	_, err = active.session.Call(ctx, codexapp.CodexMethodTurnSteer, map[string]any{
		"expectedTurnId": active.turnID,
		"input":          input,
		"threadId":       active.threadID,
	})
	return err
}

func (harness *CodexHarness) SubmitApproval(_ context.Context, response ApprovalResponse) error {
	harness.mu.Lock()
	pending, ok := harness.approvals[response.ApprovalID]
	harness.mu.Unlock()
	if !ok {
		return fmt.Errorf("codex approval is not pending: %s", response.ApprovalID)
	}
	reply, err := codexApprovalResult(pending, response)
	if err != nil {
		_ = pending.request.RespondError(-32000, err.Error())
		return err
	}
	if reply.errorMessage != "" {
		err = pending.request.RespondError(-32000, reply.errorMessage)
	} else {
		err = pending.request.RespondResult(reply.result)
	}
	if err != nil {
		return err
	}
	harness.mu.Lock()
	delete(harness.approvals, response.ApprovalID)
	delete(harness.approvalsByRequestID, pending.requestKey)
	harness.mu.Unlock()
	return nil
}

func CodexInitializeParams(config CodexHarnessConfig) map[string]any {
	return map[string]any{
		"clientInfo": map[string]any{
			"name":    "setta",
			"title":   "Setta",
			"version": "dev",
		},
		"capabilities": map[string]any{
			"experimentalApi":    true,
			"requestAttestation": config.AttestationProvider != nil,
			"optOutNotificationMethods": []string{
				codexapp.CodexNotificationThreadStarted,
			},
		},
	}
}

func (harness *CodexHarness) startOrResumeThread(ctx context.Context, session *codexapp.Session, request TurnRequest) (codexCommandThread, error) {
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		return harness.resumeLinkedThread(ctx, session, request)
	}

	effectiveSettings, err := harness.effectiveCodexCommandSettings(ctx, session, request.Workspace, request.Conversation)
	if err != nil {
		return codexCommandThread{}, err
	}
	params, err := harness.codexThreadStartParams(request.Workspace.RootPath, request.Conversation)
	if err != nil {
		return codexCommandThread{}, err
	}
	if err := applyCodexThreadStartSettings(params, effectiveSettings); err != nil {
		return codexCommandThread{}, err
	}
	result, err := session.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return codexCommandThread{}, fmt.Errorf("start codex thread: %w", err)
	}
	thread, err := commandThreadFromStartResponse(result)
	if err != nil {
		return codexCommandThread{}, err
	}
	if err := validateCodexThreadStartPermissionSettings("start codex thread response", request.Conversation, thread.Settings); err != nil {
		return codexCommandThread{}, fmt.Errorf("start codex thread response: %w", err)
	}
	thread.Settings = overlayCodexEffectiveSettings(thread.Settings, effectiveSettings)
	return harness.codexCommandThreadWithDisplayLabels(ctx, session, thread)
}

func (harness *CodexHarness) resumeLinkedThread(ctx context.Context, session *codexapp.Session, request TurnRequest) (codexCommandThread, error) {
	threadID := request.ThreadRef.ThreadID
	params, err := codexThreadResumeParams(request.Workspace.RootPath, threadID, request.Conversation)
	if err != nil {
		return codexCommandThread{}, codexThreadResumeUnavailableError(threadID, err)
	}
	result, err := session.Call(ctx, codexapp.CodexMethodThreadResume, params)
	if err != nil {
		return codexCommandThread{}, codexThreadResumeUnavailableError(threadID, err)
	}
	thread, err := commandThreadFromResumeResponse(result)
	if err != nil {
		return codexCommandThread{}, codexThreadResumeUnavailableError(threadID, err)
	}
	if err := validateCodexThreadResumePermissionSettings("resume codex thread response", request.Conversation, thread.Settings); err != nil {
		return codexCommandThread{}, codexThreadResumeUnavailableError(threadID, err)
	}
	return harness.codexCommandThreadWithDisplayLabels(ctx, session, thread)
}

func codexThreadResumeUnavailableError(threadID string, err error) *HarnessRefUnavailableError {
	return &HarnessRefUnavailableError{
		Err:      err,
		Harness:  HarnessCodex,
		ThreadID: threadID,
		Message:  fmt.Sprintf("resume codex thread %s: %v", threadID, err),
	}
}

func overlayCodexEffectiveSettings(base codexCommandThreadSettings, effective codexCommandThreadSettings) codexCommandThreadSettings {
	if effective.Model != "" {
		base.Model = effective.Model
	}
	if effective.ModelDisplayName != "" {
		base.ModelDisplayName = effective.ModelDisplayName
	}
	if effective.ReasoningEffort != "" {
		base.ReasoningEffort = effective.ReasoningEffort
	}
	if effective.ReasoningEffortDisplayName != "" {
		base.ReasoningEffortDisplayName = effective.ReasoningEffortDisplayName
	}
	return base
}

func startCodexTurn(ctx context.Context, session *codexapp.Session, threadID string, request TurnRequest) (string, error) {
	input, err := codexUserInputForTurn(request)
	if err != nil {
		return "", err
	}
	params := map[string]any{
		"cwd":      request.Workspace.RootPath,
		"threadId": threadID,
		"input":    input,
	}
	applyInitialCodexSettings(params, request)
	result, err := session.Call(ctx, codexapp.CodexMethodTurnStart, params)
	if err != nil {
		return "", fmt.Errorf("start codex turn: %w", err)
	}
	turnID, err := turnIDFromStartResponse(result)
	if err != nil {
		return "", err
	}
	return turnID, nil
}

func applyInitialCodexSettings(params map[string]any, request TurnRequest) {
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		return
	}
	if request.Conversation.CodexSettings == nil {
		return
	}
	if request.Conversation.CodexSettings.Model != "" {
		params["model"] = request.Conversation.CodexSettings.Model
	}
	if request.Conversation.CodexSettings.ReasoningEffort != nil {
		params["effort"] = string(*request.Conversation.CodexSettings.ReasoningEffort)
	}
}

func (harness *CodexHarness) handleCodexServerRequest(ctx context.Context, message jsonRPCMessage, runID string, threadID string, turnID string, sink TurnSink) error {
	if !isSupportedCodexServerRequest(message.Method) {
		return handleUnsupportedCodexServerRequest(message, sink)
	}
	if !isCodexDeferredApprovalRequest(message.Method) {
		return harness.handleImmediateCodexServerRequest(ctx, message, runID, threadID, turnID, sink)
	}
	approval, details, err := approvalRequestFromCodex(message, runID, threadID, turnID, sink)
	if err != nil {
		return err
	}
	if err := sink.RunItemUpsert(details.runItem); err != nil {
		return err
	}
	harness.mu.Lock()
	harness.approvals[approval.ID] = codexPendingApproval{
		method:            message.Method,
		permissionProfile: details.permissionProfile,
		request:           message,
		requestID:         message.ID,
		requestKey:        details.requestID,
		runID:             runID,
		questions:         details.questions,
		structuredInput:   approval.StructuredInput,
	}
	harness.approvalsByRequestID[details.requestID] = approval.ID
	harness.mu.Unlock()
	return sink.ApprovalRequested(approval)
}

func (harness *CodexHarness) registerActive(runID string, session *codexapp.Session, request TurnRequest) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	harness.active[runID] = &codexActiveTurn{request: request, session: session}
}

func (harness *CodexHarness) reserveActiveThread(threadID string, runID string) error {
	if threadID == "" {
		return fmt.Errorf("codex active thread reservation requires a thread id")
	}
	if runID == "" {
		return fmt.Errorf("codex active thread reservation for %s requires a run id", threadID)
	}
	harness.mu.Lock()
	defer harness.mu.Unlock()
	if ownerRunID, ok := harness.activeThreads[threadID]; ok {
		return fmt.Errorf("codex thread %s already has active run %s", threadID, ownerRunID)
	}
	harness.activeThreads[threadID] = runID
	return nil
}

func (harness *CodexHarness) releaseActiveThread(threadID string, runID string) {
	if threadID == "" || runID == "" {
		return
	}
	harness.mu.Lock()
	defer harness.mu.Unlock()
	if harness.activeThreads[threadID] == runID {
		delete(harness.activeThreads, threadID)
	}
}

func (harness *CodexHarness) activeTurnSnapshot(runID string) *codexActiveTurn {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	active := harness.active[runID]
	if active == nil {
		return nil
	}
	return &codexActiveTurn{
		request:       active.request,
		session:       active.session,
		threadID:      active.threadID,
		turnID:        active.turnID,
		logicalTurnID: active.logicalTurnID,
	}
}

func (harness *CodexHarness) updateActiveTurn(runID string, threadID string, turnID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	active := harness.active[runID]
	if active == nil {
		return
	}
	active.threadID = threadID
	active.turnID = turnID
}

func (harness *CodexHarness) updateActiveGoalTurn(runID string, threadID string, logicalTurnID string, physicalTurnID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	active := harness.active[runID]
	if active == nil {
		return
	}
	active.threadID = threadID
	active.turnID = physicalTurnID
	active.logicalTurnID = logicalTurnID
}

func (harness *CodexHarness) unregisterActive(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	delete(harness.active, runID)
	for approvalID, approval := range harness.approvals {
		if approval.runID == runID {
			delete(harness.approvals, approvalID)
			delete(harness.approvalsByRequestID, approval.requestKey)
		}
	}
}
