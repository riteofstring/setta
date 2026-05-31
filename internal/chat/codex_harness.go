package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
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

	threadSettingsUpdateMu        sync.Mutex
	threadSettingsUpdateSupported bool
}

type codexActiveTurn struct {
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

		threadSettingsUpdateSupported: true,
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
	harness.registerActive(request.Run.ID, session)
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
		result, err := session.Call(ctx, codexapp.CodexMethodThreadResume, map[string]any{
			"approvalPolicy":        "on-request",
			"approvalsReviewer":     "user",
			"cwd":                   request.Workspace.RootPath,
			"excludeTurns":          true,
			"runtimeWorkspaceRoots": []string{request.Workspace.RootPath},
			"threadId":              request.ThreadRef.ThreadID,
		})
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

	result, err := session.Call(ctx, codexapp.CodexMethodThreadStart, map[string]any{
		"approvalPolicy":        "on-request",
		"approvalsReviewer":     "user",
		"cwd":                   request.Workspace.RootPath,
		"runtimeWorkspaceRoots": []string{request.Workspace.RootPath},
	})
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

type codexNotificationResult struct {
	Completion TurnCompletion
	TurnID     string
}

type codexNotificationHandler func(jsonRPCMessage, string, string, TurnSink) (codexNotificationResult, error)

var codexNotificationHandlers = map[string]codexNotificationHandler{
	codexapp.CodexNotificationAccountRateLimitsUpdated:                handleCodexAccountRateLimitsUpdated,
	codexapp.CodexNotificationAccountLoginCompleted:                   handleCodexAccountLoginCompleted,
	codexapp.CodexNotificationAccountUpdated:                          handleCodexAccountUpdated,
	codexapp.CodexNotificationAppListUpdated:                          handleCodexAppListUpdated,
	codexapp.CodexNotificationCommandExecOutputDelta:                  handleCodexCommandExecOutputDelta,
	codexapp.CodexNotificationConfigWarning:                           handleCodexNotice,
	codexapp.CodexNotificationDeprecationNotice:                       handleCodexNotice,
	codexapp.CodexNotificationError:                                   handleCodexErrorNotification,
	codexapp.CodexNotificationExternalAgentConfigImportCompleted:      handleCodexTraceOnlyNotification,
	codexapp.CodexNotificationFsChanged:                               handleCodexFSChanged,
	codexapp.CodexNotificationFuzzyFileSearchSessionCompleted:         handleCodexFuzzyFileSearchSessionCompleted,
	codexapp.CodexNotificationFuzzyFileSearchSessionUpdated:           handleCodexFuzzyFileSearchSessionUpdated,
	codexapp.CodexNotificationGuardianWarning:                         handleCodexNotice,
	codexapp.CodexNotificationHookCompleted:                           handleCodexHookCompleted,
	codexapp.CodexNotificationHookStarted:                             handleCodexHookStarted,
	codexapp.CodexNotificationItemAgentMessageDelta:                   handleCodexAssistantDelta,
	codexapp.CodexNotificationItemAutoApprovalReviewCompleted:         handleCodexAutoApprovalReviewCompleted,
	codexapp.CodexNotificationItemAutoApprovalReviewStarted:           handleCodexAutoApprovalReviewStarted,
	codexapp.CodexNotificationItemCommandExecutionOutputDelta:         handleCodexOutputDelta,
	codexapp.CodexNotificationItemCommandExecutionTerminalInteraction: handleCodexTerminalInteraction,
	codexapp.CodexNotificationItemCompleted:                           handleCodexItemCompleted,
	codexapp.CodexNotificationItemFileChangeOutputDelta:               handleCodexFileChangeOutputDelta,
	codexapp.CodexNotificationItemFileChangePatchUpdated:              handleCodexPatchUpdated,
	codexapp.CodexNotificationItemMcpToolCallProgress:                 handleCodexMCPProgress,
	codexapp.CodexNotificationItemPlanDelta:                           handleCodexPlanDelta,
	codexapp.CodexNotificationItemReasoningSummaryPartAdded:           handleCodexReasoningSummaryPartAdded,
	codexapp.CodexNotificationItemReasoningSummaryTextDelta:           handleCodexReasoningSummaryDelta,
	codexapp.CodexNotificationItemReasoningTextDelta:                  handleCodexReasoningTextDelta,
	codexapp.CodexNotificationItemStarted:                             handleCodexItemStarted,
	codexapp.CodexNotificationMcpServerOauthLoginCompleted:            handleCodexMCPServerOAuthLoginCompleted,
	codexapp.CodexNotificationMcpServerStartupStatusUpdated:           handleCodexMCPServerStartupStatusUpdated,
	codexapp.CodexNotificationModelRerouted:                           handleCodexNotice,
	codexapp.CodexNotificationModelVerification:                       handleCodexModelVerification,
	codexapp.CodexNotificationProcessExited:                           handleCodexProcessExited,
	codexapp.CodexNotificationProcessOutputDelta:                      handleCodexProcessOutputDelta,
	codexapp.CodexNotificationRemoteControlStatusChanged:              handleCodexRemoteControlStatusChanged,
	codexapp.CodexNotificationServerRequestResolved:                   handleCodexServerRequestResolvedNotification,
	codexapp.CodexNotificationSkillsChanged:                           handleCodexSkillsChanged,
	codexapp.CodexNotificationThreadArchived:                          handleCodexThreadLifecycle,
	codexapp.CodexNotificationThreadClosed:                            handleCodexThreadLifecycle,
	codexapp.CodexNotificationThreadCompacted:                         handleCodexNotice,
	codexapp.CodexNotificationThreadGoalCleared:                       handleCodexThreadGoalCleared,
	codexapp.CodexNotificationThreadGoalUpdated:                       handleCodexThreadGoalUpdated,
	codexapp.CodexNotificationThreadNameUpdated:                       handleCodexThreadNameUpdated,
	codexapp.CodexNotificationThreadRealtimeClosed:                    handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeError:                     handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeItemAdded:                 handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeOutputAudioDelta:          handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeSdp:                       handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeStarted:                   handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeTranscriptDelta:           handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadRealtimeTranscriptDone:            handleCodexRealtimeIgnored,
	codexapp.CodexNotificationThreadSettingsUpdated:                   handleCodexThreadSettingsUpdated,
	codexapp.CodexNotificationThreadStarted:                           handleCodexThreadStarted,
	codexapp.CodexNotificationThreadStatusChanged:                     handleCodexThreadStatusChanged,
	codexapp.CodexNotificationThreadTokenUsageUpdated:                 handleCodexThreadTokenUsageUpdated,
	codexapp.CodexNotificationThreadUnarchived:                        handleCodexThreadLifecycle,
	codexapp.CodexNotificationTurnCompleted:                           handleCodexTurnCompletedNotification,
	codexapp.CodexNotificationTurnDiffUpdated:                         handleCodexDiffUpdated,
	codexapp.CodexNotificationTurnPlanUpdated:                         handleCodexPlanUpdated,
	codexapp.CodexNotificationTurnStarted:                             handleCodexTurnStarted,
	codexapp.CodexNotificationWarning:                                 handleCodexNotice,
	codexapp.CodexNotificationWindowsWorldWritableWarning:             handleCodexWindowsWorldWritableWarning,
	codexapp.CodexNotificationWindowsSandboxSetupCompleted:            handleCodexWindowsSandboxSetupCompleted,
}

func handleCodexItemStarted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexItemUpsert(message, threadID, turnID, sink, RunItemStatusRunning)
}

