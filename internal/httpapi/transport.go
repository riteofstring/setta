package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/conversation"
	"setta/internal/jsonio"
	"setta/internal/master"
	"setta/internal/speech"
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

func requireAppearanceService(response http.ResponseWriter, service AppearanceService) AppearanceService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "appearance_service_unavailable", "appearance service is not available")
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

func requireRoleConfigurationService(
	response http.ResponseWriter,
	service RoleConfigurationService,
) RoleConfigurationService {
	if service == nil {
		writeError(
			response,
			http.StatusServiceUnavailable,
			"role_configuration_service_unavailable",
			"role configuration service is not available",
		)
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

func requireRuntimeAuthService(response http.ResponseWriter, service RuntimeAuthService) RuntimeAuthService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "runtime_auth_service_unavailable", "runtime auth service is not available")
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

func writeConversationError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if conversation.IsConversationNotFound(err) {
		writeError(response, http.StatusNotFound, "conversation_not_found", err.Error())
		return
	}
	if conversation.IsArtifactNotFound(err) {
		writeError(response, http.StatusNotFound, "conversation_artifact_not_found", err.Error())
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
	if conversation.IsInvalidConversationInputReceipt(err) {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_input_receipt", err.Error())
		return
	}
	if conversation.IsWriteOutcome(err, conversation.WriteOutcomeCancelled) {
		writeError(response, http.StatusRequestTimeout, "conversation_input_write_cancelled", err.Error())
		return
	}
	if conversation.IsWriteOutcome(err, conversation.WriteOutcomeSaturated) {
		writeError(response, http.StatusTooManyRequests, "conversation_input_write_saturated", err.Error())
		return
	}
	if conversation.IsWriteOutcome(err, conversation.WriteOutcomeStoreClosed) {
		writeError(response, http.StatusServiceUnavailable, "conversation_input_store_unavailable", err.Error())
		return
	}
	if errors.Is(err, conversation.ErrStoreClosed) {
		writeError(response, http.StatusServiceUnavailable, "conversation_input_store_unavailable", err.Error())
		return
	}
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

func writeMasterShellInteractionError(response http.ResponseWriter, err error) {
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_master_input_state", err.Error())
		return
	}
	if errors.Is(err, conversation.ErrStoreClosed) {
		writeError(response, http.StatusServiceUnavailable, "master_input_store_unavailable", err.Error())
		return
	}
	writeError(response, http.StatusInternalServerError, "read_master_shell_interaction_failed", err.Error())
}

func writeMasterInputStateError(response http.ResponseWriter, err error) {
	if conversation.IsStateConflict(err) {
		writeError(response, http.StatusConflict, "master_input_state_conflict", err.Error())
		return
	}
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_master_input_state", err.Error())
		return
	}
	if errors.Is(err, conversation.ErrStoreClosed) {
		writeError(response, http.StatusServiceUnavailable, "master_input_store_unavailable", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		writeError(response, http.StatusInternalServerError, "read_master_input_state_failed", err.Error())
		return
	}
	writeError(response, http.StatusBadRequest, "invalid_master_input_state_request", err.Error())
}

func writeSpeechError(response http.ResponseWriter, fallbackCode string, err error) {
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_speech_source_state", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		writeError(response, http.StatusInternalServerError, "read_speech_source_failed", err.Error())
		return
	}
	if errors.Is(err, conversation.ErrStoreClosed) {
		writeError(response, http.StatusServiceUnavailable, "speech_source_store_unavailable", err.Error())
		return
	}
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

func writeConversationPresentationConfigurationError(response http.ResponseWriter, err error) {
	if _, ok := speech.AsError(err); ok {
		writeSpeechError(response, "invalid_speech_voice_configuration", err)
		return
	}
	writeConversationError(response, "update_conversation_presentation_failed", err)
}

func speechErrorHTTPStatus(code speech.ErrorCode) int {
	switch code {
	case speech.ErrorRateLimited:
		return http.StatusTooManyRequests
	case speech.ErrorProviderRejected, speech.ErrorProviderResponseMalformed, speech.ErrorAudioTooLarge:
		return http.StatusBadGateway
	case speech.ErrorNotConfigured, speech.ErrorProviderUnavailable:
		return http.StatusServiceUnavailable
	case speech.ErrorCredentialInvalid:
		return http.StatusBadRequest
	case speech.ErrorCredentialManagementUnavailable:
		return http.StatusForbidden
	case speech.ErrorSourceUnavailable:
		return http.StatusConflict
	case speech.ErrorVoiceUnavailable:
		return http.StatusUnprocessableEntity
	default:
		return http.StatusInternalServerError
	}
}

func writeCodexAccountError(response http.ResponseWriter, code string, err error) {
	writeError(response, http.StatusBadRequest, code, err.Error())
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
