package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/conversation"
	"setta/internal/jsonio"
	"setta/internal/master"
	"setta/internal/narration"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/speech"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspaceui"
)

func requireWorkspaceService(response http.ResponseWriter, service WorkspaceService) WorkspaceService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "workspace_service_unavailable", "workspace service is not available")
		return nil
	}
	return service
}

func requireWorkspaceUIService(response http.ResponseWriter, service WorkspaceUIService) WorkspaceUIService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "workspace_ui_service_unavailable", "workspace UI service is not available")
		return nil
	}
	return service
}

func requireWorkspaceActivityService(response http.ResponseWriter, service WorkspaceActivityService) WorkspaceActivityService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "workspace_activity_service_unavailable", "workspace activity service is not available")
		return nil
	}
	return service
}

func requireAppearanceService(response http.ResponseWriter, service AppearanceService) AppearanceService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "appearance_service_unavailable", "appearance service is not available")
		return nil
	}
	return service
}

func requireChatService(response http.ResponseWriter, service ChatService) ChatService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "chat_service_unavailable", "chat service is not available")
		return nil
	}
	return service
}

func requireConversationService(response http.ResponseWriter, service ConversationService) ConversationService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "conversation_service_unavailable", "conversation service is not available")
		return nil
	}
	return service
}

func requireConversationInputService(
	response http.ResponseWriter,
	service ConversationInputService,
) ConversationInputService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "conversation_input_service_unavailable", "conversation input service is not available")
		return nil
	}
	return service
}

func requireConversationNavigatorService(
	response http.ResponseWriter,
	service ConversationNavigatorService,
) ConversationNavigatorService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "conversation_navigator_service_unavailable", "conversation navigator service is not available")
		return nil
	}
	return service
}

func requireNarratorStatusService(
	response http.ResponseWriter,
	service NarratorStatusService,
) NarratorStatusService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "narrator_status_service_unavailable", "narrator status service is not available")
		return nil
	}
	return service
}

func requireMasterInputService(
	response http.ResponseWriter,
	service MasterInputService,
) MasterInputService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "master_input_service_unavailable", "master input service is not available")
		return nil
	}
	return service
}

func requireSpeechService(response http.ResponseWriter, service SpeechService) SpeechService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "speech_service_unavailable", "speech service is not available")
		return nil
	}
	return service
}

func requireCodexAccountService(response http.ResponseWriter, service CodexAccountService) CodexAccountService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "codex_account_service_unavailable", "Codex account service is not available")
		return nil
	}
	return service
}

func requireWorkflowService(response http.ResponseWriter, service WorkflowService) WorkflowService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "workflow_service_unavailable", "workflow service is not available")
		return nil
	}
	return service
}

func requireSemanticGraphService(response http.ResponseWriter, service SemanticGraphService) SemanticGraphService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "semantic_graph_service_unavailable", "semantic graph service is not available")
		return nil
	}
	return service
}

func requireTerminalService(response http.ResponseWriter, service TerminalService) TerminalService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "terminal_service_unavailable", "terminal service is not available")
		return nil
	}
	return service
}

func requireRuntimeAuthService(response http.ResponseWriter, service RuntimeAuthService) RuntimeAuthService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "runtime_auth_service_unavailable", "runtime auth service is not available")
		return nil
	}
	return service
}

func requireNotifyService(response http.ResponseWriter, service NotifyService) NotifyService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "notify_service_unavailable", "notify service is not available")
		return nil
	}
	return service
}

func decodeRequest(response http.ResponseWriter, request *http.Request, target any) bool {
	if err := jsonio.DecodeSingle(request.Body, target); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeRequestBodyTooLarge(response, maxBytesError.Limit)
			return false
		}
		if errors.Is(err, jsonio.ErrMultipleValues) {
			writeError(response, http.StatusBadRequest, "invalid_json", "request body must contain exactly one JSON value")
			return false
		}
		writeError(response, http.StatusBadRequest, "invalid_json", fmt.Sprintf("request body must be valid JSON: %v", err))
		return false
	}
	return true
}

func enforceRequestBodyLimit(response http.ResponseWriter, request *http.Request, limitBytes int64) bool {
	if limitBytes <= 0 || request.Method != http.MethodPost {
		return true
	}
	if request.ContentLength > limitBytes {
		writeRequestBodyTooLarge(response, limitBytes)
		return false
	}
	request.Body = http.MaxBytesReader(response, request.Body, limitBytes)
	return true
}

func writeRequestBodyTooLarge(response http.ResponseWriter, limitBytes int64) {
	writeError(response, http.StatusRequestEntityTooLarge, "request_body_too_large", fmt.Sprintf("request body exceeds %d bytes", limitBytes))
}

