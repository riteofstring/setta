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
			WriteModes: []workspaceui.WorkspaceUIPaneWriteMode{},
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
