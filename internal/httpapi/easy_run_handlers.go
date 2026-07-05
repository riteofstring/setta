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

func (handler handler) startEasyRun(response http.ResponseWriter, request *http.Request) {
	service := requireEasyRunService(response, handler.easyRunService)
	if service == nil {
		return
	}
	var payload StartEasyRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, err := service.Start(payload.WorkspaceID, payload.RequestText)
	if err != nil {
		writeEasyRunError(response, "start_easy_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, run)
}

func (handler handler) stopEasyRun(response http.ResponseWriter, request *http.Request) {
	service := requireEasyRunService(response, handler.easyRunService)
	if service == nil {
		return
	}
	var payload StopEasyRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, err := service.Stop(payload.WorkspaceID, payload.EasyRunID)
	if err != nil {
		writeEasyRunError(response, "stop_easy_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, run)
}
