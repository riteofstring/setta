package httpapi

import (
	"encoding/base64"
	"fmt"
	"net/http"

	"setta/internal/chat"
)

func (handler handler) listConversations(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListConversationsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if _, err := service.ReconcileActiveRuns(request.Context(), payload.WorkspaceID, "", chat.RunLivenessReasonSnapshotLoad); err != nil {
		writeChatError(response, "list_conversations_reconcile_failed", err)
		return
	}
	result, err := service.ListConversations(payload.WorkspaceID)
	if err != nil {
		writeChatError(response, "list_conversations_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListConversationsResponse{
		Conversations: result.Conversations,
		Corruption:    result.Corruption,
		Diagnostics:   result.Diagnostics,
	})
}

func (handler handler) createConversation(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload CreateConversationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	conversation, err := service.CreateConversation(payload.WorkspaceID, payload.Title)
	if err != nil {
		writeChatError(response, "create_conversation_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, conversation)
}

func (handler handler) readChatCodexDefaults(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	result, err := service.ReadChatCodexDefaults(request.Context())
	if err != nil {
		writeChatError(response, "read_chat_codex_defaults_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) updateChatCodexDefaults(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload UpdateChatCodexDefaultsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.UpdateChatCodexDefaults(request.Context(), payload.Settings, payload.Confirmed)
	if err != nil {
		writeChatError(response, "update_chat_codex_defaults_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) deleteConversation(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload DeleteConversationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.DeleteConversation(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "delete_conversation_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListConversationsResponse{
		Conversations: result.Conversations,
		Corruption:    result.Corruption,
		Diagnostics:   result.Diagnostics,
	})
}

func (handler handler) markConversationRead(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload MarkConversationReadRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	item, err := service.MarkConversationRead(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "mark_conversation_read_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (handler handler) setConversationPinned(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SetConversationPinnedRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	item, err := service.SetConversationPinned(payload.WorkspaceID, payload.ConversationID, payload.Pinned)
	if err != nil {
		writeChatError(response, "set_conversation_pinned_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (handler handler) getMessagePage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetMessagePageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadMessagePage(payload.WorkspaceID, payload.ConversationID, payload.BeforeBlockOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "get_message_page_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) listComposerPromptHistory(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListComposerPromptHistoryRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadComposerPromptHistory(payload.WorkspaceID, payload.ConversationID, payload.BeforeOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "list_composer_prompt_history_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) sendChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SendChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SendUserInput(payload.WorkspaceID, payload.ConversationID, payload.Input)
	if err != nil {
		writeChatError(response, "send_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) queueChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload QueueChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.QueueUserInput(payload.WorkspaceID, payload.ConversationID, payload.Input)
	if err != nil {
		writeChatError(response, "queue_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) editQueuedChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload EditQueuedChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.EditQueuedInput(payload.WorkspaceID, payload.ConversationID, payload.MessageID, payload.Input)
	if err != nil {
		writeChatError(response, "edit_queued_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) removeQueuedChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload RemoveQueuedChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.RemoveQueuedMessage(payload.WorkspaceID, payload.ConversationID, payload.MessageID)
	if err != nil {
		writeChatError(response, "remove_queued_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) steerChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SteerChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SteerActiveRunInput(payload.WorkspaceID, payload.ConversationID, payload.Input)
	if err != nil {
		writeChatError(response, "steer_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) sendSteeringImmediately(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SendSteeringImmediatelyRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SendSteeringInputImmediately(payload.WorkspaceID, payload.ConversationID, payload.Input)
	if err != nil {
		writeChatError(response, "send_steering_immediately_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) createChatImageAttachmentFromBytes(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload CreateChatImageAttachmentFromBytesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	data, ok := decodeChatImageAttachmentBytes(response, payload.DataBase64)
	if !ok {
		return
	}
	attachment, err := service.CreateImageAttachmentFromBytes(payload.WorkspaceID, payload.ConversationID, payload.FileName, data)
	if err != nil {
		writeChatError(response, "create_chat_image_attachment_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, attachment)
}

func decodeChatImageAttachmentBytes(response http.ResponseWriter, dataBase64 string) ([]byte, bool) {
	if base64.StdEncoding.DecodedLen(len(dataBase64)) > chat.MaxImageAttachmentBytes {
		writeChatImageAttachmentTooLarge(response)
		return nil, false
	}
	data, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_chat_image_attachment_data", "dataBase64 must be valid base64")
		return nil, false
	}
	if len(data) > chat.MaxImageAttachmentBytes {
		writeChatImageAttachmentTooLarge(response)
		return nil, false
	}
	return data, true
}

func writeChatImageAttachmentTooLarge(response http.ResponseWriter) {
	writeError(response, http.StatusBadRequest, "chat_image_attachment_too_large", fmt.Sprintf("image attachment exceeds %d bytes", chat.MaxImageAttachmentBytes))
}

func (handler handler) listChatCommands(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListChatCommandsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ListCommands(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "list_chat_commands_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) executeChatCommand(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ExecuteChatCommandRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ExecuteChatCommandWithOptions(payload.WorkspaceID, payload.ConversationID, payload.Raw, chat.ChatCommandExecutionOptions{
		ConfirmGoalReplacement: payload.ConfirmGoalReplacement,
	})
	if err != nil {
		writeChatError(response, "execute_chat_command_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) openChatCodexModelPicker(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload OpenChatCodexModelPickerRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.OpenChatCodexModelPicker(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "open_chat_codex_model_picker_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) openChatCodexPermissionPicker(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload OpenChatCodexPermissionPickerRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.OpenChatCodexPermissionPicker(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "open_chat_codex_permission_picker_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) setChatCodexModel(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SetChatCodexModelRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SetChatCodexModel(payload.WorkspaceID, payload.ConversationID, payload.ModelID)
	if err != nil {
		writeChatError(response, "set_chat_codex_model_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) setChatCodexPermissionPreset(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SetChatCodexPermissionPresetRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SetChatCodexPermissionPreset(payload.WorkspaceID, payload.ConversationID, payload.Preset, payload.Confirmed)
	if err != nil {
		writeChatError(response, "set_chat_codex_permission_preset_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) setChatCodexReasoningEffort(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SetChatCodexReasoningEffortRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SetChatCodexReasoningEffort(payload.WorkspaceID, payload.ConversationID, payload.ReasoningEffort)
	if err != nil {
		writeChatError(response, "set_chat_codex_reasoning_effort_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) cancelRun(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload CancelRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, err := service.CancelActiveRun(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "cancel_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, run)
}

func (handler handler) getActiveRun(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetActiveRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if _, err := service.ReconcileActiveRuns(request.Context(), payload.WorkspaceID, payload.ConversationID, chat.RunLivenessReasonSnapshotLoad); err != nil {
		writeChatError(response, "get_active_run_reconcile_failed", err)
		return
	}
	run, liveness, ok, err := service.ActiveRunWithLiveness(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "get_active_run_failed", err)
		return
	}
	var activeRun *chat.Run
	if ok {
		activeRun = &run
	}
	writeJSON(response, http.StatusOK, GetActiveRunResponse{HasActiveRun: ok, Run: activeRun, Liveness: liveness})
}

func (handler handler) reconcileChatRuns(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ReconcileChatRunsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ReconcileActiveRuns(request.Context(), payload.WorkspaceID, payload.ConversationID, payload.Reason)
	if err != nil {
		writeChatError(response, "reconcile_chat_runs_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ReconcileChatRunsResponse{Result: result})
}

func (handler handler) listRuns(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListRunsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	runs, err := service.ListRuns(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "list_runs_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListRunsResponse{Runs: runs})
}

func (handler handler) getRunActivity(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetRunActivityRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadRunActivityPage(payload.WorkspaceID, payload.RunID, payload.Limit)
	if err != nil {
		writeChatError(response, "get_run_activity_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) getRunItemOutput(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetRunItemOutputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadRunItemOutputPage(payload.WorkspaceID, payload.RunID, payload.RunItemID, payload.AfterOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "get_run_item_output_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) listBackgroundTerminals(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListBackgroundTerminalsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.ListBackgroundTerminals(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "list_background_terminals_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) getBackgroundTerminalOutput(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetBackgroundTerminalOutputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadBackgroundTerminalOutputPage(payload.WorkspaceID, payload.ConversationID, payload.ProcessID, payload.AfterOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "get_background_terminal_output_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) killBackgroundTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload KillBackgroundTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	process, err := service.KillBackgroundTerminal(request.Context(), payload.WorkspaceID, payload.ConversationID, payload.ProcessID)
	if err != nil {
		writeChatError(response, "kill_background_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, process)
}

func (handler handler) killAllBackgroundTerminals(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload KillAllBackgroundTerminalsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.KillAllBackgroundTerminals(request.Context(), payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "kill_all_background_terminals_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) listDiagnostics(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListDiagnosticsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	diagnostics, err := service.ListDiagnostics(payload.WorkspaceID, payload.ConversationID, payload.RunID)
	if err != nil {
		writeChatError(response, "list_diagnostics_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListDiagnosticsResponse{Diagnostics: diagnostics})
}

func (handler handler) submitApproval(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SubmitApprovalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, err := service.SubmitApproval(payload.WorkspaceID, payload.ConversationID, payload.ApprovalID, payload.Approved, payload.Response, payload.Answers, payload.Cancelled)
	if err != nil {
		writeChatError(response, "submit_approval_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, run)
}
