package externalagents

import (
	"errors"
	"os"
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
)

func (e *CodexExecutor) runLoop(
	request StartRequest,
	session *codexSession,
	controller *codexRunController,
	cleanupPaths []string,
	threadID string,
	runtimeConfigPath string,
) {
	var backgroundTasks sync.WaitGroup
	defer func() {
		backgroundTasks.Wait()
		_ = controller.Cancel()
		cleanupCodexPaths(cleanupPaths)
		e.runtime.DeactivateRun(request.Run.ID)
	}()
	if !controller.waitForRuntimeReady() {
		return
	}

	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	eventState := newCodexEventState()
	if err := e.persistLiveState(request.Run.ID, state, threadID); err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	e.seedConfigMCPStatuses(request.Run.ID, runtimeConfigPath)
	e.scheduleMCPStatusCapture(session, request.Run.ID, codexMCPStatusProbeTimeout, &backgroundTasks)
	watchdog := time.NewTicker(e.watchdogPollInterval)
	defer watchdog.Stop()

	for {
		select {
		case payload, ok := <-session.events:
			finished, ok := e.handleRunLoopEvent(
				request,
				session,
				payload,
				ok,
				&state,
				eventState,
				&backgroundTasks,
			)
			if !ok || finished {
				return
			}
		case <-watchdog.C:
			if !e.handleRunLoopWatchdog(request.Run.ID, session, eventState) {
				return
			}
		}
	}
}

func cleanupCodexPaths(cleanupPaths []string) {
	for _, cleanupPath := range cleanupPaths {
		if strings.TrimSpace(cleanupPath) == "" {
			continue
		}
		_ = os.RemoveAll(cleanupPath)
	}
}

func (e *CodexExecutor) handleRunLoopEvent(
	request StartRequest,
	session *codexSession,
	payload map[string]any,
	ok bool,
	state *ChatState,
	eventState *codexEventState,
	backgroundTasks *sync.WaitGroup,
) (bool, bool) {
	if !ok {
		if err := e.handleProcessExit(request.Run.ID, session.processErr(), session.stderrTail()); err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		}
		return false, false
	}
	finished, err := e.handleEvent(request, session, payload, state, eventState, backgroundTasks)
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return false, false
	}
	return finished, true
}

func (e *CodexExecutor) handleRunLoopWatchdog(
	runID string,
	session *codexSession,
	eventState *codexEventState,
) bool {
	if err := e.checkPendingFunctionCallStall(runID, eventState); err != nil {
		_ = e.markRunFailed(runID, err, session.stderrTail())
		return false
	}
	return true
}

func (e *CodexExecutor) handleEvent(
	request StartRequest,
	session *codexSession,
	payload map[string]any,
	state *ChatState,
	eventState *codexEventState,
	backgroundTasks *sync.WaitGroup,
) (bool, error) {
	e.refreshLiveChatState(request.Run.ID, state)
	if handled, err := e.handleApprovalRequestEvent(request, session, payload, state); err != nil {
		return false, err
	} else if handled {
		return false, nil
	}
	eventState.notePayload(request.Run.ID, payload, e.runtime, time.Now().UTC())

	if handled, err := e.handleResponseItemEvent(request.Run.ID, payload, state, session.threadID()); err != nil {
		return false, err
	} else if handled {
		return false, nil
	}

	if usagePayload := captureCodexTokenUsageEvent(eventState, payload); usagePayload != nil {
		if err := e.persistUsagePayload(request.Run.ID, usagePayload); err != nil {
			return false, err
		}
	}
	if finished, err := e.handleTurnLifecycleEvent(request, session, payload, state, eventState, backgroundTasks); err != nil {
		return false, err
	} else if finished {
		return true, nil
	}

	if err := e.handleStreamEvent(request.Run.ID, session.threadID(), payload, state, eventState); err != nil {
		return false, err
	}
	return false, nil
}