func writeWorkspaceError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if appstate.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_app_state", err.Error())
		return
	}
	if workspace.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_workspace_state", err.Error())
		return
	}
	if appstate.IsPersistenceError(err) || workspace.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeWorkspaceUIError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if workspaceui.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_workspace_ui_state", err.Error())
		return
	}
	if workspaceui.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeAppearanceError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if appearance.IsCorruptSettingsError(err) {
		writeError(response, status, code, err.Error())
		return
	}
	if appearance.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeChatError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if commandErr, ok := chat.IsChatCommandError(err); ok {
		writeError(response, status, string(commandErr.Code), commandErr.Error())
		return
	}
	if operationErr, ok := chat.IsChatOperationError(err); ok {
		writeError(response, http.StatusConflict, string(operationErr.Code), operationErr.Error())
		return
	}
	if chat.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_chat_state", err.Error())
		return
	}
	if chat.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeConversationError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if conversation.IsConversationNotFound(err) {
		writeError(response, http.StatusNotFound, "conversation_not_found", err.Error())
		return
	}
	if conversation.IsCommandConflict(err) {
		status = http.StatusConflict
	}
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_conversation_state", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeConversationInputError(response http.ResponseWriter, err error) {
	if conversation.IsConversationInputConflict(err) {
		writeError(response, http.StatusConflict, "conversation_input_conflict", err.Error())
		return
	}
	if conversation.IsConversationNotFound(err) {
		writeError(response, http.StatusNotFound, "conversation_not_found", err.Error())
		return
	}
	if conversation.IsStateConflict(err) {
		writeError(response, http.StatusConflict, "conversation_input_state_conflict", err.Error())
		return
	}
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_conversation_input_state", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		writeError(response, http.StatusInternalServerError, "persist_conversation_input_failed", err.Error())
		return
	}
	writeError(response, http.StatusBadRequest, "invalid_conversation_input", err.Error())
}

func writeNarratorStatusError(response http.ResponseWriter, err error) {
	var degraded *narration.DegradedError
	if errors.As(err, &degraded) {
		writeError(response, http.StatusServiceUnavailable, "narrator_status_unavailable", degraded.Error())
		return
	}
	writeConversationError(response, "ask_topic_conversation_narrator_status_failed", err)
}

func writeMasterInputError(response http.ResponseWriter, err error) {
	if master.IsInputConflict(err) {
		writeError(response, http.StatusConflict, "master_input_conflict", err.Error())
		return
	}
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_master_input_state", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		writeError(response, http.StatusInternalServerError, "persist_master_input_failed", err.Error())
		return
	}
	writeError(response, http.StatusBadRequest, "invalid_master_input", err.Error())
}

func writeSpeechError(response http.ResponseWriter, fallbackCode string, err error) {
	if speechError, ok := speech.AsError(err); ok {
		writeError(response, speechErrorHTTPStatus(speechError.Code), string(speechError.Code), speechError.Error())
		return
	}
	writeError(response, http.StatusBadRequest, fallbackCode, err.Error())
}

func writeSpeechVoiceConfigurationError(response http.ResponseWriter, err error) {
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_speech_voice_configuration", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		writeError(response, http.StatusInternalServerError, "read_speech_voice_configuration_failed", err.Error())
		return
	}
	writeSpeechError(response, "invalid_speech_voice_configuration", err)
}

func speechErrorHTTPStatus(code speech.ErrorCode) int {
	switch code {
	case speech.ErrorRateLimited:
		return http.StatusTooManyRequests
	case speech.ErrorProviderRejected, speech.ErrorProviderResponseMalformed, speech.ErrorAudioTooLarge:
		return http.StatusBadGateway
	case speech.ErrorNotConfigured, speech.ErrorProviderUnavailable:
		return http.StatusServiceUnavailable
	case speech.ErrorSourceUnavailable:
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

func writeCodexAccountError(response http.ResponseWriter, code string, err error) {
	writeError(response, http.StatusBadRequest, code, err.Error())
}

func writeWorkflowError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	var validationErr *orchestrator.ValidationError
	if errors.As(err, &validationErr) {
		writeError(response, status, "workflow_validation_failed", validationErr.Error())
		return
	}
	if conflict, ok := orchestrator.IsWorkflowExecutionAlreadyRunning(err); ok {
		activeExecution := conflict.ActiveExecution
		writeAPIError(response, http.StatusConflict, APIError{
			Code:            orchestrator.WorkflowExecutionAlreadyRunningCode,
			Message:         conflict.Error(),
			ActiveExecution: &activeExecution,
		})
		return
	}
	if orchestrator.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_workflow_state", err.Error())
		return
	}
	if orchestrator.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeSemanticGraphError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if semanticgraph.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_semantic_graph_state", err.Error())
		return
	}
	if semanticgraph.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeTerminalError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	var unsupported terminal.UnsupportedPlatformError
	if errors.As(err, &unsupported) {
		writeError(response, http.StatusNotImplemented, "terminal_unsupported", unsupported.Error())
		return
	}
	if terminal.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_terminal_state", err.Error())
		return
	}
	if terminal.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeError(response http.ResponseWriter, status int, code string, message string) {
	writeAPIError(response, status, APIError{
		Code:    code,
		Message: message,
	})
}

func writeAPIError(response http.ResponseWriter, status int, apiError APIError) {
	writeJSON(response, status, ErrorResponse{
		Error: apiError,
	})
}

func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}
