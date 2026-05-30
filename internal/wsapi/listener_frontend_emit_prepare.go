package wsapi

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/artifacts"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

func handleListenerFrontendEmit(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) error {
	emitCtx, listenerErr, err := prepareListenerFrontendEmit(connectionID, requestInfo, content, deps)
	if listenerErr != nil {
		return sendListenerError(ctx, connectionID, *listenerErr, deps)
	}
	if err != nil {
		return err
	}

	artifactUpdates, err := validateListenerArtifactUpdates(requestInfo, content.ArtifactUpdates, deps)
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, err, deps)
	}

	if len(content.DependencyValues) == 0 {
		return applyResolvedListenerArtifactUpdates(ctx, connectionID, requestInfo, artifactUpdates, deps)
	}

	return applyListenerFrontendEmitDependencyUpdates(
		ctx,
		connectionID,
		requestInfo,
		emitCtx.ProjectID,
		content.DependencyValues,
		artifactUpdates,
		deps,
	)
}

func prepareListenerFrontendEmit(
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) (listenerFrontendEmitContext, *realtime.ListenerErrorContent, error) {
	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return listenerFrontendEmitContext{}, listenerNotRegisteredContent(connectionID), nil
	}

	projectID, listenerErr, err := resolveListenerFrontendEmitProjectID(registration, content.ProjectConfigID, connectionID, deps)
	if listenerErr != nil || err != nil {
		return listenerFrontendEmitContext{}, listenerErr, err
	}
	if listenerErr := validateListenerFrontendEmitRequest(registration, requestInfo, content, deps); listenerErr != nil {
		return listenerFrontendEmitContext{}, listenerErr, nil
	}

	return listenerFrontendEmitContext{
		ProjectID: projectID,
	}, nil, nil
}

func resolveListenerFrontendEmitProjectID(
	registration realtime.ListenerRegistration,
	projectConfigID string,
	connectionID string,
	deps RouteDependencies,
) (string, *realtime.ListenerErrorContent, error) {
	projectID := registration.ProjectID
	receivedProjectID := strings.TrimSpace(projectConfigID)
	if listenerUsesTemporaryIDs(deps, connectionID) {
		resolvedProjectID, err := resolveListenerProjectIDFromTemporary(receivedProjectID, deps.TemporaryIDs)
		if err != nil {
			var temporaryIDError *listenerTemporaryIDError
			if errors.As(err, &temporaryIDError) {
				return "", listenerInvalidIDContent(temporaryIDError.Error()), nil
			}
			return "", nil, err
		}
		receivedProjectID = resolvedProjectID
	}
	if receivedProjectID != projectID {
		return "", projectConfigMismatchContent(projectID, receivedProjectID), nil
	}
	return projectID, nil, nil
}

func validateListenerFrontendEmitRequest(
	registration realtime.ListenerRegistration,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) *realtime.ListenerErrorContent {
	if requestInfo.Policy.IsDeployment() && strings.TrimSpace(registration.ShareSessionID) == "" {
		return shareSessionMissingContent(registration.ConnectionID)
	}
	if len(content.DependencyValues) == 0 && len(content.ArtifactUpdates) == 0 {
		return listenerEmitInvalidPayloadContent()
	}
	if requestInfo.Policy.IsDeployment() && deps.Deployment == nil {
		return listenerProjectStateUnavailableContent("deployment runtime is required")
	}
	if requestInfo.Policy.IsDeployment() && !deps.Deployment.Policy().AllowParamChanges {
		return listenerEmitFailedContent("Deployment policy disallows listener updates.")
	}
	return nil
}

func listenerMutationRuntime(
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (*projectstate.Runtime, error) {
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return nil, fmt.Errorf("deployment runtime is required")
		}
		return deps.Deployment.Overlay(requestInfo.ShareSessionID)
	}
	if deps.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return deps.ProjectState, nil
}

func validateListenerArtifactUpdates(
	requestInfo modes.RequestInfo,
	rawUpdates []artifacts.RawArtifact,
	deps RouteDependencies,
) ([]listenerResolvedArtifactUpdate, error) {
	if len(rawUpdates) == 0 {
		return nil, nil
	}

	resolved := make([]listenerResolvedArtifactUpdate, 0, len(rawUpdates))
	for _, update := range rawUpdates {
		rawPath := strings.TrimSpace(update.ID)
		if rawPath == "" {
			rawPath = update.ID
		}

		normalizedID, err := validateListenerArtifactUpdate(requestInfo, update, deps)
		if err != nil {
			return nil, classifyListenerArtifactUpdateError(rawPath, err)
		}

		next := cloneRawArtifact(update)
		next.ID = normalizedID
		resolved = append(resolved, listenerResolvedArtifactUpdate{Artifact: next})
	}
	return resolved, nil
}

func validateListenerArtifactUpdate(
	requestInfo modes.RequestInfo,
	update artifacts.RawArtifact,
	deps RouteDependencies,
) (string, error) {
	const scope = artifacts.UploadScopeGeneric

	if requestInfo.Policy.IsDeployment() {
		if deps.ShareArtifacts == nil {
			return "", fmt.Errorf("share artifact service is required")
		}
		return deps.ShareArtifacts.ValidateListenerUpdate(update, scope)
	}
	if deps.Artifacts == nil {
		return "", fmt.Errorf("artifact service is required")
	}
	return deps.Artifacts.ValidateListenerUpdate(update, scope)
}
