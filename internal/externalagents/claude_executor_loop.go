package externalagents

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"setta/internal/agentruns"
)

func (e *ClaudeExecutor) runLoop(
	request StartRequest,
	session *claudeSession,
	controller *claudeRunController,
	cleanupPaths []string,
) {
	defer e.finishClaudeRunLoop(request.Run.ID, controller, cleanupPaths)
	loopState, ready, err := e.prepareClaudeRunLoop(request, session, controller)
	if !ready {
		return
	}
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	for {
		done, err := e.processClaudeRunLoopEvent(request, session, loopState)
		if err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			return
		}
		if done {
			return
		}
	}
}

type claudeLoopState struct {
	chatState ChatState
	sessionID string
	parser    *claudeEventParser
	result    *claudeResultPayload
}

func (e *ClaudeExecutor) finishClaudeRunLoop(
	runID string,
	controller *claudeRunController,
	cleanupPaths []string,
) {
	_ = controller.Cancel()
	for _, cleanupPath := range cleanupPaths {
		if strings.TrimSpace(cleanupPath) == "" {
			continue
		}
		_ = os.RemoveAll(cleanupPath)
	}
	e.runtime.DeactivateRun(runID)
}

func (e *ClaudeExecutor) prepareClaudeRunLoop(
	request StartRequest,
	session *claudeSession,
	controller *claudeRunController,
) (*claudeLoopState, bool, error) {
	if !controller.waitForRuntimeReady() {
		return nil, false, nil
	}
	if err := e.seedClaudeMCPStatuses(request.Run.ID, stringValue(request.Inputs["mcpConfig"])); err != nil && !errors.Is(err, ErrRunNotActive) {
		return nil, true, err
	}
	sessionID := strings.TrimSpace(stringValue(request.Inputs["sessionId"]))
	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		return nil, true, err
	}
	if err := e.persistLiveState(request.Run.ID, state, sessionID, nil); err != nil {
		return nil, true, err
	}
	return &claudeLoopState{
		chatState: state,
		sessionID: sessionID,
		parser:    newClaudeEventParser(e.runtime, request),
	}, true, nil
}

func (e *ClaudeExecutor) processClaudeRunLoopEvent(
	request StartRequest,
	session *claudeSession,
	loopState *claudeLoopState,
) (bool, error) {
	payload, ok := <-session.events
	if !ok {
		return true, e.handleProcessExit(
			request.Run.ID,
			session.processErr(),
			session.stderrTail(),
			loopState.chatState,
			loopState.sessionID,
			loopState.result,
			boolValue(request.Inputs["completionGuardEnabled"]),
		)
	}
	e.refreshClaudeRunLoopState(request.Run.ID, payload, loopState)
	changed, nextResult, err := e.handleEvent(request, loopState.parser, payload, &loopState.chatState)
	if err != nil {
		return false, err
	}
	loopState.applyResult(nextResult)
	if !changed {
		return false, nil
	}
	return false, e.persistLiveState(request.Run.ID, loopState.chatState, loopState.sessionID, nil)
}

func (e *ClaudeExecutor) refreshClaudeRunLoopState(
	runID string,
	payload map[string]any,
	loopState *claudeLoopState,
) {
	if currentLiveState, err := e.runtime.GetLiveChatState(runID); err == nil && currentLiveState != nil {
		loopState.chatState = *currentLiveState.Clone()
	}
	if nextSessionID := extractClaudeSessionID(payload); nextSessionID != "" {
		loopState.sessionID = nextSessionID
	}
}

func (loopState *claudeLoopState) applyResult(result *claudeResultPayload) {
	if result == nil {
		return
	}
	loopState.result = result
	if result.SessionID != "" {
		loopState.sessionID = result.SessionID
	}
}

func (e *ClaudeExecutor) handleEvent(
	request StartRequest,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, *claudeResultPayload, error) {
	switch strings.TrimSpace(stringValue(payload["type"])) {
	case "approval_request":
		changed, err := e.handleApprovalRequestEvent(request, parser, payload, state)
		return changed, nil, err
	case "stream_event":
		return e.handleStreamEventEnvelope(request.Run.ID, parser, payload, state)
	case "assistant_message":
		return e.handleAssistantMessageEvent(request.Run.ID, parser, payload, state)
	case "system_message":
		return false, nil, e.handleSystemMessageEvent(request.Run.ID, payload)
	case "result":
		return false, extractClaudeResult(payload), nil
	case "error":
		return false, nil, claudeEventError(payload)
	default:
		return false, nil, nil
	}
}

func (e *ClaudeExecutor) handleApprovalRequestEvent(
	request StartRequest,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, error) {
	approvalID := strings.TrimSpace(stringValue(payload["approvalId"]))
	if approvalID == "" {
		return false, fmt.Errorf("claude approval request missing approvalId")
	}
	toolName := normalizeClaudeToolName(stringValue(payload["toolName"]))
	if toolName == askUserQuestionToolName {
		return false, e.queueQuestionApprovalRequest(request.Run.ID, parser, approvalID, payload)
	}
	return e.registerApprovalRequestEvent(request, approvalID, payload, state)
}

func (e *ClaudeExecutor) queueQuestionApprovalRequest(
	runID string,
	parser *claudeEventParser,
	approvalID string,
	payload map[string]any,
) error {
	if err := parser.queueQuestionApproval(approvalID); err != nil {
		return err
	}
	return e.persistApprovalRequestEvent(runID, approvalID, payload)
}