func handleCodexItemCompleted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexItemUpsert(message, threadID, turnID, sink, RunItemStatusCompleted)
}

func handleCodexPlanDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexTextActivityDelta(message, threadID, turnID, sink, RunItemTypePlan, "Plan update")
}

func handleCodexReasoningSummaryDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexTextActivityDelta(message, threadID, turnID, sink, RunItemTypeReasoning, "Reasoning summary")
}

func handleCodexReasoningSummaryPartAdded(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexTextActivityValue(message, threadID, turnID, sink, RunItemTypeReasoning, "Reasoning summary", "\n")
}

func handleCodexTurnCompletedNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexTurnCompleted(message, threadID, turnID, sink)
}

func handleCodexThreadStarted(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread started params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	thread, err := requireObject(params, "thread", "codex thread started")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(thread, "id", "codex thread started thread")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_started", messageThreadID)
}

func handleCodexThreadStatusChanged(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread status changed params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread status changed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	status, err := requireObject(params, "status", "codex thread status changed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	statusType, err := requireString(status, "type", "codex thread status changed status")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if _, ok := status["activeFlags"]; ok {
		if _, err := optionalStringArray(status, "activeFlags", "codex thread status changed status"); err != nil {
			return codexNotificationResult{}, err
		}
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_status_changed", statusType)
}

func handleCodexThreadTokenUsageUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread token usage params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadMatch(message, params, threadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	tokenUsage, err := requireObject(params, "tokenUsage", "codex thread token usage")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireObject(tokenUsage, "last", "codex thread token usage tokenUsage"); err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireObject(tokenUsage, "total", "codex thread token usage tokenUsage"); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_token_usage_updated", turnID)
}

func handleCodexRemoteControlStatusChanged(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex remote control status params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireString(params, "installationId", "codex remote control status"); err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireString(params, "serverName", "codex remote control status"); err != nil {
		return codexNotificationResult{}, err
	}
	status, err := requireString(params, "status", "codex remote control status")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_remote_control_status_changed", status)
}

func handleCodexErrorNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex error notification params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	errorObject, err := requireObject(params, "error", "codex error notification")
	if err != nil {
		return codexNotificationResult{}, err
	}
	errorMessage, err := requireString(errorObject, "message", "codex error notification error")
	if err != nil {
		return codexNotificationResult{}, err
	}
	willRetry, err := requireBool(params, "willRetry", "codex error notification")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if willRetry {
		return codexNotificationResult{}, sink.Trace("codex_retryable_error_received", errorMessage)
	}
	return codexNotificationResult{}, fmt.Errorf("codex app-server error notification: %s", errorMessage)
}

