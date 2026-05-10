package wsapi

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/listenersnapshot"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

func handleListenerTemporaryIDError(
	ctx context.Context,
	connectionID string,
	err error,
	deps RouteDependencies,
) error {
	if message, ok := listenerTemporaryIDMessage(err); ok {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_invalid_id",
			Details: map[string]any{
				"message": message,
			},
		}, deps)
	}
	return err
}

func handleListenerRegister(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRegisterContent,
	deps RouteDependencies,
) error {
	useTemporaryIDs := listenerUsesTemporaryIDs(deps, connectionID)
	requestedProjectID, err := resolveListenerRegisterProjectID(ctx, connectionID, strings.TrimSpace(content.ProjectConfigID), useTemporaryIDs, deps)
	if err != nil {
		return err
	}
	if err := validateListenerRegisterProjectMatch(connectionID, requestedProjectID, deps); err != nil {
		return err
	}

	callbacks, ackStatuses, err := buildListenerRegisterCallbacks(ctx, connectionID, content.Callbacks, useTemporaryIDs, deps)
	if err != nil {
		return err
	}

	if err := deps.ListenerBroadcaster.Registry().UpsertRegistration(connectionID, requestedProjectID, callbacks, ""); err != nil {
		return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
	}

	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return fmt.Errorf("listener registration was not retained for websocket %s", connectionID)
	}
	return sendListenerRegisterAck(ctx, connectionID, registration, ackStatuses, deps)
}

func resolveListenerRegisterProjectID(
	ctx context.Context,
	connectionID string,
	requestedProjectID string,
	useTemporaryIDs bool,
	deps RouteDependencies,
) (string, error) {
	if !useTemporaryIDs || requestedProjectID == "" {
		return requestedProjectID, nil
	}
	resolvedProjectID, err := resolveListenerProjectIDFromTemporary(requestedProjectID, deps.TemporaryIDs)
	if err != nil {
		return "", handleListenerTemporaryIDError(ctx, connectionID, err, deps)
	}
	return resolvedProjectID, nil
}

func validateListenerRegisterProjectMatch(connectionID string, requestedProjectID string, deps RouteDependencies) error {
	if requestedProjectID == "" {
		return nil
	}
	if bootstrap, ok := deps.ListenerBroadcaster.Registry().Bootstrap(connectionID); ok && bootstrap.ProjectID != requestedProjectID {
		return &CloseError{Code: CloseCodeBadRequest, Reason: "project config mismatch"}
	}
	return nil
}

func buildListenerRegisterCallbacks(
	ctx context.Context,
	connectionID string,
	callbackContent map[string]realtime.ListenerRegisterCallbackSpec,
	useTemporaryIDs bool,
	deps RouteDependencies,
) (map[string]realtime.ListenerCallback, map[string]realtime.ListenerRegisterAckStatus, error) {
	callbacks := make(map[string]realtime.ListenerCallback, len(callbackContent))
	ackStatuses := make(map[string]realtime.ListenerRegisterAckStatus, len(callbackContent))
	for callbackID, callback := range callbackContent {
		dependencies, err := resolveListenerRegisterDependencies(ctx, connectionID, callback.Dependencies, useTemporaryIDs, deps)
		if err != nil {
			return nil, nil, err
		}
		callbacks[callbackID] = realtime.ListenerCallback{
			Dependencies:   dependencies,
			DependencyMode: callback.DependencyMode,
		}
		ackStatuses[callbackID] = realtime.ListenerRegisterAckStatus{Status: "accepted"}
	}
	return callbacks, ackStatuses, nil
}

func resolveListenerRegisterDependencies(
	ctx context.Context,
	connectionID string,
	dependencies []string,
	useTemporaryIDs bool,
	deps RouteDependencies,
) ([]string, error) {
	resolvedDependencies := append([]string(nil), dependencies...)
	if !useTemporaryIDs {
		return resolvedDependencies, nil
	}
	for index, dependency := range resolvedDependencies {
		resolvedDependency, err := resolveListenerDependencyKeyFromTemporary(dependency, deps.TemporaryIDs)
		if err != nil {
			return nil, handleListenerTemporaryIDError(ctx, connectionID, err, deps)
		}
		resolvedDependencies[index] = resolvedDependency
	}
	return resolvedDependencies, nil
}

func sendListenerRegisterAck(
	ctx context.Context,
	connectionID string,
	registration realtime.ListenerRegistration,
	ackStatuses map[string]realtime.ListenerRegisterAckStatus,
	deps RouteDependencies,
) error {
	responseProjectID, err := listenerProjectIDForResponse(connectionID, registration.ProjectID, deps)
	if err != nil {
		return err
	}
	_, err = deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerRegisterAckMessage(realtime.ListenerRegisterAckContent{
			ProjectConfigID: responseProjectID,
			ShareSessionID:  registration.ShareSessionID,
			Callbacks:       ackStatuses,
		}),
		connectionID,
	)
	if err != nil {
		return err
	}
	_, err = deps.ListenerBroadcaster.BroadcastCoverageSnapshot(
		ctx,
		registration.ProjectID,
		registration.ShareSessionID,
	)
	return err
}

