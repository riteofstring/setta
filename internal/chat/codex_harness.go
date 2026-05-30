package chat

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

type CodexHarnessConfig struct {
	Command string
	Args    []string
	Env     []string
}

type CodexHarness struct {
	config CodexHarnessConfig

	mu        sync.Mutex
	active    map[string]*codexActiveTurn
	approvals map[string]codexPendingApproval
}

type codexActiveTurn struct {
	client   *jsonRPCClient
	threadID string
	turnID   string
}

type codexPendingApproval struct {
	client            *jsonRPCClient
	method            string
	permissionProfile map[string]any
	requestID         any
	runID             string
	questions         []ApprovalQuestion
}

type codexApprovalReply struct {
	errorMessage string
	result       any
}

func NewCodexHarness(config CodexHarnessConfig) *CodexHarness {
	if config.Command == "" {
		config.Command = "codex"
	}
	if len(config.Args) == 0 {
		config.Args = []string{"app-server", "--listen", "stdio://"}
	}
	return &CodexHarness{
		config:    config,
		active:    map[string]*codexActiveTurn{},
		approvals: map[string]codexPendingApproval{},
	}
}

func (harness *CodexHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	client, err := startJSONRPCClient(harness.config)
	if err != nil {
		return err
	}
	defer client.close()
	harness.registerActive(request.Run.ID, client)
	defer harness.unregisterActive(request.Run.ID)

	if err := initializeCodex(ctx, client); err != nil {
		return err
	}
	threadID, err := harness.startOrResumeThread(ctx, client, request)
	if err != nil {
		return err
	}
	turnID, err := startCodexTurn(ctx, client, threadID, request)
	if err != nil {
		return err
	}
	harness.updateActiveTurn(request.Run.ID, threadID, turnID)
	if err := sink.ThreadLinked(threadID, "", turnID); err != nil {
		return err
	}
	return harness.waitForTurn(ctx, client, request.Run.ID, threadID, turnID, sink)
}

func (harness *CodexHarness) waitForTurn(ctx context.Context, client *jsonRPCClient, runID string, threadID string, turnID string, sink TurnSink) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-client.done:
			if err == nil {
				return errors.New("codex app-server exited before turn completed")
			}
			return fmt.Errorf("codex app-server exited before turn completed: %w", err)
		case message := <-client.notifications:
			done, err := handleCodexNotification(message, threadID, turnID, sink)
			if err != nil {
				return err
			}
			if done {
				return nil
			}
		case message := <-client.requests:
			if err := harness.handleCodexServerRequest(message, runID, threadID, turnID, sink); err != nil {
				_ = client.respondError(message.ID, -32601, err.Error())
				return err
			}
		}
	}
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
	_, err := active.client.call(ctx, "turn/interrupt", map[string]any{
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
	_, err := active.client.call(ctx, "turn/steer", map[string]any{
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
		_ = pending.client.respondError(pending.requestID, -32000, err.Error())
		return err
	}
	if reply.errorMessage != "" {
		err = pending.client.respondError(pending.requestID, -32000, reply.errorMessage)
	} else {
		err = pending.client.respondResult(pending.requestID, reply.result)
	}
	if err != nil {
		return err
	}
	harness.mu.Lock()
	delete(harness.approvals, response.ApprovalID)
	harness.mu.Unlock()
	return nil
}

func initializeCodex(ctx context.Context, client *jsonRPCClient) error {
	_, err := client.call(ctx, "initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "setta",
			"title":   "Setta",
			"version": "dev",
		},
		"capabilities": map[string]any{
			"experimentalApi": true,
		},
	})
	if err != nil {
		return fmt.Errorf("initialize codex app-server: %w", err)
	}
	return nil
}

