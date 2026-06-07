package httpapi

import (
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
	page, err := service.LoadMessagePage(payload.WorkspaceID, payload.ConversationID, payload.BeforeOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "get_message_page_failed", err)
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
	result, err := service.SendUserMessage(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
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
	result, err := service.QueueUserMessage(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
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
	result, err := service.EditQueuedMessage(payload.WorkspaceID, payload.ConversationID, payload.MessageID, payload.Prompt)
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
	result, err := service.SteerActiveRun(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
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
	result, err := service.SendSteeringImmediately(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
	if err != nil {
		writeChatError(response, "send_steering_immediately_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
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
	run, ok, err := service.ActiveRun(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "get_active_run_failed", err)
		return
	}
	var activeRun *chat.Run
	if ok {
		activeRun = &run
	}
	writeJSON(response, http.StatusOK, GetActiveRunResponse{HasActiveRun: ok, Run: activeRun})
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
