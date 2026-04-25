package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

const (
	watchCodeBackendErrorInvalidJSON             = "invalid_json"
	watchCodeBackendErrorInvalidRequest          = "invalid_request"
	watchCodeBackendErrorInternal                = "internal_error"
	watchCodeBackendErrorProjectConfigIDRequired = "project_config_id_required"
	watchCodeBackendErrorProjectConfigNotFound   = "project_config_not_found"
	watchCodeBackendErrorInvalidWatchCodeInput   = "invalid_watch_code_input"
	watchCodeBackendErrorProviderRequired        = "watch_code_provider_required"
)

type watchCodeBackendRouteHost struct {
	projectState          *projectstate.Runtime
	watchCodeCapabilities *watchCodeCapabilityState
	websocketHub          *realtime.WebsocketHub
	workspaceRoot         string
}

type watchCodeBackendSetEnabledPayload struct {
	ProjectConfigID string  `json:"projectConfigId"`
	Enabled         *bool   `json:"enabled"`
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
}

type watchCodeBackendSetInputsPayload struct {
	ProjectConfigID  string                          `json:"projectConfigId"`
	WatchCodeFolders *[]projectstate.WatchCodeFolder `json:"watchCodeFolders"`
	WatchCodeFiles   *[]string                       `json:"watchCodeFiles"`
	FrontendOpID     *string                         `json:"frontendOpId,omitempty"`
}

func newWatchCodeBackendRouteHost(
	projectState *projectstate.Runtime,
	watchCodeCapabilities *watchCodeCapabilityState,
	websocketHub *realtime.WebsocketHub,
	workspaceRoot string,
) *watchCodeBackendRouteHost {
	return &watchCodeBackendRouteHost{
		projectState:          projectState,
		watchCodeCapabilities: watchCodeCapabilities,
		websocketHub:          websocketHub,
		workspaceRoot:         strings.TrimSpace(workspaceRoot),
	}
}