func (harness *CodexHarness) startOrResumeThread(ctx context.Context, client *jsonRPCClient, request TurnRequest) (string, error) {
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		result, err := client.call(ctx, "thread/resume", map[string]any{
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

	result, err := client.call(ctx, "thread/start", map[string]any{
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

func startCodexTurn(ctx context.Context, client *jsonRPCClient, threadID string, request TurnRequest) (string, error) {
	result, err := client.call(ctx, "turn/start", map[string]any{
		"cwd":      request.Workspace.RootPath,
		"threadId": threadID,
		"input": []map[string]any{{
			"text": request.Prompt,
			"type": "text",
		}},
	})
	if err != nil {
		return "", fmt.Errorf("start codex turn: %w", err)
	}
	turnID, err := turnIDFromResponse(result)
	if err != nil {
		return "", err
	}
	return turnID, nil
}

type codexNotificationHandler func(jsonRPCMessage, string, string, TurnSink) (bool, error)

var codexNotificationHandlers = map[string]codexNotificationHandler{
	"configWarning":                             handleCodexNotice,
	"deprecationNotice":                         handleCodexNotice,
	"error":                                     handleCodexErrorNotification,
	"guardianWarning":                           handleCodexNotice,
	"item/agentMessage/delta":                   handleCodexAssistantDelta,
	"item/commandExecution/outputDelta":         handleCodexOutputDelta,
	"item/commandExecution/terminalInteraction": handleCodexTerminalInteraction,
	"item/completed":                            handleCodexItemCompleted,
	"item/fileChange/patchUpdated":              handleCodexPatchUpdated,
	"item/mcpToolCall/progress":                 handleCodexMCPProgress,
	"item/plan/delta":                           handleCodexPlanDelta,
	"item/reasoning/summaryPartAdded":           handleCodexReasoningSummaryPartAdded,
	"item/reasoning/summaryTextDelta":           handleCodexReasoningSummaryDelta,
	"item/started":                              handleCodexItemStarted,
	"model/rerouted":                            handleCodexNotice,
	"rawResponseItem/completed":                 ignoreCodexNotification,
	"thread/compacted":                          handleCodexNotice,
	"turn/completed":                            handleCodexTurnCompletedNotification,
	"turn/diff/updated":                         handleCodexDiffUpdated,
	"turn/plan/updated":                         handleCodexPlanUpdated,
	"turn/started":                              handleCodexTurnStarted,
	"warning":                                   handleCodexNotice,
}

func handleCodexNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	handler, ok := codexNotificationHandlers[message.Method]
	if !ok {
		return handleUnsupportedCodexNotification(message, sink)
	}
	return handler(message, threadID, turnID, sink)
}

func handleCodexItemStarted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	return handleCodexItemUpsert(message, threadID, turnID, sink, RunItemStatusRunning)
}

func handleCodexItemCompleted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	return handleCodexItemUpsert(message, threadID, turnID, sink, RunItemStatusCompleted)
}

func handleCodexPlanDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	return handleCodexTextActivityDelta(message, threadID, turnID, sink, RunItemTypePlan, "Plan update")
}

func handleCodexReasoningSummaryDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	return handleCodexTextActivityDelta(message, threadID, turnID, sink, RunItemTypeReasoning, "Reasoning summary")
}

func handleCodexReasoningSummaryPartAdded(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	return handleCodexTextActivityValue(message, threadID, turnID, sink, RunItemTypeReasoning, "Reasoning summary", "\n")
}

func handleCodexTurnCompletedNotification(message jsonRPCMessage, threadID string, turnID string, _ TurnSink) (bool, error) {
	return handleCodexTurnCompleted(message, threadID, turnID)
}

func ignoreCodexNotification(jsonRPCMessage, string, string, TurnSink) (bool, error) {
	return false, nil
}

func handleCodexErrorNotification(message jsonRPCMessage, _ string, _ string, _ TurnSink) (bool, error) {
	errorMessage, err := requireStringFromRaw(message.Params, "message", "codex error notification")
	if err != nil {
		return false, err
	}
	return false, fmt.Errorf("codex app-server error notification: %s", errorMessage)
}

