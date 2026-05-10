package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

func setPromptTemplateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetPromptTemplate(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Template,
		)
		if err != nil {
			writePromptSectionMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setPromptInputsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptInputsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetPromptInputs(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Inputs,
		)
		if err != nil {
			writePromptSectionMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setPromptTemplateLinkHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptTemplateLinkRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		promptTemplateID := normalizeOptionalBodyString(payload.PromptTemplateID)
		nextTemplate, nextFormat, err := resolvePromptTemplateLinkContent(
			deps.PromptTemplates,
			runtime,
			projectID,
			sectionID,
			promptTemplateID,
		)
		if err != nil {
			writePromptTemplateLinkResolveError(w, r, err, sectionID)
			return
		}

		snapshot, err := runtime.SetPromptTemplateLink(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			promptTemplateID,
			nextTemplate,
			nextFormat,
		)
		if err != nil {
			writePromptTemplateLinkMutationError(w, r, err, sectionID)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func resolvePromptTemplateLinkContent(
	store *prompttemplates.Store,
	runtime *projectstate.Runtime,
	projectID string,
	sectionID string,
	promptTemplateID *string,
) (string, prompttemplates.Format, error) {
	if promptTemplateID != nil {
		return loadPromptTemplateLinkContent(store, *promptTemplateID)
	}
	snapshot := runtime.Snapshot()
	source, err := snapshot.Document.PromptSectionSource(projectID, sectionID)
	if err != nil {
		return "", "", err
	}
	if source.PromptTemplateID == nil {
		return source.Template, source.Format, nil
	}
	return loadPromptTemplateLinkContent(store, *source.PromptTemplateID)
}

func loadPromptTemplateLinkContent(
	store *prompttemplates.Store,
	templateID string,
) (string, prompttemplates.Format, error) {
	if store == nil {
		return "", "", errPromptTemplateStoreRequired
	}
	template, err := store.Get(templateID)
	if err != nil {
		return "", "", err
	}
	return template.Template, template.Format, nil
}

func writePromptTemplateLinkResolveError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
	sectionID string,
) {
	switch {
	case errors.Is(err, prompttemplates.ErrTemplateNotFound):
		writeError(w, r, http.StatusNotFound, "prompt_template_not_found", "Prompt template not found.")
	case errors.Is(err, errPromptTemplateStoreRequired):
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	default:
		writePromptTemplateLinkMutationError(w, r, err, sectionID)
	}
}

func setPromptFormatHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptFormatRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetPromptFormat(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Format,
		)
		if err != nil {
			writePromptSectionMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChatSectionSettingsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChatSectionSettingsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if err := validateChatPermissionModeRequestValue(payload.PermissionMode); err != nil {
			writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", err.Error())
			return
		}
		if err := validateChatDictationModeRequestValue(payload.DictationMode); err != nil {
			writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", err.Error())
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings := projectstate.ChatSectionSettings{
			Managed:                payload.Managed,
			EngineConfigID:         payload.EngineConfigID,
			TranscriptionProfileID: payload.TranscriptionProfileID,
			AgentProfileID:         payload.AgentProfileID,
			Thinking:               payload.Thinking,
			PermissionMode:         payload.PermissionMode,
			SearchEnabled:          payload.SearchEnabled,
			DictationMode:          payload.DictationMode,
		}
		snapshot, err := runtime.SetChatSectionSettings(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, settings)
		if err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setStateMachineSectionSettingsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetStateMachineSectionSettingsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings := projectstate.StateMachineSectionSettings{
			MachineGroupID: payload.MachineGroupID,
			Label:          payload.Label,
			GateType:       payload.GateType,
		}
		snapshot, err := runtime.SetStateMachineSectionSettings(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			settings,
		)
		if err != nil {
			writeStateMachineSectionMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChatSectionStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChatSectionStateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetChatSectionState(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.State); err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func getChatSectionChatIDHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetChatSectionChatIDRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ChatSectionChatID == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		chatID, err := deps.ChatSectionChatID(r.Context(), projectID, sectionID)
		if err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, chatID)
	}
}

func setChatSectionChatIDHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChatSectionChatIDRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if !ensureProjectLLMMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetChatSectionChatID(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.ChatID); err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}
