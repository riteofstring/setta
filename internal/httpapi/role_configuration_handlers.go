package httpapi

import (
	"errors"
	"net/http"

	"setta/internal/conversation"
)

func (handler handler) readRoleModelCatalog(response http.ResponseWriter, request *http.Request) {
	service := requireRoleConfigurationService(response, handler.roleConfigurationService)
	if service == nil {
		return
	}
	catalog, err := service.ReadModelCatalog(request.Context())
	if err != nil {
		writeRoleConfigurationError(response, "read_role_model_catalog_failed", err)
		return
	}
	if err := catalog.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_role_model_catalog", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, catalog)
}

func (handler handler) readGlobalRoleConfiguration(
	response http.ResponseWriter,
	request *http.Request,
) {
	service := requireRoleConfigurationService(response, handler.roleConfigurationService)
	if service == nil {
		return
	}
	configuration, err := service.ReadGlobalConfiguration(request.Context())
	if err != nil {
		writeRoleConfigurationError(response, "read_global_role_configuration_failed", err)
		return
	}
	writeRoleConfiguration(response, configuration)
}

func (handler handler) updateGlobalRoleProfiles(
	response http.ResponseWriter,
	request *http.Request,
) {
	service := requireRoleConfigurationService(response, handler.roleConfigurationService)
	if service == nil {
		return
	}
	var payload UpdateGlobalRoleProfilesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	configuration, err := service.UpdateGlobalConfiguration(request.Context(), payload.Updates)
	if err != nil {
		writeRoleConfigurationError(response, "update_global_role_profiles_failed", err)
		return
	}
	writeRoleConfiguration(response, configuration)
}

func (handler handler) readConversationRoleConfiguration(
	response http.ResponseWriter,
	request *http.Request,
) {
	service := requireRoleConfigurationService(response, handler.roleConfigurationService)
	if service == nil {
		return
	}
	var payload ReadConversationRoleConfigurationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if err := validateConversationRequestIdentity(payload.WorkspaceID, payload.ConversationID); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_conversation_role_configuration_request", err.Error())
		return
	}
	configuration, err := service.ReadConversationConfiguration(
		request.Context(),
		payload.WorkspaceID,
		payload.ConversationID,
	)
	if err != nil {
		writeRoleConfigurationError(response, "read_conversation_role_configuration_failed", err)
		return
	}
	writeRoleConfiguration(response, configuration)
}

func (handler handler) updateConversationRoleProfiles(
	response http.ResponseWriter,
	request *http.Request,
) {
	service := requireRoleConfigurationService(response, handler.roleConfigurationService)
	if service == nil {
		return
	}
	var payload UpdateConversationRoleProfilesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if err := validateConversationRequestIdentity(payload.WorkspaceID, payload.ConversationID); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_conversation_role_configuration_update", err.Error())
		return
	}
	configuration, err := service.UpdateConversationConfiguration(
		request.Context(),
		payload.WorkspaceID,
		payload.ConversationID,
		payload.Updates,
	)
	if err != nil {
		writeRoleConfigurationError(response, "update_conversation_role_profiles_failed", err)
		return
	}
	writeRoleConfiguration(response, configuration)
}

func writeRoleConfiguration(response http.ResponseWriter, configuration conversation.RoleConfiguration) {
	if err := configuration.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_role_configuration", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, configuration)
}

func writeRoleConfigurationError(response http.ResponseWriter, code string, err error) {
	if conversation.IsConversationNotFound(err) {
		writeError(response, http.StatusNotFound, "conversation_not_found", err.Error())
		return
	}
	if conversation.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_role_configuration_state", err.Error())
		return
	}
	if conversation.IsPersistenceError(err) {
		writeError(response, http.StatusInternalServerError, "persist_role_configuration_failed", err.Error())
		return
	}
	if errors.Is(err, conversation.ErrStoreClosed) {
		writeError(response, http.StatusServiceUnavailable, "role_configuration_store_unavailable", err.Error())
		return
	}
	writeError(response, http.StatusBadRequest, code, err.Error())
}