func handleUnsupportedCodexNotification(message jsonRPCMessage, sink TurnSink) (bool, error) {
	if err := sink.Trace("codex_notification_unsupported", message.Method); err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: "notice_" + message.Method,
		Type:           RunItemTypeNotice,
		Status:         RunItemStatusCompleted,
		NoticeKind:     "unsupported_notification",
		NoticeMessage:  message.Method,
	})
}

func handleCodexAssistantDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex assistant delta params")
	if err != nil {
		return false, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex assistant delta")
	if err != nil {
		return false, err
	}
	messageTurnID, err := requireString(params, "turnId", "codex assistant delta")
	if err != nil {
		return false, err
	}
	if messageThreadID != threadID || messageTurnID != turnID {
		return false, nil
	}
	delta, err := requireString(params, "delta", "codex assistant delta")
	if err != nil {
		return false, err
	}
	itemID, err := optionalString(params, "itemId", "codex assistant delta")
	if err != nil {
		return false, err
	}
	return false, sink.AssistantTextDelta(itemID, delta)
}

func handleCodexTurnStarted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex turn started params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	return false, sink.Trace("codex_turn_started", turnID)
}

func handleCodexItemUpsert(message jsonRPCMessage, threadID string, turnID string, sink TurnSink, status string) (bool, error) {
	params, err := objectValue(message.Params, "codex item params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	item, err := requireObject(params, "item", "codex item")
	if err != nil {
		return false, err
	}
	runItem, err := runItemFromCodexItem(item, status)
	if err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(runItem)
}

func handleCodexTextActivityDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink, itemType string, title string) (bool, error) {
	params, err := objectValue(message.Params, "codex text activity delta params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	itemID, err := requireString(params, "itemId", "codex text activity delta")
	if err != nil {
		return false, err
	}
	delta, err := requireString(params, "delta", "codex text activity delta")
	if err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(textActivityRunItem(itemID, itemType, title, delta))
}

func handleCodexTextActivityValue(message jsonRPCMessage, threadID string, turnID string, sink TurnSink, itemType string, title string, progress string) (bool, error) {
	params, err := objectValue(message.Params, "codex text activity params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	itemID, err := requireString(params, "itemId", "codex text activity")
	if err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(textActivityRunItem(itemID, itemType, title, progress))
}

func textActivityRunItem(itemID string, itemType string, title string, progress string) RunItem {
	return RunItem{
		ProviderItemID: itemID,
		Type:           itemType,
		Status:         RunItemStatusRunning,
		Title:          title,
		Progress:       progress,
	}
}

func handleCodexOutputDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex command output delta params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	itemID, err := requireString(params, "itemId", "codex command output delta")
	if err != nil {
		return false, err
	}
	stream, err := requireString(params, "stream", "codex command output delta")
	if err != nil {
		return false, err
	}
	delta, err := requireString(params, "delta", "codex command output delta")
	if err != nil {
		return false, err
	}
	return false, sink.RunItemOutputDelta(itemID, stream, delta)
}

func handleCodexTerminalInteraction(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex terminal interaction params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	itemID, err := requireString(params, "itemId", "codex terminal interaction")
	if err != nil {
		return false, err
	}
	text, err := requireString(params, "text", "codex terminal interaction")
	if err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: itemID + "_terminal",
		Type:           RunItemTypeTerminalInteraction,
		Status:         RunItemStatusCompleted,
		Title:          "Terminal interaction",
		Summary:        text,
	})
}

func handleCodexPatchUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex file patch params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	itemID, err := requireString(params, "itemId", "codex file patch")
	if err != nil {
		return false, err
	}
	status, err := optionalString(params, "status", "codex file patch")
	if err != nil {
		return false, err
	}
	paths, err := optionalStringArray(params, "changedPaths", "codex file patch")
	if err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: itemID,
		Type:           RunItemTypeFileChange,
		Status:         RunItemStatusRunning,
		FilePaths:      paths,
		PatchStatus:    status,
	})
}

