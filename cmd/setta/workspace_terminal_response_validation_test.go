package main

import (
	"strings"
	"testing"

	"setta/internal/httpapi"
	"setta/internal/terminal"
	"setta/internal/workspaceui"
)

func TestValidateWorkspaceTerminalReadResponseAcceptsTerminalRecentOutput(t *testing.T) {
	response := workspaceTerminalReadValidationResponse()

	if err := validateWorkspaceTerminalReadResponse(response, "workspace_api", "workspace_pane_1"); err != nil {
		t.Fatalf("validate workspace terminal read response: %v", err)
	}
}

func TestValidateWorkspaceTerminalReadResponseRejectsMissingTerminalReadMode(t *testing.T) {
	response := workspaceTerminalReadValidationResponse()
	response.Pane.ReadModes = []workspaceui.WorkspaceUIPaneReadMode{workspaceui.WorkspaceUIPaneReadModeMetadata}

	err := validateWorkspaceTerminalReadResponse(response, "workspace_api", "workspace_pane_1")
	if err == nil || !strings.Contains(err.Error(), "terminal_recent_output") {
		t.Fatalf("validation error = %v, want missing terminal_recent_output read mode", err)
	}
}

func workspaceTerminalReadValidationResponse() httpapi.ReadWorkspaceUITerminalResponse {
	return httpapi.ReadWorkspaceUITerminalResponse{
		WorkspaceID: "workspace_api",
		Pane: workspaceui.WorkspaceUIPaneDescriptor{
			PaneID:      "workspace_pane_1",
			SurfaceID:   "workspace_surface_1",
			SurfaceKind: workspaceui.SurfaceKindTerminal,
			Title:       "Terminal",
			Focused:     true,
			Location: workspaceui.WorkspaceUIPaneLocation{
				ColumnID:  "workspace_column_1",
				PaneCount: 1,
				Weight:    1,
			},
			RuntimeState: workspacePaneRuntimeStateLayoutOnlyForValidation(),
			CanFocus:     true,
			CanMove:      true,
			ReadModes: []workspaceui.WorkspaceUIPaneReadMode{
				workspaceui.WorkspaceUIPaneReadModeMetadata,
				workspaceui.WorkspaceUIPaneReadModeTerminalRecentOutput,
			},
			WriteModes:        []workspaceui.WorkspaceUIPaneWriteMode{},
			SurfaceCloseModes: []workspaceui.WorkspaceUISurfaceCloseMode{workspaceui.WorkspaceUISurfaceCloseModeNone},
			ContentRefs: workspaceui.WorkspaceUIPaneContentRefs{
				Terminal: &workspaceui.WorkspaceUITerminalPaneContentRef{
					ProfileID: "default",
				},
			},
		},
		Terminal: terminal.TerminalReadResult{
			WorkspaceID: "workspace_api",
			PaneID:      "workspace_pane_1",
			SessionID:   "terminal_session_1",
			Session: terminal.SessionSummary{
				ID:          "terminal_session_1",
				WorkspaceID: "workspace_api",
				PaneID:      "workspace_pane_1",
				ProfileID:   "default",
				CWD:         "/tmp/workspace",
				Cols:        80,
				Rows:        24,
				Status:      terminal.SessionStatusRunning,
				CreatedAt:   "2026-07-08T12:00:00Z",
				UpdatedAt:   "2026-07-08T12:00:00Z",
			},
			RecentOutput: terminal.TerminalRecentOutputPage{
				ByteCount:     len("ready\n"),
				Chunks:        []terminal.TerminalRecentOutputChunk{workspaceTerminalReadValidationChunk()},
				Text:          "ready\n",
				TextUTF8Valid: true,
			},
		},
	}
}

func workspacePaneRuntimeStateLayoutOnlyForValidation() workspaceui.WorkspaceUIPaneRuntimeState {
	return workspaceui.WorkspaceUIPaneRuntimeState{
		Status: workspaceui.WorkspaceUIPaneRuntimeStatusLayoutOnly,
	}
}

func workspaceTerminalReadValidationChunk() terminal.TerminalRecentOutputChunk {
	return terminal.TerminalRecentOutputChunk{
		ByteCount:        len("ready\n"),
		DataBase64:       "cmVhZHkK",
		EmittedAt:        "2026-07-08T12:00:00Z",
		EventID:          "terminal_stream_1:1",
		EventOffsetBytes: 0,
		Sequence:         1,
	}
}
