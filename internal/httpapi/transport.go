package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/easyrun"
	"setta/internal/jsonio"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
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

func requireEasyRunService(response http.ResponseWriter, service EasyRunService) EasyRunService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "easy_run_service_unavailable", "easy-run service is not available")
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

func writeEasyRunError(response http.ResponseWriter, code string, err error) {
	if easyrun.IsAcceptedSteeringFocusUpdateError(err) {
		writeAPIError(response, http.StatusInternalServerError, APIError{
			Code:             code,
			Message:          err.Error(),
			OperationApplied: true,
		})
		return
	}
	status := http.StatusBadRequest
	if easyrun.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_easy_run_state", err.Error())
		return
	}
	if easyrun.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
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
