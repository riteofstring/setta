package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func createWindowSpaceHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateWindowSpaceRequest](r)
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

		snapshot, windowSpace, err := runtime.CreateWindowSpace(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.State,
			payload.Name,
		)
		if err != nil {
			writeWindowSpaceMutationError(w, r, err)
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
		createdWindowSpaceID := windowSpace.ID
		writeJSON(w, http.StatusOK, WindowSpaceMutationResponse{
			ProjectConfig: projectConfig,
			WindowSpaceID: &createdWindowSpaceID,
		})
	}
}

func setWindowSpaceNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWindowSpaceNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		windowSpaceID := strings.TrimSpace(payload.WindowSpaceID)
		if windowSpaceID == "" {
			writeError(w, r, http.StatusBadRequest, "window_space_id_required", "Window space id is required.")
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

		snapshot, err := runtime.SetWindowSpaceName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			windowSpaceID,
			payload.Name,
		)
		if err != nil {
			writeWindowSpaceMutationError(w, r, err)
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

func setWindowSpaceSortOrderHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWindowSpaceSortOrderRequest](r)
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

		snapshot, err := runtime.SetWindowSpaceSortOrder(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.OrderedWindowSpaceIDs,
		)
		if err != nil {
			writeWindowSpaceMutationError(w, r, err)
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

func deleteWindowSpaceHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteWindowSpaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		windowSpaceID := strings.TrimSpace(payload.WindowSpaceID)
		if windowSpaceID == "" {
			writeError(w, r, http.StatusBadRequest, "window_space_id_required", "Window space id is required.")
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

		snapshot, err := runtime.DeleteWindowSpace(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			windowSpaceID,
		)
		if err != nil {
			writeWindowSpaceMutationError(w, r, err)
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

func setProjectChatWindowingStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectChatWindowingStateRequest](r)
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

		snapshot, err := runtime.SetProjectChatWindowingState(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.State,
		)
		if err != nil {
			writeProjectChatWindowingMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeProjectChatWindowingMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectstate.ProjectChatWindowingOrDefault(project.ProjectChatWindowing))
	}
}

func setProjectChatWindowChatIDHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectChatWindowChatIDRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		instanceID := strings.TrimSpace(payload.InstanceID)
		if instanceID == "" {
			writeError(w, r, http.StatusBadRequest, "instance_id_required", "Instance id is required.")
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

		snapshot, err := runtime.SetProjectChatWindowChatID(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			instanceID,
			payload.ChatID,
		)
		if err != nil {
			writeProjectChatWindowChatIDMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeProjectChatWindowChatIDMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectstate.ProjectChatWindowingOrDefault(project.ProjectChatWindowing))
	}
}

func setProjectConfigCodegenTargetsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectConfigCodegenTargetsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.PythonCodegenSectionReconciler == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		targets, err := decodeProjectCodegenTargets(payload.CodegenTargets)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_project_codegen_targets", err.Error())
			return
		}

		snapshot, err := deps.ProjectState.SetProjectCodegenTargets(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			targets,
			deps.CodegenTargetValidator,
			deps.PythonCodegenSectionReconciler,
		)
		if err != nil {
			writeSetProjectConfigCodegenTargetsError(w, r, err)
			return
		}

		projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
		if err != nil {
			writeSetProjectConfigCodegenTargetsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectStateView)
	}
}

func setGenCodePrefixHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetGenCodePrefixRequest](r)
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

		if _, err := deps.ProjectState.SetGenCodePrefix(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.GenCodePrefix,
		); err != nil {
			writeSetGenCodePrefixSuffixError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setGenCodeSuffixHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetGenCodeSuffixRequest](r)
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

		if _, err := deps.ProjectState.SetGenCodeSuffix(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.GenCodeSuffix,
		); err != nil {
			writeSetGenCodePrefixSuffixError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func decodeProjectCodegenTargets(payloads []json.RawMessage) ([]projectstate.ProjectCodegenTarget, error) {
	targets := make([]projectstate.ProjectCodegenTarget, 0, len(payloads))
	for _, payload := range payloads {
		target, err := decodeProjectCodegenTarget(payload)
		if err != nil {
			return nil, err
		}
		targets = append(targets, target)
	}
	return targets, nil
}

func decodeProjectCodegenTarget(payload json.RawMessage) (projectstate.ProjectCodegenTarget, error) {
	trimmedPayload := bytes.TrimSpace(payload)
	if len(trimmedPayload) == 0 {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetObjectRequired
	}

	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmedPayload, &object); err != nil {
		return projectstate.ProjectCodegenTarget{}, err
	}
	if object == nil {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetObjectRequired
	}

	languagePayload, ok := object["language"]
	if !ok {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguageRequired
	}

	var language string
	if err := json.Unmarshal(languagePayload, &language); err != nil {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguageRequired
	}
	language = strings.TrimSpace(language)
	if language == "" {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguageRequired
	}

	return projectstate.ProjectCodegenTarget{
		Language: language,
		Payload:  append(projectstate.RawJSON(nil), trimmedPayload...),
	}, nil
}