func (h watchCodeBackendRouteHost) intercept(
	ctx context.Context,
	request plugins.BackendHTTPRequest,
) (plugins.BackendHTTPResponse, bool, error) {
	pluginID, route, ok := parseWatchCodeBackendRoutePath(request.Path)
	if !ok {
		return plugins.BackendHTTPResponse{}, false, nil
	}
	if strings.ToUpper(strings.TrimSpace(request.Method)) != http.MethodPost {
		return watchCodeBackendErrorResponse(http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.", nil), true, nil
	}
	providerPluginID, providerActive := h.activeProviderPluginID()
	if h.projectState == nil || !providerActive || providerPluginID != pluginID {
		return watchCodeBackendErrorResponse(http.StatusConflict, watchCodeBackendErrorProviderRequired, projectstate.ErrWatchCodeProviderPluginIDRequired.Error(), nil), true, nil
	}
	if h.workspaceRoot == "" {
		return watchCodeBackendErrorResponse(http.StatusInternalServerError, watchCodeBackendErrorInternal, "workspace root is required", nil), true, nil
	}

	switch route {
	case "enabled":
		return h.handleSetEnabled(ctx, request.Context.ShareSessionID, providerPluginID, request.Body)
	case "inputs":
		return h.handleSetInputs(ctx, request.Context.ShareSessionID, providerPluginID, request.Body)
	default:
		return plugins.BackendHTTPResponse{}, false, nil
	}
}

func (h *watchCodeBackendRouteHost) readUISettingValue(
	options plugins.BackendUISettingReadOptions,
) (any, bool, error) {
	providerPluginID, ok := h.activeProviderPluginID()
	if !ok || strings.TrimSpace(options.PluginID) != providerPluginID {
		return nil, false, nil
	}
	projectData, handled, err := h.watchCodeProjectDataForUISetting(providerPluginID, options.ProjectConfigID, options.HandlerID, "read_")
	if err != nil || !handled {
		return nil, handled, err
	}
	switch strings.TrimSpace(options.HandlerID) {
	case "read_enabled":
		return projectData.Enabled, true, nil
	case "read_folders":
		return projectData.Folders, true, nil
	case "read_files":
		return projectData.Files, true, nil
	default:
		return nil, false, nil
	}
}

func (h *watchCodeBackendRouteHost) writeUISettingValue(
	ctx context.Context,
	options plugins.BackendUISettingWriteOptions,
) (bool, error) {
	providerPluginID, ok := h.activeProviderPluginID()
	if !ok || strings.TrimSpace(options.PluginID) != providerPluginID {
		return false, nil
	}
	projectData, handled, err := h.watchCodeProjectDataForUISetting(providerPluginID, options.ProjectConfigID, options.HandlerID, "write_")
	if err != nil || !handled {
		return handled, err
	}
	switch strings.TrimSpace(options.HandlerID) {
	case "write_enabled":
		enabled, ok := options.Value.(bool)
		if !ok {
			return true, errors.New("enabled must be a boolean")
		}
		_, err := h.projectState.SetWatchCodeEnabled(ctx, providerPluginID, options.ProjectConfigID, enabled, h.workspaceRoot)
		return true, err
	case "write_folders":
		folders, err := decodeWatchCodeUISettingValue[[]projectstate.WatchCodeFolder](options.Value)
		if err != nil {
			return true, err
		}
		_, err = h.projectState.SetWatchCodeInputs(ctx, providerPluginID, options.ProjectConfigID, folders, projectData.Files, h.workspaceRoot)
		return true, err
	case "write_files":
		files, err := decodeWatchCodeUISettingValue[[]string](options.Value)
		if err != nil {
			return true, err
		}
		_, err = h.projectState.SetWatchCodeInputs(ctx, providerPluginID, options.ProjectConfigID, projectData.Folders, files, h.workspaceRoot)
		return true, err
	default:
		return false, nil
	}
}

func (h *watchCodeBackendRouteHost) watchCodeProjectDataForUISetting(
	providerPluginID string,
	projectID string,
	handlerID string,
	prefix string,
) (projectstate.WatchCodePluginProjectData, bool, error) {
	if h == nil || h.projectState == nil || h.workspaceRoot == "" {
		return projectstate.WatchCodePluginProjectData{}, true, projectstate.ErrRuntimeClosed
	}
	handlerID = strings.TrimSpace(handlerID)
	if handlerID != prefix+"enabled" && handlerID != prefix+"folders" && handlerID != prefix+"files" {
		return projectstate.WatchCodePluginProjectData{}, false, nil
	}
	projectData, _, err := h.projectState.Snapshot().Document.WatchCodePluginProjectData(providerPluginID, projectID)
	if err != nil {
		return projectstate.WatchCodePluginProjectData{}, true, err
	}
	return projectData, true, nil
}

func (h *watchCodeBackendRouteHost) activeProviderPluginID() (string, bool) {
	if h == nil || h.watchCodeCapabilities == nil {
		return "", false
	}
	return h.watchCodeCapabilities.ActiveProviderPluginID()
}

func (h watchCodeBackendRouteHost) handleSetEnabled(
	ctx context.Context,
	shareSessionID string,
	providerPluginID string,
	body []byte,
) (plugins.BackendHTTPResponse, bool, error) {
	payload, response, ok := decodeWatchCodeBackendRequest[watchCodeBackendSetEnabledPayload](
		body,
		watchCodeBackendErrorInvalidRequest,
		"Invalid Watch Code enabled request.",
	)
	if !ok {
		return response, true, nil
	}
	projectID, response, ok := requiredWatchCodeBackendPayloadString(payload.ProjectConfigID, watchCodeBackendErrorProjectConfigIDRequired, "Project config id is required.")
	if !ok {
		return response, true, nil
	}
	if payload.Enabled == nil {
		return watchCodeBackendErrorResponse(http.StatusBadRequest, watchCodeBackendErrorInvalidRequest, "enabled must be a boolean.", nil), true, nil
	}
	frontendOpID := optionalWatchCodeBackendPayloadString(payload.FrontendOpID)

	snapshot, err := h.projectState.SetWatchCodeEnabled(
		watchCodeBackendMutationContext(ctx, frontendOpID),
		providerPluginID,
		projectID,
		*payload.Enabled,
		h.workspaceRoot,
	)
	if err != nil {
		return watchCodeBackendMutationErrorResponse(err), true, nil
	}
	if err := h.broadcastProjectState(ctx, snapshot, projectID, shareSessionID); err != nil {
		return plugins.BackendHTTPResponse{}, true, err
	}
	return watchCodeBackendProjectDataResponse(snapshot.Document, providerPluginID, projectID), true, nil
}

func (h watchCodeBackendRouteHost) handleSetInputs(
	ctx context.Context,
	shareSessionID string,
	providerPluginID string,
	body []byte,
) (plugins.BackendHTTPResponse, bool, error) {
	payload, response, ok := decodeWatchCodeBackendRequest[watchCodeBackendSetInputsPayload](
		body,
		watchCodeBackendErrorInvalidWatchCodeInput,
		"Invalid Watch Code input.",
	)
	if !ok {
		return response, true, nil
	}
	projectID, response, ok := requiredWatchCodeBackendPayloadString(payload.ProjectConfigID, watchCodeBackendErrorProjectConfigIDRequired, "Project config id is required.")
	if !ok {
		return response, true, nil
	}
	if payload.WatchCodeFolders == nil {
		return watchCodeBackendErrorResponse(http.StatusBadRequest, watchCodeBackendErrorInvalidRequest, "watchCodeFolders must be an array of objects.", nil), true, nil
	}
	if payload.WatchCodeFiles == nil {
		return watchCodeBackendErrorResponse(http.StatusBadRequest, watchCodeBackendErrorInvalidRequest, "watchCodeFiles must be an array of strings.", nil), true, nil
	}
	frontendOpID := optionalWatchCodeBackendPayloadString(payload.FrontendOpID)

	snapshot, err := h.projectState.SetWatchCodeInputs(
		watchCodeBackendMutationContext(ctx, frontendOpID),
		providerPluginID,
		projectID,
		*payload.WatchCodeFolders,
		*payload.WatchCodeFiles,
		h.workspaceRoot,
	)
	if err != nil {
		return watchCodeBackendMutationErrorResponse(err), true, nil
	}
	if err := h.broadcastProjectState(ctx, snapshot, projectID, shareSessionID); err != nil {
		return plugins.BackendHTTPResponse{}, true, err
	}
	return watchCodeBackendProjectDataResponse(snapshot.Document, providerPluginID, projectID), true, nil
}

func (h watchCodeBackendRouteHost) broadcastProjectState(
	ctx context.Context,
	snapshot projectstate.Snapshot,
	projectID string,
	shareSessionID string,
) error {
	if h.websocketHub == nil || h.projectState == nil {
		return nil
	}
	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}
	status := h.projectState.FrontendOpStatus()
	_, err = h.websocketHub.BroadcastJSON(
		ctx,
		realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
			ProjectState:   projectStateView,
			CompletedOpIDs: status.Completed,
			PendingOpIDs:   status.Pending,
		}),
		realtime.Selection{
			Type:           realtime.ConnectionTypeFrontend,
			ShareSessionID: strings.TrimSpace(shareSessionID),
		},
	)
	return err
}

