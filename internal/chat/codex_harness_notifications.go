package chat

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

var codexOutputStreams = map[string]struct{}{
	"stderr": {},
	"stdout": {},
}

var codexHookStatuses = map[string]RunItemStatus{
	"blocked":   RunItemStatusFailed,
	"completed": RunItemStatusCompleted,
	"failed":    RunItemStatusFailed,
	"running":   RunItemStatusRunning,
	"stopped":   RunItemStatusCancelled,
}

var codexGuardianReviewStatuses = map[string]RunItemStatus{
	"aborted":    RunItemStatusCancelled,
	"approved":   RunItemStatusCompleted,
	"denied":     RunItemStatusCancelled,
	"inProgress": RunItemStatusRunning,
	"timedOut":   RunItemStatusFailed,
}

type codexProcessExitEvent struct {
	processID string
	exitCode  int
	stdout    string
	stderr    string
}

type codexBase64OutputDelta struct {
	deltaBase64 string
	stream      string
}

func handleCodexCommandExecOutputDelta(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeCommandExecOutputDeltaNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	delta, err := codexBase64OutputDeltaFromCommandExec(params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return handleCodexBase64OutputDelta(delta, "command_exec_"+params.ProcessId, params.ProcessId, "codex command exec output delta", RunItemTypeCommandExecution, "Command execution", sink)
}

func handleCodexProcessOutputDelta(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeProcessOutputDeltaNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	delta, err := codexBase64OutputDeltaFromProcess(params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return handleCodexBase64OutputDelta(delta, "process_"+params.ProcessHandle, params.ProcessHandle, "codex process output delta", RunItemTypeCommandExecution, "Process output", sink)
}

func codexBase64OutputDeltaFromCommandExec(params codexapp.CommandExecOutputDeltaNotification) (codexBase64OutputDelta, error) {
	stream, err := codexOutputStreamFromRaw(params.Stream, "codex command exec output delta")
	if err != nil {
		return codexBase64OutputDelta{}, err
	}
	return codexBase64OutputDelta{deltaBase64: params.DeltaBase64, stream: stream}, nil
}

func codexBase64OutputDeltaFromProcess(params codexapp.ProcessOutputDeltaNotification) (codexBase64OutputDelta, error) {
	stream, err := codexOutputStreamFromRaw(params.Stream, "codex process output delta")
	if err != nil {
		return codexBase64OutputDelta{}, err
	}
	return codexBase64OutputDelta{deltaBase64: params.DeltaBase64, stream: stream}, nil
}

func codexOutputStreamFromRaw(raw json.RawMessage, label string) (string, error) {
	var stream string
	if err := json.Unmarshal(raw, &stream); err != nil {
		return "", fmt.Errorf("%s.stream must be a string: %w", label, err)
	}
	if _, ok := codexOutputStreams[stream]; !ok {
		return "", fmt.Errorf("unsupported codex output stream: %s", stream)
	}
	return stream, nil
}

func handleCodexBase64OutputDelta(delta codexBase64OutputDelta, providerItemID string, processID string, label string, itemType RunItemType, title string, sink TurnSink) (codexNotificationResult, error) {
	data, err := base64.StdEncoding.DecodeString(delta.deltaBase64)
	if err != nil {
		return codexNotificationResult{}, fmt.Errorf("%s.deltaBase64 must be base64: %w", label, err)
	}
	if err := sink.RunItemUpsert(RunItem{
		ProviderItemID: providerItemID,
		Type:           itemType,
		Status:         RunItemStatusRunning,
		Title:          title,
		ProcessID:      processID,
	}); err != nil {
		return codexNotificationResult{}, err
	}
	if len(data) == 0 {
		return codexNotificationResult{}, nil
	}
	return codexNotificationResult{}, sink.RunItemOutputDelta(providerItemID, delta.stream, string(data))
}

func handleCodexProcessExited(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	event, err := codexProcessExitEventFromMessage(message)
	if err != nil {
		return codexNotificationResult{}, err
	}
	providerItemID := "process_" + event.processID
	if err := sink.RunItemUpsert(processExitRunItem(providerItemID, event)); err != nil {
		return codexNotificationResult{}, err
	}
	if err := emitProcessExitOutputs(sink, providerItemID, event.stdout, event.stderr); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, nil
}

func codexProcessExitEventFromMessage(message jsonRPCMessage) (codexProcessExitEvent, error) {
	params, err := codexapp.DecodeProcessExitedNotification(message.Params)
	if err != nil {
		return codexProcessExitEvent{}, err
	}
	return codexProcessExitEvent{
		processID: params.ProcessHandle,
		exitCode:  params.ExitCode,
		stdout:    params.Stdout,
		stderr:    params.Stderr,
	}, nil
}

func processExitRunItem(providerItemID string, event codexProcessExitEvent) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeCommandExecution,
		Status:         processExitStatus(event.exitCode),
		Title:          "Process exited",
		ProcessID:      event.processID,
		ExitCode:       event.exitCode,
	}
}

