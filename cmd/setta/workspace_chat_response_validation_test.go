package main

import (
	"strings"
	"testing"

	"setta/internal/chat"
	"setta/internal/httpapi"
	"setta/internal/workspaceui"
)

func TestValidateWorkspaceChatReadResponseAcceptsValidResponse(t *testing.T) {
	response := validWorkspaceChatReadResponseForTest()

	if err := validateWorkspaceChatReadResponse(response, "workspace_api", "workspace_pane_0"); err != nil {
		t.Fatalf("validate response: %v", err)
	}
}

func TestValidateWorkspaceChatReadResponseRejectsMissingChatReadMode(t *testing.T) {
	response := validWorkspaceChatReadResponseForTest()
	response.Pane.ReadModes = []workspaceui.WorkspaceUIPaneReadMode{workspaceui.WorkspaceUIPaneReadModeMetadata}

	err := validateWorkspaceChatReadResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "chat_state") {
		t.Fatalf("error = %v, want missing chat_state", err)
	}
}

func TestValidateWorkspaceChatReadResponseRejectsMismatchedConversation(t *testing.T) {
	response := validWorkspaceChatReadResponseForTest()
	response.Page.Conversation.ID = "conversation_other"

	err := validateWorkspaceChatReadResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "page conversation id") {
		t.Fatalf("error = %v, want page conversation mismatch", err)
	}
}

func TestValidateWorkspaceChatReadResponseRejectsActiveRunWithoutMatchingLiveness(t *testing.T) {
	response := validWorkspaceChatReadResponseForTest()
	response.ActiveRun = &chat.Run{
		ID:             "run_active",
		WorkspaceID:    "workspace_api",
		ConversationID: "conversation_api",
		Status:         chat.RunStatusRunning,
	}
	response.ActiveRunLiveness = &chat.RunLiveness{
		WorkspaceID:    "workspace_api",
		ConversationID: "conversation_api",
		RunID:          "run_other",
	}

	err := validateWorkspaceChatReadResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "active run liveness target") {
		t.Fatalf("error = %v, want liveness target mismatch", err)
	}
}

func TestValidateWorkspaceChatSendResponseAcceptsValidResponse(t *testing.T) {
	response := validWorkspaceChatSendResponseForTest()

	if err := validateWorkspaceChatSendResponse(response, "workspace_api", "workspace_pane_0"); err != nil {
		t.Fatalf("validate send response: %v", err)
	}
}

func TestValidateWorkspaceChatSendResponseRejectsMissingChatSendMode(t *testing.T) {
	response := validWorkspaceChatSendResponseForTest()
	response.Pane.WriteModes = []workspaceui.WorkspaceUIPaneWriteMode{}

	err := validateWorkspaceChatSendResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "chat_send") {
		t.Fatalf("error = %v, want missing chat_send", err)
	}
}

func TestValidateWorkspaceChatSendResponseRejectsMismatchedResultConversation(t *testing.T) {
	response := validWorkspaceChatSendResponseForTest()
	response.Result.Run.ConversationID = "conversation_other"

	err := validateWorkspaceChatSendResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "workspace chat send run") {
		t.Fatalf("error = %v, want send run target mismatch", err)
	}
}

func TestValidateWorkspaceChatQueueResponseAcceptsValidResponse(t *testing.T) {
	response := validWorkspaceChatQueueResponseForTest()

	if err := validateWorkspaceChatQueueResponse(response, "workspace_api", "workspace_pane_0"); err != nil {
		t.Fatalf("validate queue response: %v", err)
	}
}

func TestValidateWorkspaceChatQueueResponseRejectsMissingChatQueueMode(t *testing.T) {
	response := validWorkspaceChatQueueResponseForTest()
	response.Pane.WriteModes = []workspaceui.WorkspaceUIPaneWriteMode{workspaceui.WorkspaceUIPaneWriteModeChatSend}

	err := validateWorkspaceChatQueueResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "chat_queue") {
		t.Fatalf("error = %v, want missing chat_queue", err)
	}
}

func TestValidateWorkspaceChatQueueResponseRejectsPromotedRun(t *testing.T) {
	response := validWorkspaceChatQueueResponseForTest()
	response.Result.Run.Status = chat.RunStatusRunning

	err := validateWorkspaceChatQueueResponse(response, "workspace_api", "workspace_pane_0")
	if err == nil || !strings.Contains(err.Error(), "want queued") {
		t.Fatalf("error = %v, want queued status validation", err)
	}
}

