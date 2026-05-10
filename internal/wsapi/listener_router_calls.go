package wsapi

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/listenerendpoints"
	"setta/internal/listenersnapshot"
	"setta/internal/modes"
	"setta/internal/realtime"
)

func handleListenerRouterEndpointCall(
	ctx context.Context,
	info ConnectionInfo,
	connectionID string,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) error {
	state, err := resolveListenerRouterCallState(ctx, connectionID, content, deps)
	if err != nil {
		return err
	}
	if state == nil {
		return nil
	}
	payload, ok, err := normalizeListenerRouterPayload(ctx, connectionID, *state, content, deps)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	result, err := invokeListenerEndpoint(ctx, info, state.endpointName, payload, deps)
	if err != nil {
		return sendListenerRouterError(ctx, connectionID, state.responseProjectID, state.callID, "listener_call_failed", map[string]any{
			"message": err.Error(),
		}, deps)
	}

	if err := sendListenerRouterSuccess(ctx, connectionID, state.responseProjectID, state.callID, result, deps); err != nil {
		return err
	}

	return maybeSendListenerEndpointForceRefresh(ctx, info.Modes, connectionID, *state, deps)
}

func resolveListenerRouterCallState(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) (*listenerRouterCallState, error) {
	callID := strings.TrimSpace(content.CallID)
	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		err := sendListenerRouterError(ctx, connectionID, strings.TrimSpace(content.ProjectConfigID), callID, "listener_not_registered", map[string]any{
			"websocketId": connectionID,
		}, deps)
		return nil, err
	}

	projectID := registration.ProjectID
	responseProjectID, err := listenerProjectIDForResponse(connectionID, projectID, deps)
	if err != nil {
		return nil, err
	}
	receivedProjectID, err := resolveListenerRouterProjectID(ctx, connectionID, strings.TrimSpace(content.ProjectConfigID), responseProjectID, callID, deps)
	if err != nil {
		return nil, err
	}
	if receivedProjectID != projectID {
		err := sendListenerRouterError(ctx, connectionID, responseProjectID, callID, "project_config_mismatch", map[string]any{
			"expectedProjectConfigId": responseProjectID,
			"receivedProjectConfigId": strings.TrimSpace(content.ProjectConfigID),
		}, deps)
		return nil, err
	}

	endpointName := strings.TrimSpace(content.EndpointName)
	if endpointName == "" {
		err := sendListenerRouterError(ctx, connectionID, responseProjectID, callID, "listener_call_invalid_operation", map[string]any{
			"message": "endpointName must be non-empty",
		}, deps)
		return nil, err
	}

	state := listenerRouterCallState{
		callID:            callID,
		projectID:         projectID,
		responseProjectID: responseProjectID,
		endpointName:      endpointName,
	}
	return &state, nil
}

func resolveListenerRouterProjectID(
	ctx context.Context,
	connectionID string,
	trimmedProjectID string,
	responseProjectID string,
	callID string,
	deps RouteDependencies,
) (string, error) {
	if !listenerUsesTemporaryIDs(deps, connectionID) {
		return trimmedProjectID, nil
	}
	resolvedProjectID, err := resolveListenerProjectIDFromTemporary(trimmedProjectID, deps.TemporaryIDs)
	if err != nil {
		if message, ok := listenerTemporaryIDMessage(err); ok {
			return "", sendListenerRouterError(ctx, connectionID, responseProjectID, callID, "listener_invalid_id", map[string]any{
				"message": message,
			}, deps)
		}
		return "", err
	}
	return resolvedProjectID, nil
}

