package httpapi

import (
	"net/http"
	"strings"

	"setta/internal/projectstate"
)

func createEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateEdgeRequest](r)
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

		if _, err := deps.ProjectState.CreateEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.Edge{
				SourceSectionID: payload.SourceSectionID,
				SourceVariantID: payload.SourceVariantID,
				SourcePortID:    payload.SourcePortID,
				TargetSectionID: payload.TargetSectionID,
				TargetVariantID: payload.TargetVariantID,
				TargetPortID:    payload.TargetPortID,
				Type:            payload.Type,
				Label:           payload.Label,
				Style:           projectstate.RawJSON(payload.Style),
				Animated:        payload.Animated,
				Hidden:          payload.Hidden,
				ZIndex:          payload.ZIndex,
				Data:            projectstate.RawJSON(payload.Data),
			},
			deps.EdgeExpressionBuilder,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateEdgeRequest](r)
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

		if _, err := deps.ProjectState.UpdateEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edge,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteEdgesRequest](r)
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

		if _, err := deps.ProjectState.DeleteEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeIDs,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func reconnectEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ReconnectEdgeRequest](r)
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

		if _, err := deps.ProjectState.ReconnectEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeID,
			payload.SourceSectionID,
			payload.SourceVariantID,
			payload.SourcePortID,
			payload.TargetSectionID,
			payload.TargetVariantID,
			payload.TargetPortID,
			deps.EdgeExpressionBuilder,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetEdgesRequest](r)
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

		if _, err := deps.ProjectState.SetEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edges,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func createStateMachineEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateStateMachineEdgeRequest](r)
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

		edgeID := ""
		if payload.ID != nil {
			edgeID = strings.TrimSpace(*payload.ID)
		}

		snapshot, err := runtime.CreateStateMachineEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.StateMachineEdge{
				ID:                             edgeID,
				MachineGroupID:                 payload.MachineGroupID,
				SourceSectionID:                payload.SourceSectionID,
				SourcePortID:                   payload.SourcePortID,
				TargetSectionID:                payload.TargetSectionID,
				TargetPortID:                   payload.TargetPortID,
				SourceFilter:                   payload.SourceFilter,
				SourceActivationCountCondition: payload.SourceActivationCountCondition,
				TargetAction:                   payload.TargetAction,
				Style:                          projectstate.RawJSON(payload.Style),
				Hidden:                         payload.Hidden,
				ZIndex:                         payload.ZIndex,
				Selected:                       payload.Selected,
			},
			deps.PromptTemplates,
		)
		if err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateStateMachineEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateStateMachineEdgeRequest](r)
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

		snapshot, err := runtime.UpdateStateMachineEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edge,
			deps.PromptTemplates,
		)
		if err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteStateMachineEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteStateMachineEdgesRequest](r)
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

		snapshot, err := runtime.DeleteStateMachineEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeIDs,
		)
		if err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setStateMachineEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetStateMachineEdgesRequest](r)
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

		snapshot, err := runtime.SetStateMachineEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edges,
			deps.PromptTemplates,
		)
		if err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func createAgenticEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateAgenticEdgeRequest](r)
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

		edgeID := ""
		if payload.ID != nil {
			edgeID = strings.TrimSpace(*payload.ID)
		}
		contextMode := ""
		if payload.ContextMode != nil {
			contextMode = strings.TrimSpace(*payload.ContextMode)
		}

		if _, err := deps.ProjectState.CreateAgenticEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.AgenticEdge{
				ID:              edgeID,
				SourceSectionID: payload.SourceSectionID,
				TargetSectionID: payload.TargetSectionID,
				Kind:            projectstate.AgenticEdgeKind(payload.Kind),
				ContextMode:     projectstate.AgenticEdgeContextMode(contextMode),
				Style:           projectstate.RawJSON(payload.Style),
				Hidden:          payload.Hidden,
				ZIndex:          payload.ZIndex,
			},
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateAgenticEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateAgenticEdgeRequest](r)
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

		if _, err := deps.ProjectState.UpdateAgenticEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edge,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteAgenticEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteAgenticEdgesRequest](r)
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

		if _, err := deps.ProjectState.DeleteAgenticEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeIDs,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setAgenticEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetAgenticEdgesRequest](r)
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

		if _, err := deps.ProjectState.SetAgenticEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edges,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}
