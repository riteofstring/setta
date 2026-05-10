package wsapi

import (
	"context"
	"errors"
	"strings"

	"setta/internal/artifacts"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

func broadcastListenerProjectStateUpdate(
	ctx context.Context,
	snapshot projectstate.Snapshot,
	projectID string,
	shareSessionID string,
	deps RouteDependencies,
) error {
	if deps.WebsocketHub == nil {
		return nil
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}

	status := projectstate.FrontendOpStatus{}
	if deps.Deployment != nil && strings.TrimSpace(shareSessionID) != "" {
		runtime, runtimeErr := deps.Deployment.Overlay(shareSessionID)
		if runtimeErr != nil && !errors.Is(runtimeErr, deployments.ErrUnknownSession) {
			return runtimeErr
		}
		if runtime != nil {
			status = runtime.FrontendOpStatus()
		}
	} else if deps.ProjectState != nil {
		status = deps.ProjectState.FrontendOpStatus()
	}

	_, err = deps.WebsocketHub.BroadcastJSON(
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

func broadcastListenerArtifactUpdates(
	ctx context.Context,
	updates []artifacts.RawArtifact,
	shareSessionID string,
	deps RouteDependencies,
) error {
	if deps.WebsocketHub == nil || len(updates) == 0 {
		return nil
	}

	payloads := make([]any, 0, len(updates))
	for _, update := range updates {
		payloads = append(payloads, cloneRawArtifact(update))
	}
	_, err := deps.WebsocketHub.BroadcastJSON(
		ctx,
		realtime.NewUpdateArtifactsMessage(realtime.UpdateArtifactsContent{
			Artifacts:  payloads,
			UpdateType: "update",
		}),
		realtime.Selection{
			Type:           realtime.ConnectionTypeFrontend,
			ShareSessionID: strings.TrimSpace(shareSessionID),
		},
	)
	return err
}

func classifyListenerArtifactUpdateError(path string, err error) error {
	var artifactErr *artifacts.Error
	if !errors.As(err, &artifactErr) {
		return &listenerEmitArtifactUpdateFailedError{
			Path:    path,
			Message: err.Error(),
		}
	}

	switch artifactErr.Kind {
	case artifacts.ErrorArtifactTypeUnsupported:
		return &listenerEmitUnsupportedArtifactUpdateError{
			Path:   path,
			Reason: artifactErr.Message,
		}
	case artifacts.ErrorInvalidRequest,
		artifacts.ErrorPathForbidden,
		artifacts.ErrorBinaryPayloadInvalid,
		artifacts.ErrorBinaryPayloadNotFound,
		artifacts.ErrorTooLarge,
		artifacts.ErrorMimeNotAllowed:
		return &listenerEmitInvalidArtifactUpdateError{
			Path:    path,
			Message: artifactErr.Message,
		}
	default:
		return &listenerEmitArtifactUpdateFailedError{
			Path:    path,
			Message: artifactErr.Message,
		}
	}
}

func listenerNotRegisteredContent(connectionID string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_not_registered",
		Details: map[string]any{
			"websocketId": connectionID,
		},
	}
}

func listenerInvalidIDContent(message string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_invalid_id",
		Details: map[string]any{
			"message": message,
		},
	}
}

func projectConfigMismatchContent(expectedProjectID string, receivedProjectID string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "project_config_mismatch",
		Details: map[string]any{
			"expectedProjectConfigId": expectedProjectID,
			"receivedProjectConfigId": receivedProjectID,
		},
	}
}

func shareSessionMissingContent(connectionID string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "share_session_missing",
		Details: map[string]any{
			"websocketId": connectionID,
		},
	}
}

func listenerEmitInvalidPayloadContent() *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_emit_invalid_payload",
		Details: map[string]any{
			"message": "listener emits require dependencyValues or artifactUpdates",
		},
	}
}

func listenerProjectStateUnavailableContent(message string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "project_state_unavailable",
		Details: map[string]any{
			"message": message,
		},
	}
}

func listenerEmitFailedContent(message string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_emit_failed",
		Details: map[string]any{
			"message": message,
		},
	}
}
