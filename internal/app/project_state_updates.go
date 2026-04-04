package app

import (
	"context"
	"errors"

	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

func broadcastFrontendProjectStateUpdate(
	ctx context.Context,
	projectRuntime *projectstate.Runtime,
	websocketHub *realtime.WebsocketHub,
	snapshot projectstate.Snapshot,
	projectID string,
) error {
	if websocketHub == nil {
		return nil
	}
	if projectRuntime == nil {
		return errors.New("project state runtime is not configured")
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}
	status := projectRuntime.FrontendOpStatus()
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
			ProjectState:   projectStateView,
			CompletedOpIDs: status.Completed,
			PendingOpIDs:   status.Pending,
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func refetchCallableParamsAndBroadcast(
	ctx context.Context,
	projectRuntime *projectstate.Runtime,
	websocketHub *realtime.WebsocketHub,
	projectID string,
	sectionIDs []string,
	resolver projectstate.CallableSignatureResolver,
) error {
	if projectRuntime == nil {
		return errors.New("project state runtime is not configured")
	}

	snapshot, didUpdate, err := projectRuntime.RefetchCallableParams(
		ctx,
		projectID,
		sectionIDs,
		resolver,
	)
	if err != nil {
		return err
	}
	if !didUpdate {
		return nil
	}
	return broadcastFrontendProjectStateUpdate(ctx, projectRuntime, websocketHub, snapshot, projectID)
}
