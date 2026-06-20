package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/workspacetrajectory"
)

func (handler handler) readWorkspaceTrajectoryRuntimeSnapshot(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceTrajectoryService(response, handler.workspaceTrajectoryService)
	if service == nil {
		return
	}
	var payload ReadWorkspaceTrajectoryRuntimeSnapshotRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.ReadRuntimeSnapshot(request.Context(), workspacetrajectory.RuntimeFilter{
		WorkspaceID:         payload.WorkspaceID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ChatRunID:           payload.ChatRunID,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeError(response, http.StatusBadRequest, "workspace_trajectory_runtime_snapshot_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler handler) workspaceTrajectoryRuntimeEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceTrajectoryService(response, handler.workspaceTrajectoryService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "workspace_trajectory_runtime_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := workspaceTrajectoryRuntimeEventCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_workspace_trajectory_runtime_cursor", err.Error())
		return
	}
	subscription, err := service.SubscribeRuntimeChanges(cursor)
	if err != nil {
		writeError(response, http.StatusBadRequest, "subscribe_workspace_trajectory_runtime_failed", err.Error())
		return
	}
	defer subscription.Unsubscribe()

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := writeWorkspaceTrajectoryRuntimeServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func workspaceTrajectoryRuntimeEventCursor(request *http.Request) (workspacetrajectory.RuntimeEventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return workspacetrajectory.RuntimeEventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return workspacetrajectory.RuntimeEventCursor{}, fmt.Errorf("workspace trajectory runtime cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return workspacetrajectory.RuntimeEventCursor{}, fmt.Errorf("workspace trajectory runtime cursor sequence must be a non-negative integer: %s", value)
	}
	return workspacetrajectory.RuntimeEventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeWorkspaceTrajectoryRuntimeServerSentEvent(response http.ResponseWriter, event workspacetrajectory.WorkspaceTrajectoryRuntimeEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal workspace trajectory runtime event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write workspace trajectory runtime event %s: %w", event.EventID, err)
	}
	return nil
}
