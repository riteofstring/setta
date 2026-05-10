package httpapi

import (
	"net/http"
	"strings"

	"setta/internal/projectstate"
)

func createTopLevelSectionHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateTopLevelSectionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeCreateTopLevelSectionError(w, r, err)
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, result, err := runtime.CreateTopLevelSection(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.CreateTopLevelSectionInput{
				ImplType:           payload.ImplType,
				ControlCodeObjType: payload.ControlCodeObjType,
				ImplOverrides:      payload.ImplOverrides,
				Position:           payload.Position,
				Name:               payload.Name,
				TopLevelSections:   payload.TopLevelSections,
				ViewportBounds:     payload.ViewportBounds,
			},
			settings,
		)
		if err != nil {
			writeCreateTopLevelSectionError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func setShowParamDisplayNamesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetShowParamDisplayNamesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
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

		if _, err := runtime.SetShowParamDisplayNames(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.ShowParamDisplayNames); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionSizesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionSizesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}
		if deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		sectionSizes := make(map[string]projectstate.SectionSize, len(payload.SectionSizes))
		for sectionID, size := range payload.SectionSizes {
			sectionSizes[sectionID] = size.ProjectStateValue()
		}
		if _, err := runtime.SetSectionSizes(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionSizes,
			settings,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if deps.SetSectionName == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.SetSectionName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			payload.ProjectID,
			payload.SectionID,
			payload.Name,
		); err != nil {
			writeSectionNameMutationError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func acceptRenameRefactorHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AcceptRenameRefactorRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if deps.AcceptRenameRefactor == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.AcceptRenameRefactor(r.Context(), payload.ProjectID, payload.FrontendOpID); err != nil {
			writeRenameRefactorMutationError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func declineRenameRefactorHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeclineRenameRefactorRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if deps.DeclineRenameRefactor == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.DeclineRenameRefactor(r.Context(), payload.ProjectID, payload.FrontendOpID); err != nil {
			writeRenameRefactorMutationError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func createViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, viewModeID, err := runtime.CreateViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID)
		if err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, viewModeID)
	}
}

func setActiveViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetActiveViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		activeViewModeID := strings.TrimSpace(payload.ActiveViewModeID)
		if activeViewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetActiveViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, activeViewModeID)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleIsEditingViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleIsEditingViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.ToggleIsEditingViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID)
		if err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleSectionVisibilityHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleSectionVisibilityRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.ToggleSectionVisibility(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.SectionIDs)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func groupSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GroupSectionsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeGroupSectionsError(w, r, err)
			return
		}
		if _, err := deps.ProjectState.GroupSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.GroupSectionsInput{SectionIDs: payload.SectionIDs},
			settings,
		); err != nil {
			writeGroupSectionsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func ungroupGroupsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UngroupGroupsRequest](r)
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

		if _, err := deps.ProjectState.UngroupGroups(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.UngroupGroupsInput{GroupIDs: payload.GroupIDs},
		); err != nil {
			writeUngroupGroupsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleViewModeUserFacingHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleViewModeUserFacingRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.ToggleViewModeUserFacing(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleViewModeTabHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleViewModeTabRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.ToggleViewModeTab(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setViewModeNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetViewModeNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetViewModeName(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID, payload.Name)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setViewModeSortOrderHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetViewModeSortOrderRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetViewModeSortOrder(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.OrderedViewModeIDs)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		projectConfig, err := projectConfigViewFromSnapshot(snapshot, projectID)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, ProjectConfigMutationResponse{
			ProjectConfig: projectConfig,
		})
	}
}

func deleteViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.DeleteViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID)
		if err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		projectConfig, err := projectConfigViewFromSnapshot(snapshot, projectID)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, ProjectConfigMutationResponse{
			ProjectConfig: projectConfig,
		})
	}
}

func setTopLevelSectionLayoutHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTopLevelSectionLayoutRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
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

		if _, err := runtime.SetTopLevelSectionLayout(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.TopLevelSections); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func autoLayoutTopLevelSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AutoLayoutTopLevelSectionsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}
		if deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		margin := 50
		if payload.Margin != nil {
			margin = *payload.Margin
		}
		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeAutoLayoutError(w, r, err)
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if _, err := runtime.AutoLayoutTopLevelSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			settings,
			margin,
		); err != nil {
			writeAutoLayoutError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func togglePositionLocksHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[TogglePositionLocksRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
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

		if _, err := runtime.TogglePositionLocks(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.SectionIDs); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleMinimizedHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleMinimizedRequest](r)
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

		if _, err := runtime.ToggleMinimized(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}
