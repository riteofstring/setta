package httpapi

import "net/http"

func (handler handler) workspaceSession(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	writeJSON(response, http.StatusOK, service.Session())
}

func (handler handler) openWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload OpenWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	workspaceSummary, session, err := service.OpenLocalFolder(payload.RootPath)
	if err != nil {
		writeWorkspaceError(response, "open_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, OpenWorkspaceResponse{Workspace: workspaceSummary, Session: session})
}

func (handler handler) relocateWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload RelocateWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	workspaceSummary, session, err := service.Relocate(payload.ID, payload.RootPath)
	if err != nil {
		writeWorkspaceError(response, "relocate_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, OpenWorkspaceResponse{Workspace: workspaceSummary, Session: session})
}

func (handler handler) refreshWorkspaceAvailability(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload RefreshWorkspaceAvailabilityRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.RefreshAvailability(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "refresh_workspace_availability_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) selectWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload SelectWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Select(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "select_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) closeWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload CloseWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Close(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "close_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) reorderWorkspaces(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload ReorderWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Reorder(payload.IDs)
	if err != nil {
		writeWorkspaceError(response, "reorder_workspaces_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) removeRecentWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload RemoveRecentWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.RemoveRecent(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "remove_recent_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}