func handleListenerInit(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerInitContent,
	deps RouteDependencies,
) error {
	if content.UseTemporaryIDs {
		if deps.TemporaryIDs == nil {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_invalid_id",
				Details: map[string]any{
					"message": "Temporary listener ids are unavailable on this Setta server.",
				},
			}, deps)
		}
		resolvedProjectID, err := resolveListenerProjectIDFromTemporary(content.ProjectConfigID, deps.TemporaryIDs)
		if err != nil {
			var temporaryIDError *listenerTemporaryIDError
			if errors.As(err, &temporaryIDError) {
				return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
					Error: "listener_invalid_id",
					Details: map[string]any{
						"message": temporaryIDError.Error(),
					},
				}, deps)
			}
			return err
		}
		content.ProjectConfigID = resolvedProjectID
	}

	projectID, snapshotPayload, details, err := resolveListenerBootstrap(
		requestInfo,
		content,
		deps,
	)
	if err != nil {
		if len(details) == 0 {
			details = map[string]any{
				"message": err.Error(),
			}
		}
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error:   "project_state_unavailable",
			Details: details,
		}, deps)
	}

	if err := deps.ListenerBroadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
		ConnectionID:    connectionID,
		ProjectID:       projectID,
		ShareSessionID:  requestInfo.ShareSessionID,
		UseTemporaryIDs: content.UseTemporaryIDs,
	}); err != nil {
		return err
	}

	_, err = deps.ListenerBroadcaster.SendForceRefresh(ctx, realtime.ForceRefreshParams{
		ProjectID:           projectID,
		ShareSessionID:      requestInfo.ShareSessionID,
		Snapshot:            snapshotPayload,
		RefreshKind:         "bootstrap",
		TargetConnectionIDs: []string{connectionID},
	})
	return err
}

func resolveListenerBootstrap(
	requestInfo modes.RequestInfo,
	content realtime.ListenerInitContent,
	deps RouteDependencies,
) (string, listenersnapshot.ListenerSnapshotPayload, map[string]any, error) {
	snapshot, err := listenerBootstrapSnapshot(requestInfo, deps)
	if err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, map[string]any{"message": err.Error()}, err
	}

	target, details, err := resolveListenerBootstrapTarget(snapshot.Document, content)
	if err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, details, err
	}
	if err := validateListenerBootstrapTarget(snapshot.Document, target); err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, listenerBootstrapTargetErrorDetails(target, err), err
	}

	snapshotPayload, err := listenersnapshot.BuildListenerSnapshotPayload(snapshot.Document, target.projectID)
	if err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, map[string]any{"message": err.Error()}, err
	}
	return target.projectID, snapshotPayload, nil, nil
}

func listenerBootstrapSnapshot(
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (projectstate.Snapshot, error) {
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return projectstate.Snapshot{}, fmt.Errorf("deployment runtime is required")
		}
		return deps.Deployment.SessionSnapshot(requestInfo.ShareSessionID)
	}
	if deps.ProjectState == nil {
		return projectstate.Snapshot{}, fmt.Errorf("project runtime is required")
	}
	return deps.ProjectState.Snapshot(), nil
}

type listenerBootstrapTarget struct {
	projectID   string
	projectName string
}

func resolveListenerBootstrapTarget(
	document projectstate.Document,
	content realtime.ListenerInitContent,
) (listenerBootstrapTarget, map[string]any, error) {
	target := listenerBootstrapTarget{
		projectID:   strings.TrimSpace(content.ProjectConfigID),
		projectName: strings.TrimSpace(content.ProjectName),
	}
	if target.projectID != "" {
		return target, nil, nil
	}
	if target.projectName != "" {
		projectID, err := document.ProjectIDByName(target.projectName)
		if err != nil {
			return listenerBootstrapTarget{}, listenerBootstrapProjectNameErrorDetails(target.projectName, err), err
		}
		target.projectID = projectID
		return target, nil, nil
	}
	target.projectID = strings.TrimSpace(document.DefaultProjectID)
	if target.projectID != "" {
		return target, nil, nil
	}
	err := fmt.Errorf("%w: default project id", projectview.ErrProjectConfigIDRequired)
	return listenerBootstrapTarget{}, map[string]any{"message": err.Error()}, err
}

func validateListenerBootstrapTarget(
	document projectstate.Document,
	target listenerBootstrapTarget,
) error {
	_, err := projectview.SingleConfigByProjectID(document, target.projectID)
	return err
}

func listenerBootstrapProjectNameErrorDetails(projectName string, err error) map[string]any {
	details := map[string]any{
		"projectName": projectName,
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		details["message"] = err.Error()
	}
	return details
}

func listenerBootstrapTargetErrorDetails(target listenerBootstrapTarget, err error) map[string]any {
	details := map[string]any{}
	if target.projectID != "" {
		details["projectConfigId"] = target.projectID
	}
	if target.projectName != "" {
		details["projectName"] = target.projectName
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		details["message"] = err.Error()
	}
	return details
}