func validWorkspaceChatReadResponseForTest() httpapi.ReadWorkspaceUIChatResponse {
	return httpapi.ReadWorkspaceUIChatResponse{
		WorkspaceID:    "workspace_api",
		ConversationID: "conversation_api",
		Pane: workspaceui.WorkspaceUIPaneDescriptor{
			PaneID:      "workspace_pane_0",
			SurfaceID:   "workspace_surface_0",
			SurfaceKind: workspaceui.SurfaceKindChatDOM,
			Title:       "Chat",
			Subtitle:    "workspace chat",
			Location: workspaceui.WorkspaceUIPaneLocation{
				ColumnID:       "workspace_column_0",
				ColumnIndex:    0,
				IdealWidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
				PaneIndex:      0,
				PaneCount:      1,
				PlaneIndex:     0,
				Sequence:       0,
				SlotIndex:      0,
				Weight:         1.6,
				WidthSpec:      workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
			},
			RuntimeState: workspaceui.WorkspaceUIPaneRuntimeState{
				Status: workspaceui.WorkspaceUIPaneRuntimeStatusLayoutOnly,
			},
			SurfaceCloseModes: []workspaceui.WorkspaceUISurfaceCloseMode{workspaceui.WorkspaceUISurfaceCloseModeNone},
			ReadModes: []workspaceui.WorkspaceUIPaneReadMode{
				workspaceui.WorkspaceUIPaneReadModeMetadata,
				workspaceui.WorkspaceUIPaneReadModeChatState,
			},
			WriteModes: []workspaceui.WorkspaceUIPaneWriteMode{
				workspaceui.WorkspaceUIPaneWriteModeChatSend,
				workspaceui.WorkspaceUIPaneWriteModeChatQueue,
			},
			ContentRefs: workspaceui.WorkspaceUIPaneContentRefs{
				Chat: &workspaceui.WorkspaceUIChatPaneContentRef{ConversationID: "conversation_api"},
			},
		},
		Page: chat.MessagePage{
			Conversation: chat.Conversation{
				ID:          "conversation_api",
				WorkspaceID: "workspace_api",
			},
			Messages: []chat.ChatMessage{},
			Queue: chat.QueueState{
				Messages: []chat.ChatMessage{},
				Runs:     []chat.Run{},
			},
			Blocks: []chat.TranscriptBlock{},
		},
	}
}

func validWorkspaceChatSendResponseForTest() httpapi.SendWorkspaceUIChatResponse {
	read := validWorkspaceChatReadResponseForTest()
	user := workspaceChatResponseTestMessage("message_user", "run_api", chat.RoleUser, chat.MessageDeliveryNormal)
	assistant := workspaceChatResponseTestMessage("message_assistant", "run_api", chat.RoleAssistant, chat.MessageDeliveryNormal)
	return httpapi.SendWorkspaceUIChatResponse{
		WorkspaceID:    read.WorkspaceID,
		ConversationID: read.ConversationID,
		Pane:           read.Pane,
		Result: chat.SendMessageResult{
			Conversation:     read.Page.Conversation,
			UserMessage:      user,
			AssistantMessage: assistant,
			Run: chat.Run{
				ID:                 "run_api",
				WorkspaceID:        "workspace_api",
				ConversationID:     "conversation_api",
				TriggerMessageID:   user.ID,
				AssistantMessageID: assistant.ID,
				Status:             chat.RunStatusRunning,
			},
			Page: read.Page,
		},
	}
}

func validWorkspaceChatQueueResponseForTest() httpapi.QueueWorkspaceUIChatResponse {
	read := validWorkspaceChatReadResponseForTest()
	user := workspaceChatResponseTestMessage("message_queued", "run_queued", chat.RoleUser, chat.MessageDeliveryQueued)
	run := chat.Run{
		ID:               "run_queued",
		WorkspaceID:      "workspace_api",
		ConversationID:   "conversation_api",
		TriggerMessageID: user.ID,
		Status:           chat.RunStatusQueued,
	}
	page := read.Page
	page.Queue = chat.QueueState{
		Messages: []chat.ChatMessage{user},
		Runs:     []chat.Run{run},
	}
	return httpapi.QueueWorkspaceUIChatResponse{
		WorkspaceID:    read.WorkspaceID,
		ConversationID: read.ConversationID,
		Pane:           read.Pane,
		Result: chat.QueueMessageResult{
			Conversation: read.Page.Conversation,
			UserMessage:  user,
			Run:          run,
			Queue:        page.Queue,
			Page:         page,
		},
	}
}

func workspaceChatResponseTestMessage(id string, runID string, role chat.MessageRole, delivery chat.MessageDelivery) chat.ChatMessage {
	return chat.ChatMessage{
		ID:             id,
		ConversationID: "conversation_api",
		RunID:          runID,
		Role:           role,
		Delivery:       delivery,
		Status:         chat.MessageStatusComplete,
		Parts:          []chat.MessagePart{},
	}
}
