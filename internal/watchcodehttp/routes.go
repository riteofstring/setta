package watchcodehttp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

// setta-go-type-discovery: skip
type (
	SetWatchCodeEnabledRequest struct {
		FrontendOpID *string `json:"frontendOpId,omitempty"`
		ProjectID    string  `json:"projectConfigId"`
		Enabled      bool    `json:"enabled"`
	}

	SetWatchCodeInputsRequest struct {
		FrontendOpID     *string                        `json:"frontendOpId,omitempty"`
		ProjectID        string                         `json:"projectConfigId"`
		WatchCodeFolders []projectstate.WatchCodeFolder `json:"watchCodeFolders"`
		WatchCodeFiles   []string                       `json:"watchCodeFiles"`
	}
)

type JSONWriter func(w http.ResponseWriter, status int, payload any)

type ErrorWriter func(w http.ResponseWriter, r *http.Request, status int, code string, message string)

type RouteDependencies struct {
	WorkspaceRoot         string
	ProjectState          *projectstate.Runtime
	SettingsProjectState  *projectstate.Runtime
	WebsocketHub          *realtime.WebsocketHub
	WatchCodeCapabilities func() plugins.PluginWatchCodeCapabilities
	WriteJSON             JSONWriter
	WriteError            ErrorWriter
}

func ValidateRouteDependencies(deps RouteDependencies, documentOnly bool) error {
	if documentOnly {
		return nil
	}
	if strings.TrimSpace(deps.WorkspaceRoot) == "" {
		return errors.New("workspace root is required for watch code routes")
	}
	if deps.ProjectState == nil {
		return errors.New("project runtime is required for watch code routes")
	}
	if deps.WriteJSON == nil {
		return errors.New("json writer is required for watch code routes")
	}
	if deps.WriteError == nil {
		return errors.New("error writer is required for watch code routes")
	}
	return nil
}

func SetWatchCodeEnabledHandler(deps RouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWatchCodeEnabledRequest](r)
		if err != nil {
			writeError(deps, w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(deps, w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		providerPluginID, ok := ProviderPluginID(deps)
		if !ok {
			writeFeatureUnavailable(deps, w, r)
			return
		}
		runtime, err := projectRuntimeForProjectID(deps, projectID)
		if err != nil {
			writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetWatchCodeEnabled(
			mutationContext(r.Context(), payload.FrontendOpID),
			providerPluginID,
			projectID,
			payload.Enabled,
			deps.WorkspaceRoot,
		)
		if err != nil {
			writeSetWatchCodeError(deps, w, r, err)
			return
		}
		if err := broadcastProjectStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(deps, w, http.StatusOK, nil)
	}
}

func SetWatchCodeInputsHandler(deps RouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWatchCodeInputsRequest](r)
		if err != nil {
			writeError(deps, w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(deps, w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		providerPluginID, ok := ProviderPluginID(deps)
		if !ok {
			writeFeatureUnavailable(deps, w, r)
			return
		}
		runtime, err := projectRuntimeForProjectID(deps, projectID)
		if err != nil {
			writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetWatchCodeInputs(
			mutationContext(r.Context(), payload.FrontendOpID),
			providerPluginID,
			projectID,
			payload.WatchCodeFolders,
			payload.WatchCodeFiles,
			deps.WorkspaceRoot,
		)
		if err != nil {
			writeSetWatchCodeError(deps, w, r, err)
			return
		}
		if err := broadcastProjectStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(deps, w, http.StatusOK, nil)
	}
}

func ProviderActive(deps RouteDependencies) bool {
	_, ok := ProviderPluginID(deps)
	return ok
}

func ProviderPluginID(deps RouteDependencies) (string, bool) {
	if deps.WatchCodeCapabilities == nil {
		return "", false
	}
	capabilities := deps.WatchCodeCapabilities()
	pluginID := strings.TrimSpace(capabilities.PluginID)
	return pluginID, capabilities.PluginEnabled && capabilities.Python && pluginID != ""
}

func decodeJSONBody[T any](r *http.Request) (T, error) {
	var payload T
	if r.Body == nil {
		return payload, nil
	}
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		return payload, err
	}
	r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	if len(strings.TrimSpace(string(bodyBytes))) == 0 {
		return payload, nil
	}
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		if errors.Is(err, io.EOF) {
			return payload, nil
		}
		return payload, err
	}
	return payload, nil
}

func projectRuntimeForProjectID(
	deps RouteDependencies,
	projectID string,
) (*projectstate.Runtime, error) {
	if deps.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return settingsstate.ProjectRuntimeForID(
		deps.ProjectState,
		deps.SettingsProjectState,
		projectID,
	)
}

func mutationContext(ctx context.Context, frontendOpID *string) context.Context {
	if frontendOpID == nil {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, *frontendOpID)
}

func broadcastProjectStateUpdate(
	r *http.Request,
	deps RouteDependencies,
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

func writeFeatureUnavailable(deps RouteDependencies, w http.ResponseWriter, r *http.Request) {
	writeError(
		deps,
		w,
		r,
		http.StatusConflict,
		"feature_unavailable",
		"Watch Code is unavailable because no active Watch Code provider is selected.",
	)
}

func writeSetWatchCodeError(deps RouteDependencies, w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(deps, w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(deps, w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid):
		writeError(deps, w, r, http.StatusBadRequest, "invalid_watch_code_input", err.Error())
	default:
		writeError(deps, w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeJSON(deps RouteDependencies, w http.ResponseWriter, status int, payload any) {
	if deps.WriteJSON != nil {
		deps.WriteJSON(w, status, payload)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		panic(err)
	}
}

func writeError(
	deps RouteDependencies,
	w http.ResponseWriter,
	r *http.Request,
	status int,
	code string,
	message string,
) {
	if deps.WriteError != nil {
		deps.WriteError(w, r, status, code, message)
		return
	}
	writeJSON(watchCodeFallbackWriters(deps), w, status, map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func watchCodeFallbackWriters(deps RouteDependencies) RouteDependencies {
	deps.WriteJSON = nil
	deps.WriteError = nil
	return deps
}