func normalizeListenerRouterPayload(
	ctx context.Context,
	connectionID string,
	state listenerRouterCallState,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) (map[string]any, bool, error) {
	payload := cloneListenerPayload(content.Payload)
	if payload == nil {
		payload = map[string]any{}
	}
	rawProjectID, ok := payload["projectConfigId"]
	if !ok {
		payload["projectConfigId"] = state.projectID
		return payload, true, nil
	}
	payloadProjectID, ok := rawProjectID.(string)
	if !ok {
		return payload, true, nil
	}
	receivedPayloadProjectID, err := resolveListenerRouterProjectID(
		ctx,
		connectionID,
		strings.TrimSpace(payloadProjectID),
		state.responseProjectID,
		state.callID,
		deps,
	)
	if err != nil {
		return nil, false, err
	}
	if receivedPayloadProjectID != state.projectID {
		err := sendListenerRouterError(ctx, connectionID, state.responseProjectID, state.callID, "project_config_mismatch", map[string]any{
			"expectedProjectConfigId": state.responseProjectID,
			"receivedProjectConfigId": strings.TrimSpace(payloadProjectID),
		}, deps)
		return nil, false, err
	}
	payload["projectConfigId"] = state.projectID
	return payload, true, nil
}

func sendListenerRouterError(
	ctx context.Context,
	connectionID string,
	projectID string,
	callID string,
	errorCode string,
	details map[string]any,
	deps RouteDependencies,
) error {
	return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: projectID,
		CallID:          callID,
		OK:              false,
		Error:           errorCode,
		Details:         details,
	}, deps)
}

func sendListenerRouterSuccess(
	ctx context.Context,
	connectionID string,
	projectID string,
	callID string,
	result any,
	deps RouteDependencies,
) error {
	return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: projectID,
		CallID:          callID,
		OK:              true,
		Result:          result,
	}, deps)
}

func maybeSendListenerEndpointForceRefresh(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	connectionID string,
	state listenerRouterCallState,
	deps RouteDependencies,
) error {
	if !listenerEndpointRequiresForceRefresh(state.endpointName) {
		return nil
	}
	if err := sendListenerEndpointForceRefresh(
		ctx,
		requestInfo,
		state.projectID,
		state.callID,
		state.endpointName,
		deps,
	); err != nil {
		_ = sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_refresh_failed",
			Details: map[string]any{
				"endpointName": state.endpointName,
				"callId":       state.callID,
				"message":      err.Error(),
			},
		}, deps)
	}
	return nil
}

func invokeListenerEndpoint(
	ctx context.Context,
	info ConnectionInfo,
	endpointName string,
	payload map[string]any,
	deps RouteDependencies,
) (any, error) {
	if deps.BuiltInListenerInvoker != nil {
		result, handled, err := deps.BuiltInListenerInvoker.InvokeBuiltInListenerEndpoint(ctx, info, endpointName, payload)
		if err != nil {
			return nil, err
		}
		if handled {
			return result, nil
		}
	}
	return nil, fmt.Errorf("unknown listener endpoint: %s", endpointName)
}

func sendListenerRouterEndpointResult(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRouterEndpointResultContent,
	deps RouteDependencies,
) error {
	if content.Details == nil {
		content.Details = map[string]any{}
	}
	_, err := deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerRouterEndpointResultMessage(content),
		connectionID,
	)
	return err
}

func listenerEndpointRequiresForceRefresh(endpointName string) bool {
	switch strings.TrimSpace(endpointName) {
	case listenerendpoints.EndpointSetChatSectionState:
		return true
	default:
		return false
	}
}

func sendListenerEndpointForceRefresh(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	projectID string,
	callID string,
	endpointName string,
	deps RouteDependencies,
) error {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return fmt.Errorf("listener endpoint %s requires a project config id for force refresh", strings.TrimSpace(endpointName))
	}

	snapshot, err := listenerBootstrapSnapshot(requestInfo, deps)
	if err != nil {
		return err
	}

	snapshotPayload, err := listenersnapshot.BuildListenerSnapshotPayload(snapshot.Document, projectID)
	if err != nil {
		return err
	}

	_, err = deps.ListenerBroadcaster.SendForceRefresh(ctx, realtime.ForceRefreshParams{
		ProjectID:      projectID,
		ShareSessionID: requestInfo.ShareSessionID,
		CallID:         strings.TrimSpace(callID),
		Snapshot:       snapshotPayload,
		RefreshKind:    "force_refresh",
	})
	return err
}