func handleUnsupportedCodexNotification(message jsonRPCMessage, sink TurnSink) (codexNotificationResult, error) {
	err := fmt.Errorf("unsupported codex app-server notification: %s", message.Method)
	if diagnosticErr := emitCodexProviderDrift(sink, "codex_notification_unsupported", err.Error(), message, true); diagnosticErr != nil {
		return codexNotificationResult{}, diagnosticErr
	}
	return codexNotificationResult{}, err
}

func emitCodexProviderDrift(sink TurnSink, code string, messageText string, message jsonRPCMessage, resyncRequired bool) error {
	return emitCodexProviderDriftWithContext(sink, code, messageText, message, resyncRequired, nil)
}

func emitCodexProviderDriftWithContext(sink TurnSink, code string, messageText string, message jsonRPCMessage, resyncRequired bool, extraContext map[string]string) error {
	context := map[string]string{
		"method": message.Method,
	}
	for key, value := range extraContext {
		context[key] = value
	}
	if len(message.Params) > 0 {
		context["params"] = boundedJSON(message.Params, 4096)
	}
	return sink.ProviderDiagnostic(code, messageText, context, resyncRequired, DiagnosticSeverityCritical)
}

func boundedJSON(raw json.RawMessage, limit int) string {
	if len(raw) == 0 {
		return ""
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return boundedText(string(raw), limit)
	}
	data, err := json.Marshal(value)
	if err != nil {
		return boundedText(string(raw), limit)
	}
	return boundedText(string(data), limit)
}

func boundedText(value string, limit int) string {
	if limit <= 0 || len(value) <= limit {
		return value
	}
	return value[:limit] + "...<truncated>"
}

func handleCodexAssistantDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex assistant delta params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	delta, err := requireString(params, "delta", "codex assistant delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := optionalString(params, "itemId", "codex assistant delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.AssistantTextDelta(itemID, delta)
}

