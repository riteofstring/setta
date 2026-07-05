package main

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"unicode/utf8"

	"setta/internal/httpapi"
	"setta/internal/terminal"
	"setta/internal/workspaceui"
)

func validateWorkspaceTerminalReadResponse(response httpapi.ReadWorkspaceUITerminalResponse, workspaceID string, paneID string) error {
	if response.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace terminal read returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if response.Pane.PaneID != paneID {
		return fmt.Errorf("workspace terminal read returned paneId %s, want %s", response.Pane.PaneID, paneID)
	}
	if err := validateWorkspacePaneDescriptor(response.Pane); err != nil {
		return fmt.Errorf("workspace terminal read pane descriptor is invalid: %w", err)
	}
	if response.Pane.SurfaceKind != workspaceui.SurfaceKindTerminal {
		return fmt.Errorf("workspace terminal read pane surfaceKind = %s, want terminal", response.Pane.SurfaceKind)
	}
	if response.Pane.ContentRefs.Terminal == nil {
		return errors.New("workspace terminal read pane descriptor returned no terminal content ref")
	}
	if !workspacePaneReadModesContain(response.Pane.ReadModes, workspaceui.WorkspaceUIPaneReadModeTerminalRecentOutput) {
		return errors.New("workspace terminal read pane descriptor did not advertise terminal_recent_output")
	}
	if err := validateTerminalReadResult(response.Terminal, workspaceID, paneID); err != nil {
		return fmt.Errorf("workspace terminal read payload is invalid: %w", err)
	}
	return nil
}

func workspacePaneReadModesContain(readModes []workspaceui.WorkspaceUIPaneReadMode, target workspaceui.WorkspaceUIPaneReadMode) bool {
	for _, mode := range readModes {
		if mode == target {
			return true
		}
	}
	return false
}

func validateTerminalReadResult(result terminal.TerminalReadResult, workspaceID string, paneID string) error {
	if result.WorkspaceID != workspaceID {
		return fmt.Errorf("terminal read returned workspaceId %s, want %s", result.WorkspaceID, workspaceID)
	}
	if result.PaneID != paneID {
		return fmt.Errorf("terminal read returned paneId %s, want %s", result.PaneID, paneID)
	}
	if result.SessionID == "" {
		return errors.New("terminal read returned empty sessionId")
	}
	if result.Session.ID != result.SessionID {
		return fmt.Errorf("terminal read session id = %s, want %s", result.Session.ID, result.SessionID)
	}
	if result.Session.WorkspaceID != workspaceID || result.Session.PaneID != paneID {
		return fmt.Errorf("terminal read session attachment = %s/%s, want %s/%s", result.Session.WorkspaceID, result.Session.PaneID, workspaceID, paneID)
	}
	return validateTerminalRecentOutputPage(result.RecentOutput)
}

func validateTerminalRecentOutputPage(page terminal.TerminalRecentOutputPage) error {
	if err := validateTerminalRecentOutputPageCounts(page); err != nil {
		return err
	}
	data, err := decodeTerminalRecentOutputChunks(page.Chunks)
	if err != nil {
		return err
	}
	if page.ByteCount != len(data) {
		return fmt.Errorf("terminal recent output byteCount = %d, want %d", page.ByteCount, len(data))
	}
	return validateTerminalRecentOutputText(page, data)
}

func validateTerminalRecentOutputPageCounts(page terminal.TerminalRecentOutputPage) error {
	if page.ByteCount < 0 || page.DroppedBytes < 0 || page.DroppedChunks < 0 || page.OmittedBytes < 0 || page.OmittedChunks < 0 {
		return errors.New("terminal recent output returned negative counts")
	}
	if page.Chunks == nil {
		return errors.New("terminal recent output returned missing chunks array")
	}
	if page.Truncated != (page.OmittedBytes > 0 || page.OmittedChunks > 0) {
		return fmt.Errorf("terminal recent output truncated = %t does not match omitted counts", page.Truncated)
	}
	return nil
}

func decodeTerminalRecentOutputChunks(chunks []terminal.TerminalRecentOutputChunk) ([]byte, error) {
	var combined bytes.Buffer
	for index, chunk := range chunks {
		data, err := validateTerminalRecentOutputChunk(chunk)
		if err != nil {
			return nil, fmt.Errorf("terminal recent output chunk %d is invalid: %w", index, err)
		}
		_, _ = combined.Write(data)
	}
	return combined.Bytes(), nil
}

func validateTerminalRecentOutputText(page terminal.TerminalRecentOutputPage, data []byte) error {
	validUTF8 := utf8.Valid(data)
	if page.TextUTF8Valid != validUTF8 {
		return fmt.Errorf("terminal recent output textUtf8Valid = %t, want %t", page.TextUTF8Valid, validUTF8)
	}
	if validUTF8 {
		if page.Text != string(data) {
			return errors.New("terminal recent output text does not match decoded chunks")
		}
	} else if page.Text != "" {
		return errors.New("terminal recent output text must be empty when chunks are not valid UTF-8")
	}
	return nil
}

func validateTerminalRecentOutputChunk(chunk terminal.TerminalRecentOutputChunk) ([]byte, error) {
	if chunk.EventID == "" {
		return nil, errors.New("eventId is required")
	}
	if chunk.Sequence <= 0 {
		return nil, fmt.Errorf("sequence must be positive: %d", chunk.Sequence)
	}
	if chunk.EmittedAt == "" {
		return nil, errors.New("emittedAt is required")
	}
	if chunk.ByteCount <= 0 {
		return nil, fmt.Errorf("byteCount must be positive: %d", chunk.ByteCount)
	}
	if chunk.EventOffsetBytes < 0 {
		return nil, fmt.Errorf("eventOffsetBytes must not be negative: %d", chunk.EventOffsetBytes)
	}
	data, err := base64.StdEncoding.DecodeString(chunk.DataBase64)
	if err != nil {
		return nil, fmt.Errorf("dataBase64 must be valid base64: %w", err)
	}
	if len(data) != chunk.ByteCount {
		return nil, fmt.Errorf("byteCount = %d, want decoded length %d", chunk.ByteCount, len(data))
	}
	return data, nil
}