func parseWatchCodeBackendRoutePath(path string) (string, string, bool) {
	rest, ok := strings.CutPrefix(strings.TrimSpace(path), "/plugins/")
	if !ok {
		return "", "", false
	}
	pluginID, suffix, ok := strings.Cut(rest, "/watch-code/")
	if !ok || strings.TrimSpace(pluginID) == "" {
		return "", "", false
	}
	if suffix != "enabled" && suffix != "inputs" {
		return "", "", false
	}
	return pluginID, suffix, true
}

func decodeWatchCodeBackendRequest[T any](
	body []byte,
	decodeErrorCode string,
	decodeErrorMessage string,
) (T, plugins.BackendHTTPResponse, bool) {
	var payload T
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		trimmed = []byte("{}")
	}
	if !bytes.HasPrefix(trimmed, []byte("{")) {
		return payload, watchCodeBackendErrorResponse(http.StatusBadRequest, watchCodeBackendErrorInvalidRequest, "JSON payload must be an object.", nil), false
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		code := decodeErrorCode
		message := decodeErrorMessage
		if isWatchCodeBackendJSONSyntaxError(err) {
			code = watchCodeBackendErrorInvalidJSON
			message = "Invalid JSON payload."
		} else if message == "" {
			message = err.Error()
		} else {
			message = message + " " + err.Error()
		}
		return payload, watchCodeBackendErrorResponse(http.StatusBadRequest, code, message, nil), false
	}
	var trailing struct{}
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return payload, watchCodeBackendErrorResponse(http.StatusBadRequest, watchCodeBackendErrorInvalidJSON, "Invalid JSON payload.", nil), false
	}
	return payload, plugins.BackendHTTPResponse{}, true
}