func handleCodexTurnStarted(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex turn started params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadMatch(message, params, threadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	messageTurnID, err := turnStartedID(params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{TurnID: messageTurnID}, sink.Trace("codex_turn_started", messageTurnID)
}

func handleCodexItemUpsert(message jsonRPCMessage, threadID string, turnID string, sink TurnSink, status RunItemStatus) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex item params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	item, err := requireObject(params, "item", "codex item")
	if err != nil {
		return codexNotificationResult{}, err
	}
	ignored, err := ignoreCodexItemIfHandled(item, sink)
	if err != nil || ignored {
		return codexNotificationResult{}, err
	}
	runItem, err := runItemFromCodexItem(item, status)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(runItem)
}

func ignoreCodexItemIfHandled(item map[string]any, sink TurnSink) (bool, error) {
	providerItemID, err := requireString(item, "id", "codex item")
	if err != nil {
		return false, err
	}
	codexType, err := requireString(item, "type", "codex item")
	if err != nil {
		return false, err
	}
	if codexType != "userMessage" {
		return false, nil
	}
	text, err := userMessageTextFromCodexItem(item)
	if err != nil {
		return true, err
	}
	if err := sink.UserMessageCommitted(text); err != nil {
		return true, err
	}
	return true, sink.Trace("codex_user_message_item_ignored", providerItemID)
}

func userMessageTextFromCodexItem(item map[string]any) (string, error) {
	content, err := requireArray(item, "content", "codex user message item")
	if err != nil {
		return "", err
	}
	parts := make([]string, 0, len(content))
	for index, rawPart := range content {
		part, ok := rawPart.(map[string]any)
		if !ok {
			return "", fmt.Errorf("codex user message item.content[%d] must be an object", index)
		}
		partType, err := requireString(part, "type", "codex user message item content")
		if err != nil {
			return "", err
		}
		if partType != "text" {
			continue
		}
		text, err := requireStringAllowEmpty(part, "text", "codex user message item content")
		if err != nil {
			return "", err
		}
		parts = append(parts, text)
	}
	return strings.Join(parts, ""), nil
}

func handleCodexTextActivityDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink, itemType RunItemType, title string) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex text activity delta params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := requireString(params, "itemId", "codex text activity delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	delta, err := requireString(params, "delta", "codex text activity delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(textActivityRunItem(itemID, itemType, title, delta))
}

func handleCodexTextActivityValue(message jsonRPCMessage, threadID string, turnID string, sink TurnSink, itemType RunItemType, title string, progress string) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex text activity params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := requireString(params, "itemId", "codex text activity")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(textActivityRunItem(itemID, itemType, title, progress))
}

func textActivityRunItem(itemID string, itemType RunItemType, title string, progress string) RunItem {
	return RunItem{
		ProviderItemID: itemID,
		Type:           itemType,
		Status:         RunItemStatusRunning,
		Title:          title,
		Progress:       progress,
	}
}

func handleCodexOutputDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex command output delta params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := requireString(params, "itemId", "codex command output delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	stream, err := requireString(params, "stream", "codex command output delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	delta, err := requireString(params, "delta", "codex command output delta")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemOutputDelta(itemID, stream, delta)
}

func handleCodexTerminalInteraction(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex terminal interaction params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := requireString(params, "itemId", "codex terminal interaction")
	if err != nil {
		return codexNotificationResult{}, err
	}
	text, err := requireString(params, "text", "codex terminal interaction")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: itemID + "_terminal",
		Type:           RunItemTypeTerminalInteraction,
		Status:         RunItemStatusCompleted,
		Title:          "Terminal interaction",
		Summary:        text,
	})
}

func handleCodexPatchUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex file patch params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := requireString(params, "itemId", "codex file patch")
	if err != nil {
		return codexNotificationResult{}, err
	}
	status, err := optionalString(params, "status", "codex file patch")
	if err != nil {
		return codexNotificationResult{}, err
	}
	paths, err := optionalStringArray(params, "changedPaths", "codex file patch")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: itemID,
		Type:           RunItemTypeFileChange,
		Status:         RunItemStatusRunning,
		FilePaths:      paths,
		PatchStatus:    status,
	})
}

func handleCodexMCPProgress(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex mcp progress params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	itemID, err := requireString(params, "itemId", "codex mcp progress")
	if err != nil {
		return codexNotificationResult{}, err
	}
	progress, err := requireString(params, "progress", "codex mcp progress")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: itemID,
		Type:           RunItemTypeMCPToolCall,
		Status:         RunItemStatusRunning,
		Progress:       progress,
	})
}

func handleCodexDiffUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex diff params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	summary, err := optionalString(params, "summary", "codex diff")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if summary == "" {
		summary = "Diff updated"
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: "diff_" + turnID,
		Type:           RunItemTypeDiff,
		Status:         RunItemStatusCompleted,
		DiffSummary:    summary,
	})
}

func handleCodexPlanUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex plan update params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	summary, err := optionalString(params, "summary", "codex plan update")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if summary == "" {
		summary, err = jsonSummaryAny(params["plan"])
		if err != nil {
			return codexNotificationResult{}, err
		}
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: "plan_" + turnID,
		Type:           RunItemTypePlan,
		Status:         RunItemStatusRunning,
		Title:          "Plan updated",
		Summary:        summary,
	})
}

func handleCodexNotice(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex notice params")
	if err != nil && len(message.Params) > 0 {
		return codexNotificationResult{}, err
	}
	switch policy := codexNotificationScopePolicies[message.Method]; {
	case len(params) == 0:
	case policy == codexNotificationScopeTurnState:
		if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
			return codexNotificationResult{}, err
		}
	case policy == codexNotificationScopeThread:
		if err := requireCodexThreadMatch(message, params, threadID, sink); err != nil {
			return codexNotificationResult{}, err
		}
	}
	text, err := optionalString(params, "message", "codex notice")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if text == "" {
		text = message.Method
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: "notice_" + message.Method + "_" + turnID,
		Type:           RunItemTypeNotice,
		Status:         RunItemStatusCompleted,
		NoticeKind:     message.Method,
		NoticeMessage:  text,
	})
}

// Codex app-server 0.135.0 turn status values from the app-server protocol
// source; new values are provider protocol drift until mapped explicitly.
var codexTurnOutcomeByCodexStatus = map[string]TurnOutcome{
	"cancelled":   TurnOutcomeCancelled,
	"completed":   TurnOutcomeCompleted,
	"failed":      TurnOutcomeFailed,
	"interrupted": TurnOutcomeCancelled,
}

func handleCodexTurnCompleted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	status, turn, err := codexCompletedTurnStatus(message, threadID, turnID, sink)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexTurnCompletionForStatus(status, turn, message, sink)
}

func codexCompletedTurnStatus(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (string, map[string]any, error) {
	params, err := objectValue(message.Params, "codex turn completed params")
	if err != nil {
		return "", nil, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex turn completed")
	if err != nil {
		return "", nil, err
	}
	turn, err := requireObject(params, "turn", "codex turn completed")
	if err != nil {
		return "", nil, err
	}
	messageTurnID, err := requireString(turn, "id", "codex turn completed turn")
	if err != nil {
		return "", nil, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, messageThreadID, messageTurnID, sink); err != nil {
		return "", nil, err
	}
	status, err := requireString(turn, "status", "codex turn completed turn")
	if err != nil {
		return "", nil, err
	}
	return status, turn, nil
}

func codexTurnCompletionForStatus(status string, turn map[string]any, message jsonRPCMessage, sink TurnSink) (codexNotificationResult, error) {
	outcome, ok := codexTurnOutcomeByCodexStatus[status]
	if !ok {
		err := fmt.Errorf("unsupported codex turn status: %s", status)
		if diagnosticErr := emitCodexProviderDrift(sink, "codex_turn_status_unsupported", err.Error(), message, true); diagnosticErr != nil {
			return codexNotificationResult{}, diagnosticErr
		}
		return codexNotificationResult{}, err
	}
	if outcome == TurnOutcomeFailed {
		message, err := turnErrorMessage(turn)
		if err != nil {
			return codexNotificationResult{}, err
		}
		return codexNotificationResult{Completion: TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: message}}, nil
	}
	return codexNotificationResult{Completion: TurnCompletion{Outcome: outcome}}, nil
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

func (harness *CodexHarness) registerActive(runID string, session *codexapp.Session) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	harness.active[runID] = &codexActiveTurn{session: session}
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
