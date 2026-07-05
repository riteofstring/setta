package httpapi

import "net/http"

func (handler handler) readEasyRunSnapshot(response http.ResponseWriter, request *http.Request) {
	service := requireEasyRunService(response, handler.easyRunService)
	if service == nil {
		return
	}
	payload := ReadEasyRunSnapshotRequest{
		WorkspaceID: request.URL.Query().Get("workspaceId"),
	}
	snapshot, err := service.ReadSnapshot(payload.WorkspaceID)
	if err != nil {
		writeEasyRunError(response, "read_easy_run_snapshot_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}
