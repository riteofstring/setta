package httpapi

import (
	"net/http"

	"setta/internal/chat"
)

type ListApprovalsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ListApprovalsResponse struct {
	Approvals []chat.ApprovalRequest `json:"approvals"`
}

func (handler handler) listApprovals(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListApprovalsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	approvals, err := service.ListPendingApprovals(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "list_approvals_failed", err)
		return
	}
	if approvals == nil {
		approvals = []chat.ApprovalRequest{}
	}
	writeJSON(response, http.StatusOK, ListApprovalsResponse{Approvals: approvals})
}