func (e *CodexExecutor) refreshLiveChatState(runID string, state *ChatState) {
	if currentLiveState, err := e.runtime.GetLiveChatState(runID); err == nil && currentLiveState != nil {
		*state = *currentLiveState.Clone()
	}
}

func (e *CodexExecutor) handleApprovalRequestEvent(
	request StartRequest,
	session *codexSession,
	payload map[string]any,
	state *ChatState,
) (bool, error) {
	if !isCodexApprovalRequest(payload) {
		return false, nil
	}
	approvalState, arguments, err := buildCodexApprovalState(request, payload)
	if err != nil {
		return false, err
	}
	if err := e.runtime.RegisterApproval(approvalState); err != nil {
		return false, err
	}
	session.registerApprovalRawID(approvalState.ApprovalID, payload["id"])
	appendApprovalRequestMessage(state, approvalState.ApprovalID, arguments)
	if err := e.persistLiveState(request.Run.ID, *state, session.threadID()); err != nil {
		return false, err
	}
	run, err := e.runs.Load(request.Run.ID)
	if err != nil {
		return false, err
	}
	appendRunEvent(&run, "approval_request", map[string]any{
		"approvalId": approvalState.ApprovalID,
		"payload":    cloneAnyMap(payload),
	}, e.timeNow())
	if err := e.runs.Save(run); err != nil {
		return false, err
	}
	return true, nil
}

func (e *CodexExecutor) handleResponseItemEvent(
	runID string,
	payload map[string]any,
	state *ChatState,
	threadID string,
) (bool, error) {
	if strings.TrimSpace(stringValue(payload["type"])) != codexResponseItemEnvelope {
		return false, nil
	}
	handled, toolResult, err := e.applyResponseItem(runID, payload, state, threadID)
	if err != nil || !handled {
		return handled, err
	}
	if err := e.recordToolResultEvent(runID, toolResult); err != nil {
		return false, err
	}
	return true, nil
}

func (e *CodexExecutor) handleTurnLifecycleEvent(
	request StartRequest,
	session *codexSession,
	payload map[string]any,
	state *ChatState,
	eventState *codexEventState,
	backgroundTasks *sync.WaitGroup,
) (bool, error) {
	runStatus, errorPayload, ok := codexTerminalRunStatus(payload)
	if !ok {
		return false, nil
	}
	applyCompletionGuardToState(state, boolValue(request.Inputs["completionGuardEnabled"]))
	if e.shouldRefreshMCPStatuses(request.Run.ID) {
		e.scheduleMCPStatusCapture(session, request.Run.ID, codexMCPStatusProbeTimeout, backgroundTasks)
	}
	usagePayload := eventState.usagePayload()
	if err := e.finalizeRun(request.Run.ID, runStatus, errorPayload, *state, session.threadID(), usagePayload); err != nil {
		return false, err
	}
	return true, nil
}

func codexTerminalRunStatus(payload map[string]any) (agentruns.RunStatus, map[string]any, bool) {
	switch strings.TrimSpace(stringValue(payload["method"])) {
	case codexTurnCompletedMethod:
		return agentruns.RunStatusCompleted, nil, true
	case codexTurnFailedMethod:
		return agentruns.RunStatusFailed, codexTurnFailedPayload(payload), true
	default:
		return "", nil, false
	}
}

func codexTurnFailedPayload(payload map[string]any) map[string]any {
	errorPayload := map[string]any{}
	if params, ok := mapValue(payload["params"]); ok {
		if turn, ok := mapValue(params["turn"]); ok {
			if turnError := turn["error"]; turnError != nil {
				errorPayload["error"] = turnError
			}
		}
	}
	return errorPayload
}

func (e *CodexExecutor) handleStreamEvent(
	runID string,
	threadID string,
	payload map[string]any,
	state *ChatState,
	eventState *codexEventState,
) error {
	applied, toolResult, err := applyCodexStreamEvent(state, eventState, payload)
	if err != nil || !applied {
		return err
	}
	if err := e.recordToolResultEvent(runID, toolResult); err != nil {
		return err
	}
	return e.persistLiveState(runID, *state, threadID)
}

