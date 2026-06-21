package httpapi

import "net/http"

func (handler handler) readWorkspaceActivitySnapshot(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceActivityService(response, handler.workspaceActivityService)
	if service == nil {
		return
	}
	var payload ReadWorkspaceActivitySnapshotRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.ReadSnapshot(payload.WorkspaceID, payload.Limit)
	if err != nil {
		writeError(response, http.StatusBadRequest, "read_workspace_activity_snapshot_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, ReadWorkspaceActivitySnapshotResponse{Snapshot: snapshot})
}

func (handler handler) readWorkflowExecutionActivity(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceActivityService(response, handler.workspaceActivityService)
	if service == nil {
		return
	}
	var payload ReadWorkflowExecutionActivityRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.ReadExecutionSnapshot(payload.WorkspaceID, payload.ExecutionID, payload.Limit)
	if err != nil {
		writeError(response, http.StatusBadRequest, "read_workflow_execution_activity_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, ReadWorkflowExecutionActivityResponse{Snapshot: snapshot})
}
