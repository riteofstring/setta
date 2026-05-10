package httpapi

import (
	"net/http"
	"strings"

	"setta/internal/projectstate"
)

func moveSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MoveSectionsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
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

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeMoveSectionsError(w, r, err)
			return
		}
		snapshot, err := runtime.MoveSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.MoveSectionsInput{
				SectionIDs:    payload.SectionIDs,
				NewParentID:   payload.NewParentID,
				NewIndex:      payload.NewIndex,
				PositionsByID: payload.PositionsByID,
			},
			settings,
		)
		if err != nil {
			writeMoveSectionsError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func moveParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MoveParamsRequest](r)
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

		if _, err := deps.ProjectState.MoveParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.MoveParamsInput{
				SectionID:   payload.SectionID,
				ParamIDs:    payload.ParamIDs,
				NewParentID: payload.NewParentID,
				NewIndex:    payload.NewIndex,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func moveParamGroupsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MoveParamGroupsRequest](r)
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

		moves := make([]projectstate.MoveParamGroupInput, 0, len(payload.Moves))
		for _, move := range payload.Moves {
			moves = append(moves, projectstate.MoveParamGroupInput{
				ParamIDs:    move.ParamIDs,
				NewParentID: move.NewParentID,
				NewIndex:    move.NewIndex,
			})
		}
		if _, err := deps.ProjectState.MoveParamGroups(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.MoveParamGroupsInput{
				SectionID: payload.SectionID,
				Moves:     moves,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func indentParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[IndentParamsRequest](r)
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

		if _, err := deps.ProjectState.IndentParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.IndentParamsInput{
				SectionID: payload.SectionID,
				ParamIDs:  payload.ParamIDs,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func unindentParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UnindentParamsRequest](r)
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

		if _, err := deps.ProjectState.UnindentParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.UnindentParamsInput{
				SectionID: payload.SectionID,
				ParamIDs:  payload.ParamIDs,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func addKwargHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AddKwargRequest](r)
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
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, _, err := runtime.AddKwarg(projectMutationContext(r.Context(), nil), projectID, sectionID)
		if err != nil {
			writeKwargMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteKwargHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteKwargRequest](r)
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
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, _, err := runtime.DeleteKwarg(projectMutationContext(r.Context(), nil), projectID, sectionID)
		if err != nil {
			writeKwargMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}