func handleCodexMCPProgress(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex mcp progress params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	itemID, err := requireString(params, "itemId", "codex mcp progress")
	if err != nil {
		return false, err
	}
	progress, err := requireString(params, "progress", "codex mcp progress")
	if err != nil {
		return false, err
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: itemID,
		Type:           RunItemTypeMCPToolCall,
		Status:         RunItemStatusRunning,
		Progress:       progress,
	})
}

func handleCodexDiffUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex diff params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	summary, err := optionalString(params, "summary", "codex diff")
	if err != nil {
		return false, err
	}
	if summary == "" {
		summary = "Diff updated"
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: "diff_" + turnID,
		Type:           RunItemTypeDiff,
		Status:         RunItemStatusCompleted,
		DiffSummary:    summary,
	})
}

func handleCodexPlanUpdated(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex plan update params")
	if err != nil {
		return false, err
	}
	if !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	summary, err := optionalString(params, "summary", "codex plan update")
	if err != nil {
		return false, err
	}
	if summary == "" {
		summary, err = jsonSummaryAny(params["plan"])
		if err != nil {
			return false, err
		}
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: "plan_" + turnID,
		Type:           RunItemTypePlan,
		Status:         RunItemStatusRunning,
		Title:          "Plan updated",
		Summary:        summary,
	})
}

func handleCodexNotice(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params, "codex notice params")
	if err != nil && len(message.Params) > 0 {
		return false, err
	}
	if len(params) > 0 && !notificationMatchesTurn(params, threadID, turnID) {
		return false, nil
	}
	text, err := optionalString(params, "message", "codex notice")
	if err != nil {
		return false, err
	}
	if text == "" {
		text = message.Method
	}
	return false, sink.RunItemUpsert(RunItem{
		ProviderItemID: "notice_" + message.Method + "_" + turnID,
		Type:           RunItemTypeNotice,
		Status:         RunItemStatusCompleted,
		NoticeKind:     message.Method,
		NoticeMessage:  text,
	})
}

