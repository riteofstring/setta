package chat

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

const codexCommandExecutionOutputStream = "output"

type codexNotificationResult struct {
	CodexEffectiveSettings *codexCommandThreadSettings
	Completion             TurnCompletion
	TurnID                 string
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
	codexapp.CodexNotificationTurnModerationMetadata:                  handleCodexTurnModerationMetadata,
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

func handleCodexTurnModerationMetadata(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeTurnModerationMetadataNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, params.ThreadID, params.TurnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_turn_moderation_metadata", fmt.Sprintf("%d metadata bytes", len(params.Metadata)))
}

func handleCodexThreadStarted(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeThreadStartedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.Thread.ID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_started", params.Thread.ID)
}

func handleCodexThreadStatusChanged(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeThreadStatusChangedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.ThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	status, err := objectValue(params.Status, "codex thread status changed status")
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
	params, err := codexapp.DecodeThreadTokenUsageUpdatedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.ThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	traceTurnID := params.TurnID
	if traceTurnID == "" {
		traceTurnID = turnID
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_token_usage_updated", traceTurnID)
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
	return boundedTextPreview(value, limit, "...<truncated>")
}

func handleCodexAssistantDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeAgentMessageDeltaNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, params.ThreadID, params.TurnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if params.Delta == "" {
		return codexNotificationResult{}, nil
	}
	return codexNotificationResult{}, sink.AssistantTextDelta(params.ItemId, params.Delta)
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
	params, err := decodeCodexItemNotification(message)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, params.threadID, params.turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	item, err := objectValue(params.item, "codex item")
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

type codexItemNotification struct {
	item     json.RawMessage
	threadID string
	turnID   string
}

func decodeCodexItemNotification(message jsonRPCMessage) (codexItemNotification, error) {
	switch message.Method {
	case codexapp.CodexNotificationItemStarted:
		params, err := codexapp.DecodeItemStartedNotification(message.Params)
		if err != nil {
			return codexItemNotification{}, err
		}
		return codexItemNotification{item: params.Item, threadID: params.ThreadID, turnID: params.TurnID}, nil
	case codexapp.CodexNotificationItemCompleted:
		params, err := codexapp.DecodeItemCompletedNotification(message.Params)
		if err != nil {
			return codexItemNotification{}, err
		}
		return codexItemNotification{item: params.Item, threadID: params.ThreadID, turnID: params.TurnID}, nil
	default:
		return codexItemNotification{}, fmt.Errorf("unsupported codex item notification: %s", message.Method)
	}
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
	params, err := decodeCodexTextActivityDelta(message, itemType)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, params.threadID, params.turnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if params.delta == "" {
		return codexNotificationResult{}, nil
	}
	return codexNotificationResult{}, sink.RunItemUpsert(textActivityRunItem(params.itemID, itemType, title, params.delta))
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

type codexTextActivityDelta struct {
	delta    string
	itemID   string
	threadID string
	turnID   string
}

func decodeCodexTextActivityDelta(message jsonRPCMessage, itemType RunItemType) (codexTextActivityDelta, error) {
	switch message.Method {
	case codexapp.CodexNotificationItemPlanDelta:
		params, err := codexapp.DecodePlanDeltaNotification(message.Params)
		if err != nil {
			return codexTextActivityDelta{}, err
		}
		return codexTextActivityDelta{delta: params.Delta, itemID: params.ItemId, threadID: params.ThreadID, turnID: params.TurnID}, nil
	case codexapp.CodexNotificationItemReasoningSummaryTextDelta:
		params, err := codexapp.DecodeReasoningSummaryTextDeltaNotification(message.Params)
		if err != nil {
			return codexTextActivityDelta{}, err
		}
		return codexTextActivityDelta{delta: params.Delta, itemID: params.ItemId, threadID: params.ThreadID, turnID: params.TurnID}, nil
	case codexapp.CodexNotificationItemReasoningTextDelta:
		params, err := codexapp.DecodeReasoningTextDeltaNotification(message.Params)
		if err != nil {
			return codexTextActivityDelta{}, err
		}
		return codexTextActivityDelta{delta: params.Delta, itemID: params.ItemId, threadID: params.ThreadID, turnID: params.TurnID}, nil
	default:
		return codexTextActivityDelta{}, fmt.Errorf("unsupported codex %s text activity delta notification: %s", itemType, message.Method)
	}
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
	params, err := codexapp.DecodeCommandExecutionOutputDeltaNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexTurnIDMatch(message, threadID, turnID, params.ThreadID, params.TurnID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if params.Delta == "" {
		return codexNotificationResult{}, nil
	}
	return codexNotificationResult{}, sink.RunItemOutputDelta(params.ItemId, codexCommandExecutionOutputStream, params.Delta)
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