func processExitStatus(exitCode int) RunItemStatus {
	if exitCode != 0 {
		return RunItemStatusFailed
	}
	return RunItemStatusCompleted
}

func emitProcessExitOutputs(sink TurnSink, providerItemID string, stdout string, stderr string) error {
	if stdout != "" {
		if err := sink.RunItemOutputDelta(providerItemID, "stdout", stdout); err != nil {
			return err
		}
	}
	if stderr != "" {
		if err := sink.RunItemOutputDelta(providerItemID, "stderr", stderr); err != nil {
			return err
		}
	}
	return nil
}

func handleCodexReasoningTextDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeReasoningTextDeltaNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, params.ThreadID, params.TurnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if params.Delta == "" {
		return codexNotificationResult{}, nil
	}
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: params.ItemId,
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusRunning,
		HiddenText:     params.Delta,
	})
}

func handleCodexHookStarted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexHookNotification(message, threadID, turnID, sink)
}

func handleCodexHookCompleted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexHookNotification(message, threadID, turnID, sink)
}

func handleCodexHookNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex hook params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := validateCodexThreadRequestWithOptionalTurn(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	run, err := requireObject(params, "run", "codex hook")
	if err != nil {
		return codexNotificationResult{}, err
	}
	item, err := codexHookRunItem(run)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.RunItemUpsert(item)
}

func codexHookRunItem(run map[string]any) (RunItem, error) {
	id, err := requireString(run, "id", "codex hook run")
	if err != nil {
		return RunItem{}, err
	}
	eventName, err := requireString(run, "eventName", "codex hook run")
	if err != nil {
		return RunItem{}, err
	}
	statusText, err := requireString(run, "status", "codex hook run")
	if err != nil {
		return RunItem{}, err
	}
	status, ok := codexHookStatuses[statusText]
	if !ok {
		return RunItem{}, fmt.Errorf("unsupported codex hook status: %s", statusText)
	}
	statusMessage, err := optionalString(run, "statusMessage", "codex hook run")
	if err != nil {
		return RunItem{}, err
	}
	durationMs, err := optionalInt(run, "durationMs", "codex hook run")
	if err != nil {
		return RunItem{}, err
	}
	details, err := rawJSON(run, "codex hook run")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: "hook_" + id,
		Type:           RunItemTypeHook,
		Status:         status,
		Title:          "Hook: " + eventName,
		Summary:        hookSummary(statusText, statusMessage),
		DurationMs:     durationMs,
		Details:        details,
	}, nil
}

func handleCodexAutoApprovalReviewStarted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexAutoApprovalReviewNotification(message, threadID, turnID, sink)
}

func handleCodexAutoApprovalReviewCompleted(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	return handleCodexAutoApprovalReviewNotification(message, threadID, turnID, sink)
}

func handleCodexAutoApprovalReviewNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex auto approval review params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	reviewID, err := requireString(params, "reviewId", "codex auto approval review")
	if err != nil {
		return codexNotificationResult{}, err
	}
	review, err := requireObject(params, "review", "codex auto approval review")
	if err != nil {
		return codexNotificationResult{}, err
	}
	statusText, err := requireString(review, "status", "codex auto approval review review")
	if err != nil {
		return codexNotificationResult{}, err
	}
	status, ok := codexGuardianReviewStatuses[statusText]
	if !ok {
		return codexNotificationResult{}, fmt.Errorf("unsupported codex auto approval review status: %s", statusText)
	}
	action, err := requireObject(params, "action", "codex auto approval review")
	if err != nil {
		return codexNotificationResult{}, err
	}
	actionType, err := requireString(action, "type", "codex auto approval review action")
	if err != nil {
		return codexNotificationResult{}, err
	}
	details, err := rawJSON(params, "codex auto approval review")
	if err != nil {
		return codexNotificationResult{}, err
	}
	summary := "Auto-review " + statusText + " for " + actionType
	return codexNotificationResult{}, sink.RunItemUpsert(RunItem{
		ProviderItemID: "approval_review_" + reviewID,
		Type:           RunItemTypeApprovalReview,
		Status:         status,
		Title:          "Auto-approval review",
		Summary:        summary,
		ReviewID:       reviewID,
		Details:        details,
	})
}

func handleCodexServerRequestResolvedNotification(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex server request resolved params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex server request resolved")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requestIDString(params["requestId"]); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, nil
}

func handleCodexTraceOnlyNotification(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	return codexNotificationResult{}, sink.Trace(codexTraceEventName(message.Method), boundedJSON(message.Params, 1024))
}