func handleCodexTurnCompleted(message jsonRPCMessage, threadID string, turnID string) (bool, error) {
	params, err := objectValue(message.Params, "codex turn completed params")
	if err != nil {
		return false, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex turn completed")
	if err != nil {
		return false, err
	}
	if messageThreadID != threadID {
		return false, nil
	}
	turn, err := requireObject(params, "turn", "codex turn completed")
	if err != nil {
		return false, err
	}
	messageTurnID, err := requireString(turn, "id", "codex turn completed turn")
	if err != nil {
		return false, err
	}
	if messageTurnID != turnID {
		return false, nil
	}
	status, err := requireString(turn, "status", "codex turn completed turn")
	if err != nil {
		return false, err
	}
	if status == "failed" {
		message, err := turnErrorMessage(turn)
		if err != nil {
			return false, err
		}
		return false, fmt.Errorf("codex turn failed: %s", message)
	}
	return true, nil
}

func (harness *CodexHarness) handleCodexServerRequest(message jsonRPCMessage, runID string, threadID string, turnID string, sink TurnSink) error {
	if !isSupportedCodexServerRequest(message.Method) {
		return handleUnsupportedCodexServerRequest(message, sink)
	}
	approval, details, err := approvalRequestFromCodex(message, runID, threadID, turnID)
	if err != nil {
		return err
	}
	if err := sink.RunItemUpsert(details.runItem); err != nil {
		return err
	}
	harness.mu.Lock()
	harness.approvals[approval.ID] = codexPendingApproval{
		client:            message.client,
		method:            message.Method,
		permissionProfile: details.permissionProfile,
		requestID:         message.ID,
		runID:             runID,
		questions:         details.questions,
	}
	harness.mu.Unlock()
	return sink.ApprovalRequested(approval)
}

var supportedCodexServerRequests = map[string]bool{
	"item/commandExecution/requestApproval": true,
	"item/fileChange/requestApproval":       true,
	"item/permissions/requestApproval":      true,
	"item/tool/requestUserInput":            true,
}

func isSupportedCodexServerRequest(method string) bool {
	return supportedCodexServerRequests[method]
}

func handleUnsupportedCodexServerRequest(message jsonRPCMessage, sink TurnSink) error {
	if err := sink.Trace("codex_request_unsupported", message.Method); err != nil {
		return err
	}
	if err := sink.RunItemUpsert(RunItem{
		ProviderItemID: "notice_request_" + message.Method,
		Type:           RunItemTypeNotice,
		Status:         RunItemStatusCompleted,
		NoticeKind:     "unsupported_request",
		NoticeMessage:  message.Method,
	}); err != nil {
		return err
	}
	return fmt.Errorf("unsupported codex app-server request: %s", message.Method)
}

type codexApprovalDetails struct {
	permissionProfile map[string]any
	questions         []ApprovalQuestion
	runItem           RunItem
}

type codexApprovalContext struct {
	providerItemID string
	requestID      string
	runID          string
}

func approvalRequestFromCodex(message jsonRPCMessage, runID string, threadID string, turnID string) (ApprovalRequest, codexApprovalDetails, error) {
	params, err := objectValue(message.Params, "codex approval request params")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	requestID, err := requestIDString(message.ID)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	if err := validateCodexRequestTurn(params, threadID, turnID); err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	itemID, err := requireString(params, "itemId", "codex approval request")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	context := codexApprovalContext{providerItemID: itemID, requestID: requestID, runID: runID}
	switch message.Method {
	case "item/commandExecution/requestApproval":
		return commandApprovalFromCodex(params, context)
	case "item/fileChange/requestApproval":
		return fileChangeApprovalFromCodex(params, context)
	case "item/permissions/requestApproval":
		return permissionApprovalFromCodex(params, context)
	case "item/tool/requestUserInput":
		return userInputApprovalFromCodex(params, context)
	default:
		return ApprovalRequest{}, codexApprovalDetails{}, fmt.Errorf("unsupported codex app-server request: %s", message.Method)
	}
}

func validateCodexRequestTurn(params map[string]any, threadID string, turnID string) error {
	messageThreadID, err := requireString(params, "threadId", "codex approval request")
	if err != nil {
		return err
	}
	messageTurnID, err := requireString(params, "turnId", "codex approval request")
	if err != nil {
		return err
	}
	if messageThreadID != threadID || messageTurnID != turnID {
		return fmt.Errorf("codex approval request belongs to thread %s turn %s, not thread %s turn %s", messageThreadID, messageTurnID, threadID, turnID)
	}
	return nil
}

func commandApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	command, err := requireString(params, "command", "codex command approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	reason, err := optionalString(params, "reason", "codex command approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	cwd, err := optionalString(params, "cwd", "codex command approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindCommand,
		Title:          "Command approval",
		Body:           reason,
		Command:        command,
		FilePath:       cwd,
		Options:        []string{},
	}
	return approval, codexApprovalDetails{runItem: commandApprovalRunItem(context.providerItemID, command, cwd, reason)}, nil
}

func commandApprovalRunItem(providerItemID string, command string, cwd string, reason string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusPending,
		Title:          "Command approval",
		Summary:        reason,
		Command:        command,
		Cwd:            cwd,
	}
}

func fileChangeApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	reason, err := optionalString(params, "reason", "codex file change approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	grantRoot, err := requireString(params, "grantRoot", "codex file change approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindFileChange,
		Title:          "File change approval",
		Body:           reason,
		FilePath:       grantRoot,
		Options:        []string{},
	}
	return approval, codexApprovalDetails{runItem: fileChangeApprovalRunItem(context.providerItemID, grantRoot, reason)}, nil
}

