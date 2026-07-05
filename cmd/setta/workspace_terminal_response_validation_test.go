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
	response.Pane.ReadModes = []workspaceui.WorkspaceUIPaneReadMode{
		workspaceui.WorkspaceUIPaneReadModeMetadata,
		workspaceui.WorkspaceUIPaneReadModeTerminalScreen,
	}

	err := validateWorkspaceTerminalReadResponse(response, "workspace_api", "workspace_pane_1")
	if err == nil || !strings.Contains(err.Error(), "terminal_recent_output") {
		t.Fatalf("validation error = %v, want missing terminal_recent_output read mode", err)
	}
}

func TestValidateWorkspaceTerminalReadResponseRejectsMissingTerminalScreenMode(t *testing.T) {
	response := workspaceTerminalReadValidationResponse()
	response.Pane.ReadModes = []workspaceui.WorkspaceUIPaneReadMode{
		workspaceui.WorkspaceUIPaneReadModeMetadata,
		workspaceui.WorkspaceUIPaneReadModeTerminalRecentOutput,
	}

	err := validateWorkspaceTerminalReadResponse(response, "workspace_api", "workspace_pane_1")
	if err == nil || !strings.Contains(err.Error(), "terminal_screen") {
		t.Fatalf("validation error = %v, want missing terminal_screen read mode", err)
	}
}

func TestValidateWorkspaceTerminalReadResponseRejectsMismatchedScreenText(t *testing.T) {
	response := workspaceTerminalReadValidationResponse()
	response.Terminal.Screen.ScreenText = "ready"

	err := validateWorkspaceTerminalReadResponse(response, "workspace_api", "workspace_pane_1")
	if err == nil || !strings.Contains(err.Error(), "screenText") {
		t.Fatalf("validation error = %v, want mismatched screenText", err)
	}
}

func TestValidateWorkspaceTerminalWritePrepareResponseAcceptsPreparedWrite(t *testing.T) {
	response := workspaceTerminalWritePrepareValidationResponse()

	if err := validateWorkspaceTerminalWritePrepareResponse(response, "workspace_api", "workspace_pane_1", workspaceTerminalWriteValidationSHA256()); err != nil {
		t.Fatalf("validate terminal write prepare response: %v", err)
	}
}

func TestValidateWorkspaceTerminalWritePrepareResponseRejectsMissingWriteMode(t *testing.T) {
	response := workspaceTerminalWritePrepareValidationResponse()
	response.Pane.WriteModes = []workspaceui.WorkspaceUIPaneWriteMode{}

	err := validateWorkspaceTerminalWritePrepareResponse(response, "workspace_api", "workspace_pane_1", workspaceTerminalWriteValidationSHA256())
	if err == nil || !strings.Contains(err.Error(), "terminal_input") {
		t.Fatalf("validation error = %v, want missing terminal_input write mode", err)
	}
}

func TestValidateWorkspaceTerminalWriteCommitResponseRejectsShortWrite(t *testing.T) {
	response := workspaceTerminalWriteCommitValidationResponse()
	response.PreparedWrite.WrittenByteCount = 4

	err := validateWorkspaceTerminalWriteCommitResponse(response, "workspace_api", "terminal_write_1", workspaceTerminalWriteValidationSHA256())
	if err == nil || !strings.Contains(err.Error(), "wrote 4 bytes") {
		t.Fatalf("validation error = %v, want short write rejection", err)
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
				workspaceui.WorkspaceUIPaneReadModeTerminalScreen,
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
				Cols:        8,
				Rows:        2,
				Status:      terminal.SessionStatusRunning,
				CreatedAt:   "2026-07-08T12:00:00Z",
				UpdatedAt:   "2026-07-08T12:00:00Z",
			},
			Screen: terminal.TerminalScreenSnapshot{
				Cols: 8,
				Rows: 2,
				Cursor: terminal.TerminalCursorPosition{
					Row:    1,
					Column: 0,
				},
				Lines:      []string{"ready   ", "        "},
				ScreenText: "ready   \n        ",
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

func workspaceTerminalWritePrepareValidationResponse() httpapi.PrepareWorkspaceUITerminalWriteResponse {
	return httpapi.PrepareWorkspaceUITerminalWriteResponse{
		WorkspaceID: "workspace_api",
		Pane:        workspaceTerminalWriteValidationPane(),
		PreparedWrite: terminal.TerminalPreparedWrite{
			PreparedWriteID: "terminal_write_1",
			WorkspaceID:     "workspace_api",
			PaneID:          "workspace_pane_1",
			SessionID:       "terminal_session_1",
			DeviceSessionID: "device_cli",
			ByteCount:       6,
			SHA256:          workspaceTerminalWriteValidationSHA256(),
			Preview:         `ready\n`,
			CreatedAt:       "2026-07-08T12:00:00Z",
			ExpiresAt:       "2026-07-08T12:02:00Z",
		},
	}
}

func workspaceTerminalWriteCommitValidationResponse() httpapi.CommitWorkspaceUITerminalWriteResponse {
	return httpapi.CommitWorkspaceUITerminalWriteResponse{
		PreparedWrite: terminal.TerminalWriteCommitResult{
			PreparedWriteID:  "terminal_write_1",
			WorkspaceID:      "workspace_api",
			PaneID:           "workspace_pane_1",
			SessionID:        "terminal_session_1",
			DeviceSessionID:  "device_cli",
			ByteCount:        6,
			SHA256:           workspaceTerminalWriteValidationSHA256(),
			WrittenByteCount: 6,
		},
	}
}

func workspaceTerminalWriteValidationPane() workspaceui.WorkspaceUIPaneDescriptor {
	response := workspaceTerminalReadValidationResponse()
	pane := response.Pane
	pane.WriteModes = []workspaceui.WorkspaceUIPaneWriteMode{
		workspaceui.WorkspaceUIPaneWriteModeTerminalInput,
	}
	return pane
}

func workspaceTerminalWriteValidationSHA256() string {
	return "d2db9244c9d334b210c940ea899c97d08ec700d9baf2186fc942d67e1868a824"
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
