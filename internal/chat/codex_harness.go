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
	turnMu               sync.Mutex
	active               map[string]*codexActiveTurn
	approvals            map[string]codexPendingApproval
	approvalsByRequestID map[string]string
}

type codexActiveTurn struct {
	request  TurnRequest
	session  *codexapp.Session
	threadID string
	turnID   string
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
	return &CodexHarness{
		config:               config,
		manager:              manager,
		active:               map[string]*codexActiveTurn{},
		approvals:            map[string]codexPendingApproval{},
		approvalsByRequestID: map[string]string{},
	}
}

func (harness *CodexHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := ctx.Err(); err != nil {
		return TurnCompletion{}, err
	}
	harness.turnMu.Lock()
	defer harness.turnMu.Unlock()

	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return TurnCompletion{}, err
	}
	session.AcceptUnscopedNotifications()
	session.AcceptUnscopedRequests()
	defer session.Close()
	harness.registerActive(request.Run.ID, session, request)
	defer harness.unregisterActive(request.Run.ID)

	threadID, err := harness.startOrResumeThread(ctx, session, request)
	if err != nil {
		return TurnCompletion{}, err
	}
	if err := session.OwnThread(threadID); err != nil {
		return TurnCompletion{}, err
	}
	turnID, err := startCodexTurn(ctx, session, threadID, request)
	if err != nil {
		return TurnCompletion{}, err
	}
	harness.updateActiveTurn(request.Run.ID, threadID, turnID)
	if err := sink.ThreadLinked(threadID, "", turnID); err != nil {
		return TurnCompletion{}, err
	}
	return harness.waitForTurn(ctx, session, request.Run.ID, threadID, turnID, sink)
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
		if err := harness.applyNotificationRebindForWait(session, event.Message, runID, threadID, state, sink); err != nil {
			return TurnCompletion{}, false, err
		}
	}
	result, err := harness.handleCodexSessionEvent(ctx, event, runID, threadID, state.activeTurnID, sink)
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
	if err := sink.ThreadLinked(threadID, "", notificationTurnID); err != nil {
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

func (harness *CodexHarness) handleCodexSessionEvent(ctx context.Context, event codexapp.Event, runID string, threadID string, activeTurnID string, sink TurnSink) (codexTurnWaitResult, error) {
	switch event.Kind {
	case codexapp.EventRequest:
		if err := harness.handleCodexServerRequestForTurn(ctx, event.Message, runID, threadID, activeTurnID, sink); err != nil {
			return codexTurnWaitResult{}, err
		}
		return codexTurnWaitResult{activeTurnID: activeTurnID}, nil
	case codexapp.EventNotification:
		return harness.handleCodexNotificationForTurn(event.Message, runID, threadID, activeTurnID, sink)
	case codexapp.EventLifecycle:
		return codexTurnWaitResult{}, fmt.Errorf("codex app-server exited before turn completed: %w", event.Err)
	default:
		return codexTurnWaitResult{}, fmt.Errorf("unsupported codex app-server session event: %s", event.Kind)
	}
}

func (harness *CodexHarness) handleCodexNotificationForTurn(message jsonRPCMessage, runID string, threadID string, activeTurnID string, sink TurnSink) (codexTurnWaitResult, error) {
	result, err := harness.handleCodexNotification(message, runID, threadID, activeTurnID, sink)
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
	harness.mu.Lock()
	active := harness.active[request.RunID]
	harness.mu.Unlock()
	if active == nil {
		return fmt.Errorf("%w: codex turn is not active for run %s", ErrTurnNotStarted, request.RunID)
	}
	if active.threadID == "" || active.turnID == "" {
		return ErrTurnNotStarted
	}
	_, err := active.session.Call(ctx, codexapp.CodexMethodTurnInterrupt, map[string]any{
		"threadId": active.threadID,
		"turnId":   active.turnID,
	})
	return err
}

func (harness *CodexHarness) SteerTurn(ctx context.Context, request SteerRequest) error {
	harness.mu.Lock()
	active := harness.active[request.RunID]
	harness.mu.Unlock()
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
		return fmt.Errorf("steering turn %s does not match active turn %s", request.TurnID, active.turnID)
	}
	_, err := active.session.Call(ctx, codexapp.CodexMethodTurnSteer, map[string]any{
		"expectedTurnId": active.turnID,
		"input": []map[string]any{{
			"text": request.Text,
			"type": "text",
		}},
		"threadId": active.threadID,
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

func (harness *CodexHarness) startOrResumeThread(ctx context.Context, session *codexapp.Session, request TurnRequest) (string, error) {
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		result, err := session.Call(ctx, codexapp.CodexMethodThreadResume, codexThreadResumeParams(request.Workspace.RootPath, request.ThreadRef.ThreadID))
		if err != nil {
			return "", &HarnessRefUnavailableError{
				Err:      err,
				Harness:  HarnessCodex,
				ThreadID: request.ThreadRef.ThreadID,
				Message:  fmt.Sprintf("resume codex thread %s: %v", request.ThreadRef.ThreadID, err),
			}
		}
		threadID, err := threadIDFromResponse(result)
		if err != nil {
			return "", &HarnessRefUnavailableError{
				Err:      err,
				Harness:  HarnessCodex,
				ThreadID: request.ThreadRef.ThreadID,
				Message:  fmt.Sprintf("resume codex thread %s: %v", request.ThreadRef.ThreadID, err),
			}
		}
		return threadID, nil
	}

	params, err := harness.codexThreadStartParams(request.Workspace.RootPath)
	if err != nil {
		return "", err
	}
	result, err := session.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return "", fmt.Errorf("start codex thread: %w", err)
	}
	threadID, err := threadIDFromResponse(result)
	if err != nil {
		return "", err
	}
	return threadID, nil
}

func startCodexTurn(ctx context.Context, session *codexapp.Session, threadID string, request TurnRequest) (string, error) {
	params := map[string]any{
		"cwd":      request.Workspace.RootPath,
		"threadId": threadID,
		"input": []map[string]any{{
			"text": request.Prompt,
			"type": "text",
		}},
	}
	applyInitialCodexSettings(params, request)
	result, err := session.Call(ctx, codexapp.CodexMethodTurnStart, params)
	if err != nil {
		return "", fmt.Errorf("start codex turn: %w", err)
	}
	turnID, err := turnIDFromResponse(result)
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