func (e *ClaudeExecutor) registerApprovalRequestEvent(
	request StartRequest,
	approvalID string,
	payload map[string]any,
	state *ChatState,
) (bool, error) {
	approvalState := ApprovalState{
		ApprovalID:      approvalID,
		RunID:           request.Run.ID,
		ProjectConfigID: request.ProjectConfigID,
		ChatID:          request.ChatID,
		SectionID:       cloneOptionalString(request.SectionID),
	}
	if err := e.runtime.RegisterApproval(approvalState); err != nil {
		return false, err
	}
	appendApprovalRequestMessage(state, approvalID, buildClaudeApprovalArguments(payload))
	if err := e.persistApprovalRequestEvent(request.Run.ID, approvalID, payload); err != nil {
		return true, err
	}
	return true, nil
}

func (e *ClaudeExecutor) handleStreamEventEnvelope(
	runID string,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, *claudeResultPayload, error) {
	eventPayload, ok := mapValue(payload["event"])
	if !ok {
		return false, nil, nil
	}
	changed, err := parser.handleStreamEvent(eventPayload, state)
	return e.finishParsedClaudeEvent(runID, parser, changed, err)
}

func (e *ClaudeExecutor) handleAssistantMessageEvent(
	runID string,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, *claudeResultPayload, error) {
	messagePayload, ok := mapValue(payload["message"])
	if !ok {
		return false, nil, nil
	}
	changed, err := parser.handleAssistantMessage(messagePayload, state)
	return e.finishParsedClaudeEvent(runID, parser, changed, err)
}

func (e *ClaudeExecutor) finishParsedClaudeEvent(
	runID string,
	parser *claudeEventParser,
	changed bool,
	err error,
) (bool, *claudeResultPayload, error) {
	if err != nil {
		return changed, nil, err
	}
	return e.persistClaudeToolResults(runID, parser.takeToolResults(), changed)
}

func (e *ClaudeExecutor) handleSystemMessageEvent(runID string, payload map[string]any) error {
	statuses := buildClaudeMCPStatuses(payload, e.timeNow)
	if len(statuses) == 0 {
		return nil
	}
	if err := e.runtime.UpsertMCPStatuses(runID, statuses); err != nil && !errors.Is(err, ErrRunNotActive) {
		return err
	}
	return nil
}

func claudeEventError(payload map[string]any) error {
	message := strings.TrimSpace(stringValue(payload["message"]))
	if message == "" {
		message = "claude sidecar reported an error"
	}
	return errors.New(message)
}

func (e *ClaudeExecutor) persistApprovalRequestEvent(runID string, approvalID string, payload map[string]any) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	appendRunEvent(&run, "approval_request", map[string]any{
		"approvalId": approvalID,
		"payload":    cloneAnyMap(payload),
	}, e.timeNow())
	return e.runs.Save(run)
}

func (e *ClaudeExecutor) handleProcessExit(
	runID string,
	processErr error,
	stderrLines []string,
	state ChatState,
	sessionID string,
	result *claudeResultPayload,
	completionGuardEnabled bool,
) error {
	if processErr != nil {
		return e.markRunFailed(runID, processErr, stderrLines)
	}
	if result != nil && result.IsError {
		message := strings.TrimSpace(result.Result)
		if message == "" {
			message = "Claude SDK run failed"
		}
		return e.markRunFailed(runID, errors.New(message), stderrLines)
	}
	var usage map[string]any
	if result != nil && result.Usage != nil {
		usage = cloneAnyMap(result.Usage)
	}
	applyCompletionGuardToState(&state, completionGuardEnabled)
	return e.finalizeRun(runID, state, sessionID, usage)
}

func (e *ClaudeExecutor) finalizeRun(runID string, state ChatState, sessionID string, usage map[string]any) error {
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
	if strings.TrimSpace(sessionID) != "" {
		run.Outputs["sessionId"] = sessionID
	}
	if len(usage) > 0 {
		run.Outputs["usage"] = deepCloneJSONValue(usage)
	}
	finishedAt := e.timeNow().UTC()
	run.Status = agentruns.RunStatusCompleted
	run.FinishedAt = &finishedAt
	e.runtime.attachMCPStatusSnapshot(&run)
	appendRunEvent(&run, "run_completed", map[string]any{}, finishedAt)
	return e.runs.Save(run)
}

func (e *ClaudeExecutor) markRunFailed(runID string, runErr error, stderrLines []string) error {
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

func (e *ClaudeExecutor) persistLiveState(runID string, state ChatState, sessionID string, usage map[string]any) error {
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
	if strings.TrimSpace(sessionID) != "" {
		run.Outputs["sessionId"] = sessionID
	}
	if len(usage) > 0 {
		run.Outputs["usage"] = deepCloneJSONValue(usage)
	}
	return e.runs.Save(run)
}

func (e *ClaudeExecutor) persistClaudeToolResults(
	runID string,
	toolResults []claudeToolResultMetadata,
	changed bool,
) (bool, *claudeResultPayload, error) {
	if len(toolResults) == 0 {
		return changed, nil, nil
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return changed, nil, err
	}
	for _, toolResult := range toolResults {
		appendRunEvent(&run, "tool_result", map[string]any{
			"toolCallId": toolResult.ToolCallID,
			"toolName":   toolResult.ToolName,
			"result":     deepCloneJSONValue(toolResult.Result),
			"isError":    toolResult.IsError,
		}, e.timeNow())
	}
	if err := e.runs.Save(run); err != nil {
		return changed, nil, err
	}
	return changed, nil, nil
}

func (e *ClaudeExecutor) seedClaudeMCPStatuses(runID string, configPath string) error {
	return e.runtime.UpsertMCPStatuses(runID, buildUnknownClaudeMCPStatuses(configPath))
}

func (e *ClaudeExecutor) loadCurrentChatState(run agentruns.Run) (ChatState, error) {
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