func handleCodexAccountLoginCompleted(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex account login completed params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	success, err := requireBool(params, "success", "codex account login completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	errorMessage, err := optionalString(params, "error", "codex account login completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if !success {
		return codexNotificationResult{}, sink.ProviderDiagnostic("codex_account_login_failed", loginFailedMessage(errorMessage), map[string]string{"error": errorMessage}, false, DiagnosticSeverityWarning)
	}
	return codexNotificationResult{}, sink.Trace("codex_account_login_completed", "success")
}

func handleCodexAppListUpdated(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex app list updated params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	data, err := requireArray(params, "data", "codex app list updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_app_list_updated", fmt.Sprintf("%d apps", len(data)))
}

func handleCodexFSChanged(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex fs changed params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	watchID, err := requireString(params, "watchId", "codex fs changed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	paths, err := requireStringArray(params, "changedPaths", "codex fs changed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_fs_changed", fmt.Sprintf("%s %d paths", watchID, len(paths)))
}

func handleCodexFuzzyFileSearchSessionUpdated(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex fuzzy file search updated params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	sessionID, err := requireString(params, "sessionId", "codex fuzzy file search updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	query, err := requireStringAllowEmpty(params, "query", "codex fuzzy file search updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	files, err := requireArray(params, "files", "codex fuzzy file search updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_fuzzy_file_search_updated", fmt.Sprintf("%s %q %d files", sessionID, query, len(files)))
}

func handleCodexFuzzyFileSearchSessionCompleted(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex fuzzy file search completed params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	sessionID, err := requireString(params, "sessionId", "codex fuzzy file search completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_fuzzy_file_search_completed", sessionID)
}

func handleCodexMCPServerOAuthLoginCompleted(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex mcp oauth login completed params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	name, err := requireString(params, "name", "codex mcp oauth login completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	success, err := requireBool(params, "success", "codex mcp oauth login completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	errorMessage, err := optionalString(params, "error", "codex mcp oauth login completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if !success {
		return codexNotificationResult{}, sink.ProviderDiagnostic("codex_mcp_oauth_login_failed", loginFailedMessage(errorMessage), map[string]string{"serverName": name, "error": errorMessage}, false, DiagnosticSeverityWarning)
	}
	return codexNotificationResult{}, sink.Trace("codex_mcp_oauth_login_completed", name)
}

func handleCodexModelVerification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex model verification params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnMatch(message, params, threadID, turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	verifications, err := requireStringArray(params, "verifications", "codex model verification")
	if err != nil {
		return codexNotificationResult{}, err
	}
	for _, verification := range verifications {
		if verification != "trustedAccessForCyber" {
			return codexNotificationResult{}, fmt.Errorf("unsupported codex model verification: %s", verification)
		}
	}
	return codexNotificationResult{}, sink.Trace("codex_model_verification", strings.Join(verifications, ","))
}

func handleCodexSkillsChanged(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	if len(message.Params) > 0 {
		if _, err := objectValue(message.Params, "codex skills changed params"); err != nil {
			return codexNotificationResult{}, err
		}
	}
	return codexNotificationResult{}, sink.Trace("codex_skills_changed", "skills changed")
}

func handleCodexWindowsWorldWritableWarning(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex windows world writable warning params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	paths, err := requireStringArray(params, "samplePaths", "codex windows world writable warning")
	if err != nil {
		return codexNotificationResult{}, err
	}
	extraCount, err := requireInt(params, "extraCount", "codex windows world writable warning")
	if err != nil {
		return codexNotificationResult{}, err
	}
	failedScan, err := requireBool(params, "failedScan", "codex windows world writable warning")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.ProviderDiagnostic("codex_windows_world_writable_warning", "Codex reported world-writable Windows paths", map[string]string{
		"extraCount":  fmt.Sprintf("%d", extraCount),
		"failedScan":  fmt.Sprintf("%t", failedScan),
		"samplePaths": strings.Join(paths, "\n"),
	}, false, DiagnosticSeverityWarning)
}

func handleCodexWindowsSandboxSetupCompleted(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex windows sandbox setup completed params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	mode, err := requireString(params, "mode", "codex windows sandbox setup completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if mode != "elevated" && mode != "unelevated" {
		return codexNotificationResult{}, fmt.Errorf("unsupported codex windows sandbox setup mode: %s", mode)
	}
	success, err := requireBool(params, "success", "codex windows sandbox setup completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	errorMessage, err := optionalString(params, "error", "codex windows sandbox setup completed")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if !success {
		return codexNotificationResult{}, sink.ProviderDiagnostic("codex_windows_sandbox_setup_failed", loginFailedMessage(errorMessage), map[string]string{"mode": mode, "error": errorMessage}, false, DiagnosticSeverityWarning)
	}
	return codexNotificationResult{}, sink.Trace("codex_windows_sandbox_setup_completed", mode)
}

func handleCodexRealtimeIgnored(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex realtime params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex realtime")
	if err != nil {
		return codexNotificationResult{}, err
	}
	context := map[string]string{"threadId": messageThreadID, "method": message.Method}
	if messageThreadID != threadID {
		context["expectedThreadId"] = threadID
	}
	if message.Method == codexapp.CodexNotificationThreadRealtimeError {
		errorMessage, err := requireString(params, "message", "codex realtime error")
		if err != nil {
			return codexNotificationResult{}, err
		}
		context["error"] = errorMessage
	}
	return codexNotificationResult{}, sink.ProviderDiagnostic("codex_realtime_notification_ignored", "Codex realtime notification ignored because realtime is not enabled in Setta", context, false, DiagnosticSeverityWarning)
}

func requireInt(value map[string]any, name string, label string) (int, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return 0, fmt.Errorf("%s.%s is required", label, name)
	}
	number, ok := raw.(float64)
	if !ok {
		return 0, fmt.Errorf("%s.%s must be a number", label, name)
	}
	if number != float64(int(number)) {
		return 0, fmt.Errorf("%s.%s must be an integer", label, name)
	}
	return int(number), nil
}

func requireArray(value map[string]any, name string, label string) ([]any, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%s.%s is required", label, name)
	}
	values, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an array", label, name)
	}
	return values, nil
}

func hookSummary(status string, statusMessage string) string {
	if statusMessage == "" {
		return status
	}
	return status + ": " + statusMessage
}

func codexTraceEventName(method string) string {
	replacer := strings.NewReplacer("/", "_", "-", "_")
	return "codex_" + replacer.Replace(method)
}

func loginFailedMessage(message string) string {
	if message == "" {
		return "Codex reported a failed provider operation"
	}
	return message
}
