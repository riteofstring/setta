package terminal

import (
	"context"
	"errors"
	"fmt"
)

const (
	DefaultRecentOutputByteLimit = 64 * 1024
	MaxRecentOutputByteLimit     = 512 * 1024
)

func (manager *Manager) ReadPane(
	_ context.Context,
	workspaceID string,
	paneID string,
	recentOutputByteLimit int,
) (TerminalReadResult, error) {
	if err := validateAttachment(workspaceID, paneID); err != nil {
		return TerminalReadResult{}, err
	}
	limit, err := normalizeRecentOutputByteLimit(recentOutputByteLimit)
	if err != nil {
		return TerminalReadResult{}, err
	}
	manager.mu.Lock()
	sessionID, ok := manager.sessionByPane[workspacePaneKey{workspaceID: workspaceID, paneID: paneID}]
	if !ok {
		manager.mu.Unlock()
		return TerminalReadResult{}, fmt.Errorf("terminal session not found for workspace %s pane %s", workspaceID, paneID)
	}
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil {
		delete(manager.sessionByPane, workspacePaneKey{workspaceID: workspaceID, paneID: paneID})
		manager.mu.Unlock()
		return TerminalReadResult{}, fmt.Errorf("terminal session not found for workspace %s pane %s", workspaceID, paneID)
	}
	summary := terminalSession.summary()
	manager.mu.Unlock()

	recentOutput, err := manager.eventHub.recentOutput(sessionID, limit)
	if err != nil {
		return TerminalReadResult{}, err
	}
	return TerminalReadResult{
		WorkspaceID:  workspaceID,
		PaneID:       paneID,
		SessionID:    sessionID,
		Session:      summary,
		RecentOutput: recentOutput,
	}, nil
}

func normalizeRecentOutputByteLimit(limit int) (int, error) {
	if limit == 0 {
		return DefaultRecentOutputByteLimit, nil
	}
	if limit < 0 {
		return 0, errors.New("recent output byte limit must not be negative")
	}
	if limit > MaxRecentOutputByteLimit {
		return 0, fmt.Errorf("recent output byte limit exceeds %d bytes", MaxRecentOutputByteLimit)
	}
	return limit, nil
}
