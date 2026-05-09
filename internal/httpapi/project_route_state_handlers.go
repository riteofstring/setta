package httpapi

import (
	"net/http"
	"strings"

	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

func getLatestProjectStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetLatestProjectStateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if settingsstate.IsSettingsProjectID(projectID) && deps.SettingsState != nil && deps.SettingsProjectState != nil {
			if err := settingsstate.RefreshProjectRuntimeFromSettings(
				r.Context(),
				deps.SettingsState,
				deps.SettingsProjectState,
			); err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, frontendOps, err := runtime.SnapshotAndConsumeFrontendOps()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		responsePayload, err := projectStateEnvelopeWithFrontendOps(snapshot, frontendOps, projectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, responsePayload)
	}
}

func projectStateEnvelopeWithFrontendOps(
	snapshot projectstate.Snapshot,
	frontendOps projectstate.FrontendOpStatus,
	projectID string,
) (ProjectStateSingleConfigWithCompletedOpIDs, error) {
	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return ProjectStateSingleConfigWithCompletedOpIDs{}, err
	}
	return ProjectStateSingleConfigWithCompletedOpIDs{
		ProjectState:   projectStateView,
		CompletedOpIDs: frontendOps.Completed,
		PendingOpIDs:   frontendOps.Pending,
	}, nil
}

func broadcastProjectRouteStateUpdate(
	r *http.Request,
	deps ProjectRouteDependencies,
	runtime *projectstate.Runtime,
	snapshot projectstate.Snapshot,
	projectID string,
) error {
	if deps.WebsocketHub == nil || runtime == nil {
		return nil
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}

	selection := realtime.Selection{Type: realtime.ConnectionTypeFrontend}
	if requestInfo, ok := modes.RequestInfoFromRequest(r); ok {
		selection.ShareSessionID = strings.TrimSpace(requestInfo.ShareSessionID)
	}
	status := runtime.FrontendOpStatus()
	_, err = deps.WebsocketHub.BroadcastJSON(
		r.Context(),
		realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
			ProjectState:   projectStateView,
			CompletedOpIDs: status.Completed,
			PendingOpIDs:   status.Pending,
		}),
		selection,
	)
	return err
}

func projectConfigViewFromSnapshot(
	snapshot projectstate.Snapshot,
	projectID string,
) (projectview.ProjectConfig, error) {
	projectStateView, err := projectview.SingleConfigByProjectID(
		snapshot.Document,
		projectID,
	)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	return projectStateView.ProjectConfig, nil
}

func undoHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UndoRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.UndoAndSave(r.Context(), payload.ProjectID, payload.Steps)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}

		response, err := projectStateEnvelopeWithFrontendOps(snapshot, runtime.FrontendOpStatus(), payload.ProjectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func redoHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[RedoRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.RedoAndSave(r.Context(), payload.ProjectID, payload.Steps)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}

		response, err := projectStateEnvelopeWithFrontendOps(snapshot, runtime.FrontendOpStatus(), payload.ProjectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getPasswordParamValueHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetPasswordParamValueRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		value, err := deps.ProjectState.GetPasswordParamValue(
			r.Context(),
			payload.ProjectID,
			payload.SectionID,
			payload.ParamInfoID,
		)
		if err != nil {
			writeGetPasswordParamValueError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, GetPasswordParamValueResponse{Value: value})
	}
}

func changeParamImplHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ChangeParamImplRequest](r)
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
		paramInfoID := strings.TrimSpace(payload.ParamInfoID)
		if paramInfoID == "" {
			writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
			return
		}
		selectedID := strings.TrimSpace(payload.SelectedID)
		if selectedID == "" {
			writeError(w, r, http.StatusBadRequest, "selected_id_required", "Selected impl or code object type is required.")
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
		snapshot, err := runtime.ChangeParamImpl(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			paramInfoID,
			selectedID,
		)
		if err != nil {
			writeChangeParamImplError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setParamEnteredValueHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetParamEnteredValueRequest](r)
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
		paramInfoID := strings.TrimSpace(payload.ParamInfoID)
		if paramInfoID == "" {
			writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
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
		sectionVariantID := strings.TrimSpace(payload.SectionVariantID)
		if !ensureProjectParamValueMutationAllowed(
			w,
			r,
			deps,
			runtime,
			projectID,
			sectionID,
			sectionVariantID,
			paramInfoID,
		) {
			return
		}

		var snapshot projectstate.Snapshot
		if sectionVariantID != "" {
			snapshot, err = runtime.SetSectionCodeObjectValueForVariant(
				projectMutationContext(r.Context(), payload.FrontendOpID),
				projectID,
				sectionID,
				sectionVariantID,
				paramInfoID,
				payload.Value,
			)
		} else {
			snapshot, err = runtime.SetSectionCodeObjectValue(
				projectMutationContext(r.Context(), payload.FrontendOpID),
				projectID,
				sectionID,
				paramInfoID,
				payload.Value,
			)
		}
		if err != nil {
			writeParamValueMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTypeErrorIgnoreHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTypeErrorIgnoreRequest](r)
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
		if _, err := runtime.SetTypeErrorIgnore(
			r.Context(),
			projectID,
			sectionID,
			optionalTrimmedStringPointer(payload.ParamInfoID),
			payload.IgnoreTypeErrors,
		); err != nil {
			writeTypeErrorIgnoreMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateParamImplConfigHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateParamImplConfigRequest](r)
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
		paramInfoID := strings.TrimSpace(payload.ParamInfoID)
		if paramInfoID == "" {
			writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.UpdateParamImplConfig(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			paramInfoID,
			payload.NewConfig,
		); err != nil {
			writeUpdateParamImplConfigError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeObjNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeObjNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		codeObjID := strings.TrimSpace(payload.CodeObjID)
		if codeObjID == "" {
			writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetCodeObjectName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			codeObjID,
			payload.Name,
		); err != nil {
			writeCodeObjNameMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeObjDisplayNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeObjDisplayNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		codeObjID := strings.TrimSpace(payload.CodeObjID)
		if codeObjID == "" {
			writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetCodeObjectDisplayName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			codeObjID,
			payload.DisplayName,
		); err != nil {
			writeCodeObjDisplayNameMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeSectionAttachedTerminalHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeSectionAttachedTerminalRequest](r)
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
		if !ensureProjectStructuralMutationsAllowed(w, r) {
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeCodeSectionAttachedTerminalError(w, r, err)
			return
		}
		if _, err := deps.ProjectState.SetCodeSectionAttachedTerminal(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.TerminalSectionID,
			settings,
		); err != nil {
			writeCodeSectionAttachedTerminalError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}
