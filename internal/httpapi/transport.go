package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/jsonio"
	"setta/internal/orchestrator"
	"setta/internal/workspace"
)

func requireWorkspaceService(response http.ResponseWriter, service WorkspaceService) WorkspaceService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "workspace_service_unavailable", "workspace service is not available")
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

func decodeRequest(response http.ResponseWriter, request *http.Request, target any) bool {
	if err := jsonio.DecodeSingle(request.Body, target); err != nil {
		if errors.Is(err, jsonio.ErrMultipleValues) {
			writeError(response, http.StatusBadRequest, "invalid_json", "request body must contain exactly one JSON value")
			return false
		}
		writeError(response, http.StatusBadRequest, "invalid_json", fmt.Sprintf("request body must be valid JSON: %v", err))
		return false
	}
	return true
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
	if orchestrator.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_workflow_state", err.Error())
		return
	}
	if orchestrator.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeError(response http.ResponseWriter, status int, code string, message string) {
	writeJSON(response, status, ErrorResponse{
		Error: APIError{
			Code:    code,
			Message: message,
		},
	})
}

func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}
