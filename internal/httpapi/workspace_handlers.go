package httpapi

import (
	"net/http"

	"setta/internal/workspaceui"
)

func (handler handler) workspaceSession(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	writeJSON(response, http.StatusOK, service.Session())
}

func (handler handler) workspaceSelectedConversations(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	writeJSON(response, http.StatusOK, WorkspaceSelectedConversations{
		SelectedConversationIDsByWorkspaceID: service.SelectedConversationIDs(),
	})
}

func (handler handler) setWorkspaceSelectedConversation(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload SetWorkspaceSelectedConversationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	selected, err := service.SetSelectedConversation(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeWorkspaceError(response, "set_workspace_selected_conversation_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, WorkspaceSelectedConversations{
		SelectedConversationIDsByWorkspaceID: selected,
	})
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

func (handler handler) readWorkspaceUISchema(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	writeJSON(response, http.StatusOK, service.Schema())
}

func (handler handler) listWorkspaceUIPanes(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload ListWorkspaceUIPanesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	panes, err := service.ListPanes(payload.WorkspaceID)
	if err != nil {
		writeWorkspaceUIError(response, "list_workspace_ui_panes_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, panes)
}

func (handler handler) readWorkspaceUIPane(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload ReadWorkspaceUIPaneRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	pane, err := service.ReadPane(payload.WorkspaceID, payload.PaneID)
	if err != nil {
		writeWorkspaceUIError(response, "read_workspace_ui_pane_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, pane)
}

func (handler handler) applyWorkspaceUIPaneOperation(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload ApplyWorkspaceUIPaneOperationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ApplyPaneOperation(payload.WorkspaceID, payload.Operation)
	if err != nil {
		writeWorkspaceUIError(response, "apply_workspace_ui_pane_operation_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) applyWorkspaceUILayoutOperations(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload ApplyWorkspaceUILayoutOperationsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ApplyLayoutOperations(payload.WorkspaceID, workspaceui.WorkspaceUILayoutOperations{
		Operations: payload.Operations,
	})
	if err != nil {
		writeWorkspaceUIError(response, "apply_workspace_ui_layout_operations_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) readWorkspaceUILayout(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload ReadWorkspaceUILayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	layout, err := service.ReadLayout(payload.WorkspaceID)
	if err != nil {
		writeWorkspaceUIError(response, "read_workspace_ui_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}

func (handler handler) initializeWorkspaceUILayout(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload InitializeWorkspaceUILayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	layout, err := service.InitializeLayout(payload.WorkspaceID)
	if err != nil {
		writeWorkspaceUIError(response, "initialize_workspace_ui_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}

func (handler handler) resetWorkspaceUILayout(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	var payload ResetWorkspaceUILayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	layout, err := service.ResetLayout(payload.WorkspaceID)
	if err != nil {
		writeWorkspaceUIError(response, "reset_workspace_ui_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}