func isWatchCodeBackendJSONSyntaxError(err error) bool {
	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		return true
	}
	return errors.Is(err, io.ErrUnexpectedEOF)
}

func requiredWatchCodeBackendPayloadString(
	value string,
	code string,
	message string,
) (string, plugins.BackendHTTPResponse, bool) {
	if strings.TrimSpace(value) == "" {
		return "", watchCodeBackendErrorResponse(http.StatusBadRequest, code, message, nil), false
	}
	return strings.TrimSpace(value), plugins.BackendHTTPResponse{}, true
}

func optionalWatchCodeBackendPayloadString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func watchCodeBackendMutationContext(ctx context.Context, frontendOpID string) context.Context {
	if strings.TrimSpace(frontendOpID) == "" {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, frontendOpID)
}

func decodeWatchCodeUISettingValue[T any](value any) (T, error) {
	var result T
	raw, err := json.Marshal(value)
	if err != nil {
		return result, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return result, err
	}
	var trailing struct{}
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return result, errors.New("watch code setting value must contain a single JSON value")
	}
	return result, nil
}

func watchCodeBackendProjectDataResponse(
	document projectstate.Document,
	providerPluginID string,
	projectID string,
) plugins.BackendHTTPResponse {
	projectData, _, err := document.WatchCodePluginProjectData(providerPluginID, projectID)
	if err != nil {
		return watchCodeBackendMutationErrorResponse(err)
	}
	return watchCodeBackendJSONResponse(http.StatusOK, map[string]any{
		"projectData": projectData,
	})
}

func watchCodeBackendMutationErrorResponse(err error) plugins.BackendHTTPResponse {
	code, message, status := watchCodeBackendMutationError(err)
	return watchCodeBackendErrorResponse(status, code, message, nil)
}

func watchCodeBackendMutationError(err error) (string, string, int) {
	switch {
	case err == nil:
		return "", "", http.StatusOK
	case errors.Is(err, projectstate.ErrWatchCodeProviderPluginIDRequired):
		return watchCodeBackendErrorProviderRequired, err.Error(), http.StatusConflict
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		return watchCodeBackendErrorProjectConfigIDRequired, "Project config id is required.", http.StatusBadRequest
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return watchCodeBackendErrorProjectConfigNotFound, "Project config not found.", http.StatusNotFound
	case errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid):
		return watchCodeBackendErrorInvalidWatchCodeInput, err.Error(), http.StatusBadRequest
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrPersistedStoreUnsupported):
		return watchCodeBackendErrorInternal, err.Error(), http.StatusInternalServerError
	default:
		return watchCodeBackendErrorInternal, err.Error(), http.StatusInternalServerError
	}
}

func watchCodeBackendErrorResponse(statusCode int, code string, message string, details map[string]any) plugins.BackendHTTPResponse {
	payload := map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	}
	if len(details) > 0 {
		payload["error"].(map[string]any)["details"] = details
	}
	return watchCodeBackendJSONResponse(statusCode, payload)
}

func watchCodeBackendJSONResponse(statusCode int, payload any) plugins.BackendHTTPResponse {
	body, err := json.Marshal(payload)
	if err != nil {
		body = []byte(`{"error":{"code":"internal_error","message":"Internal Server Error"}}`)
		statusCode = http.StatusInternalServerError
	}
	return plugins.BackendHTTPResponse{
		StatusCode: statusCode,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
		Body: body,
	}
}