func (e *CodexExecutor) recordToolResultEvent(runID string, toolResult *codexToolResultMetadata) error {
	if toolResult == nil {
		return nil
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	appendRunEvent(&run, "tool_result", map[string]any{
		"toolCallId": toolResult.ToolCallID,
		"toolName":   toolResult.ToolName,
		"isError":    toolResult.IsError,
	}, e.timeNow())
	return e.runs.Save(run)
}

func (e *CodexExecutor) applyResponseItem(runID string, payload map[string]any, state *ChatState, threadID string) (bool, *codexToolResultMetadata, error) {
	applied, toolResult, err := applyCodexResponseItem(state, payload)
	if err != nil || !applied {
		return applied, toolResult, err
	}
	if err := e.persistLiveState(runID, *state, threadID); err != nil {
		return false, nil, err
	}
	return true, toolResult, nil
}

func (e *CodexExecutor) handleProcessExit(runID string, processErr error, stderrLines []string) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	if processErr == nil {
		processErr = errors.New("codex app-server exited before completing the run")
	}
	return e.markRunFailed(runID, processErr, stderrLines)
}

func (e *CodexExecutor) finalizeRun(
	runID string,
	status agentruns.RunStatus,
	extraPayload map[string]any,
	state ChatState,
	threadID string,
	usagePayload map[string]any,
) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(state.Messages)
	run.Outputs["toolCallArguments"] = cloneStringMap(state.ToolCallArguments)
	if threadID != "" {
		run.Outputs["threadId"] = threadID
	}
	if usagePayload != nil {
		run.Outputs["usage"] = deepCloneJSONValue(usagePayload)
	}
	e.runtime.attachMCPStatusSnapshot(&run)
	finishedAt := e.timeNow().UTC()
	run.Status = status
	run.FinishedAt = &finishedAt
	eventType := "run_completed"
	if status == agentruns.RunStatusFailed {
		eventType = "run_failed"
	}
	appendRunEvent(&run, eventType, cloneAnyMap(extraPayload), finishedAt)
	return e.runs.Save(run)
}

func (e *CodexExecutor) markRunFailed(runID string, runErr error, stderrLines []string) error {
	_, err := persistExternalAgentRunFailure(
		e.runs,
		e.runtime,
		e.timeNow,
		runID,
		runErr,
		stderrLines,
	)
	return err
}

func (e *CodexExecutor) persistUsagePayload(runID string, usagePayload map[string]any) error {
	if usagePayload == nil {
		return nil
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["usage"] = deepCloneJSONValue(usagePayload)
	return e.runs.Save(run)
}

func (e *CodexExecutor) persistThreadID(runID string, threadID string) error {
	if strings.TrimSpace(threadID) == "" {
		return errCodexThreadStartFailed
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["threadId"] = threadID
	return e.runs.Save(run)
}

func (e *CodexExecutor) persistLiveState(runID string, state ChatState, threadID string) error {
	if err := e.runtime.SetLiveChatState(runID, state); err != nil {
		return err
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(state.Messages)
	run.Outputs["toolCallArguments"] = cloneStringMap(state.ToolCallArguments)
	if threadID != "" {
		run.Outputs["threadId"] = threadID
	}
	return e.runs.Save(run)
}

func (e *CodexExecutor) loadCurrentChatState(run agentruns.Run) (ChatState, error) {
	liveState, err := e.runtime.GetLiveChatState(run.ID)
	if err != nil {
		return ChatState{}, err
	}
	if liveState != nil {
		cloned := liveState.Clone()
		cloned.WaitingForResponse = true
		return *cloned, nil
	}
	built, err := buildChatStateFromRun(run)
	if err != nil {
		return ChatState{}, err
	}
	if built == nil {
		return ChatState{
			Messages:           []map[string]any{},
			WaitingForResponse: true,
			ToolCallArguments:  map[string]string{},
		}, nil
	}
	cloned := built.Clone()
	cloned.WaitingForResponse = true
	return *cloned, nil
}