func fileChangeApprovalRunItem(providerItemID string, grantRoot string, reason string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeFileChange,
		Status:         RunItemStatusPending,
		Title:          "File change approval",
		Summary:        reason,
		FilePaths:      []string{grantRoot},
		PatchStatus:    "approval_requested",
	}
}

func permissionApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	permissions, err := requireObject(params, "permissions", "codex permission approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	permissionSummary, err := jsonSummary(permissions)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	reason, err := optionalString(params, "reason", "codex permission approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	cwd, err := optionalString(params, "cwd", "codex permission approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindPermission,
		Title:          "Permission approval",
		Body:           reason,
		FilePath:       cwd,
		Permission:     permissionSummary,
		Options:        []string{},
	}
	return approval, codexApprovalDetails{
		permissionProfile: permissions,
		runItem:           permissionApprovalRunItem(context.providerItemID, cwd, reason, permissionSummary),
	}, nil
}

func permissionApprovalRunItem(providerItemID string, cwd string, reason string, permissionSummary string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusPending,
		Title:          "Permission approval",
		Summary:        reason,
		Cwd:            cwd,
		Result:         permissionSummary,
	}
}

func userInputApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	questions, title, body, options, err := userInputQuestions(params)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindUserInput,
		Title:          title,
		Body:           body,
		Question:       body,
		Options:        options,
		Questions:      questions,
	}
	return approval, codexApprovalDetails{
		questions: questions,
		runItem:   userInputApprovalRunItem(context.providerItemID, title, body),
	}, nil
}

func userInputApprovalRunItem(providerItemID string, title string, body string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusPending,
		Title:          title,
		Summary:        body,
	}
}

func codexApprovalResult(pending codexPendingApproval, response ApprovalResponse) (codexApprovalReply, error) {
	switch pending.method {
	case "item/commandExecution/requestApproval":
		return codexApprovalReply{result: map[string]any{"decision": approvalDecision(response)}}, nil
	case "item/fileChange/requestApproval":
		return codexApprovalReply{result: map[string]any{"decision": approvalDecision(response)}}, nil
	case "item/permissions/requestApproval":
		if !response.Approved || response.Cancelled {
			return codexApprovalReply{errorMessage: "permission request denied"}, nil
		}
		return codexApprovalReply{result: map[string]any{"permissions": pending.permissionProfile, "scope": "turn"}}, nil
	case "item/tool/requestUserInput":
		if response.Cancelled {
			return codexApprovalReply{errorMessage: "user input cancelled"}, nil
		}
		answers := map[string]any{}
		submitted := answersByQuestionID(response.Answers)
		for _, question := range pending.questions {
			values := submitted[question.ID]
			if len(values) == 0 {
				return codexApprovalReply{}, fmt.Errorf("answer is required for question %s", question.ID)
			}
			answers[question.ID] = map[string]any{"answers": values}
		}
		return codexApprovalReply{result: map[string]any{"answers": answers}}, nil
	default:
		return codexApprovalReply{}, fmt.Errorf("unsupported codex approval response method: %s", pending.method)
	}
}

func approvalDecision(response ApprovalResponse) string {
	switch {
	case response.Cancelled:
		return "cancel"
	case response.Approved:
		return "accept"
	default:
		return "decline"
	}
}

func answersByQuestionID(answers []ApprovalAnswer) map[string][]string {
	byQuestion := map[string][]string{}
	for _, answer := range answers {
		if answer.QuestionID == "" {
			continue
		}
		byQuestion[answer.QuestionID] = append([]string{}, answer.Answers...)
	}
	return byQuestion
}

func (harness *CodexHarness) registerActive(runID string, client *jsonRPCClient) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	harness.active[runID] = &codexActiveTurn{client: client}
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
		}
	}
}
