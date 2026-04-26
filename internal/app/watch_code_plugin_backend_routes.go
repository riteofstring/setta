package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/watchcodecontracts"
)

type watchCodeBackendRouteHost struct {
	projectState          *projectstate.Runtime
	watchCodeCapabilities *watchCodeCapabilityState
	websocketHub          *realtime.WebsocketHub
}

type watchCodeBackendReconcilePayload struct {
	ProjectConfigID string  `json:"projectConfigId"`
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
}

func newWatchCodeBackendRouteHost(
	projectState *projectstate.Runtime,
	watchCodeCapabilities *watchCodeCapabilityState,
	websocketHub *realtime.WebsocketHub,
	workspaceRoot string,
) *watchCodeBackendRouteHost {
	_ = workspaceRoot
	return &watchCodeBackendRouteHost{
		projectState:          projectState,
		watchCodeCapabilities: watchCodeCapabilities,
		websocketHub:          websocketHub,
	}
}

func (h *watchCodeBackendRouteHost) preflight(
	request plugins.BackendHTTPRequest,
) (plugins.BackendHTTPResponse, bool) {
	pluginID, _, ok := watchcodecontracts.ParseBackendRoutePath(request.Path)
	if !ok {
		return plugins.BackendHTTPResponse{}, false
	}
	capabilities := h.watchCodeCapabilities.WatchCodeCapabilities()
	providerPluginID, providerActive := capabilities.ActiveProviderPluginID()
	if providerActive && providerPluginID == pluginID {
		return plugins.BackendHTTPResponse{}, false
	}
	if capabilities.ProviderSelection.ContainsPluginID(pluginID) {
		return watchCodeBackendUnavailableResponse(), true
	}
	return plugins.BackendHTTPResponse{}, false
}

func (h *watchCodeBackendRouteHost) reconcileSuccessfulRoute(
	ctx context.Context,
	request plugins.BackendHTTPRequest,
	response plugins.BackendHTTPResponse,
) error {
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil
	}
	pluginID, _, ok := watchcodecontracts.ParseBackendRoutePath(request.Path)
	if !ok {
		return nil
	}
	if activePluginID, active := h.activeProviderPluginID(); !active || activePluginID != pluginID {
		return nil
	}
	payload, ok := decodeWatchCodeBackendReconcilePayload(request.Body)
	if !ok {
		return nil
	}
	snapshot, changed, err := h.reconcilePersistedPluginData(
		watchCodeBackendMutationContext(ctx, payload.FrontendOpID),
	)
	if err != nil || !changed {
		return err
	}
	return h.broadcastProjectState(
		ctx,
		snapshot,
		payload.ProjectConfigID,
		request.Context.ShareSessionID,
	)
}

func (h *watchCodeBackendRouteHost) reconcileSuccessfulUISettingWrite(
	ctx context.Context,
	options plugins.BackendUISettingWriteOptions,
) error {
	if h == nil {
		return nil
	}
	if activePluginID, active := h.activeProviderPluginID(); !active || activePluginID != strings.TrimSpace(options.PluginID) {
		return nil
	}
	if !watchcodecontracts.IsBackendWriteHandlerID(options.HandlerID) {
		return nil
	}
	_, _, err := h.reconcilePersistedPluginData(ctx)
	return err
}

func (h *watchCodeBackendRouteHost) reconcilePersistedPluginData(
	ctx context.Context,
) (projectstate.Snapshot, bool, error) {
	if h == nil || h.projectState == nil {
		return projectstate.Snapshot{}, false, nil
	}
	providerPluginID, ok := h.activeProviderPluginID()
	if !ok {
		return projectstate.Snapshot{}, false, nil
	}
	persisted, err := h.projectState.LoadPersistedDocument(ctx)
	if err != nil {
		return projectstate.Snapshot{}, false, err
	}
	snapshot, err := h.projectState.MutateAndSave(ctx, func(document projectstate.Document) (projectstate.Document, error) {
		document.PluginData = cloneWatchCodeBackendProviderPluginData(
			document.PluginData,
			persisted.PluginData,
			providerPluginID,
		)
		return document, nil
	})
	if err != nil {
		return projectstate.Snapshot{}, false, err
	}
	return snapshot, true, nil
}

func (h *watchCodeBackendRouteHost) broadcastProjectState(
	ctx context.Context,
	snapshot projectstate.Snapshot,
	projectID string,
	shareSessionID string,
) error {
	if h == nil || h.websocketHub == nil || h.projectState == nil || strings.TrimSpace(projectID) == "" {
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

func (h *watchCodeBackendRouteHost) activeProviderPluginID() (string, bool) {
	if h == nil || h.watchCodeCapabilities == nil {
		return "", false
	}
	return h.watchCodeCapabilities.ActiveProviderPluginID()
}

func decodeWatchCodeBackendReconcilePayload(body []byte) (watchCodeBackendReconcilePayload, bool) {
	var payload watchCodeBackendReconcilePayload
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return payload, false
	}
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return payload, false
	}
	if strings.TrimSpace(payload.ProjectConfigID) == "" {
		return payload, false
	}
	payload.ProjectConfigID = strings.TrimSpace(payload.ProjectConfigID)
	return payload, true
}

func watchCodeBackendMutationContext(ctx context.Context, frontendOpID *string) context.Context {
	if frontendOpID == nil {
		return ctx
	}
	trimmed := strings.TrimSpace(*frontendOpID)
	if trimmed == "" {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, trimmed)
}

func cloneWatchCodeBackendProviderPluginData(
	current map[string]projectstate.RawJSON,
	persisted map[string]projectstate.RawJSON,
	providerPluginID string,
) map[string]projectstate.RawJSON {
	cloned := make(map[string]projectstate.RawJSON, len(current)+1)
	for pluginID, payload := range current {
		cloned[pluginID] = append(projectstate.RawJSON(nil), payload...)
	}
	payload, ok := persisted[providerPluginID]
	if ok {
		cloned[providerPluginID] = append(projectstate.RawJSON(nil), payload...)
	} else {
		delete(cloned, providerPluginID)
	}
	if len(cloned) == 0 {
		return nil
	}
	return cloned
}

func watchCodeBackendUnavailableResponse() plugins.BackendHTTPResponse {
	return watchCodeBackendErrorResponse(
		http.StatusConflict,
		watchcodecontracts.BackendErrorProviderRequired,
		projectstate.ErrWatchCodeProviderPluginIDRequired.Error(),
	)
}

func watchCodeBackendErrorResponse(statusCode int, code string, message string) plugins.BackendHTTPResponse {
	body, err := json.Marshal(map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
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
