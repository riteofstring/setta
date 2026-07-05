package terminal

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

type preparedTerminalWrite struct {
	byteCount       int
	createdAt       time.Time
	data            []byte
	deviceSessionID string
	expiresAt       time.Time
	id              string
	paneID          string
	preview         string
	sessionID       string
	sha256          string
	workspaceID     string
}

func (manager *Manager) PrepareWrite(
	_ context.Context,
	input TerminalWritePrepareInput,
) (TerminalPreparedWrite, error) {
	if err := validateAttachment(input.WorkspaceID, input.PaneID); err != nil {
		return TerminalPreparedWrite{}, err
	}
	if input.DeviceSessionID == "" {
		return TerminalPreparedWrite{}, errors.New("device session id is required")
	}
	data, dataSHA256, err := decodeAndVerifyTerminalWriteData(input)
	if err != nil {
		return TerminalPreparedWrite{}, err
	}
	preparedWriteID, err := newPreparedWriteID()
	if err != nil {
		return TerminalPreparedWrite{}, err
	}
	now := manager.clock().UTC()
	prepared := &preparedTerminalWrite{
		byteCount:       len(data),
		createdAt:       now,
		data:            data,
		deviceSessionID: input.DeviceSessionID,
		expiresAt:       now.Add(manager.preparedWriteTTL),
		id:              preparedWriteID,
		paneID:          input.PaneID,
		preview:         escapedTerminalWritePreview(data),
		sha256:          dataSHA256,
		workspaceID:     input.WorkspaceID,
	}

	manager.mu.Lock()
	manager.purgeExpiredPreparedWritesLocked(now)
	terminalSession, err := manager.runningSessionForPaneLocked(input.WorkspaceID, input.PaneID)
	if err != nil {
		manager.mu.Unlock()
		return TerminalPreparedWrite{}, err
	}
	prepared.sessionID = terminalSession.id
	manager.preparedWrites[prepared.id] = prepared
	result := prepared.result()
	manager.mu.Unlock()
	return result, nil
}

func (manager *Manager) CommitPreparedWrite(
	ctx context.Context,
	input TerminalWriteCommitInput,
) (TerminalWriteCommitResult, error) {
	sha256Hex, err := validateTerminalWriteCommitInput(input)
	if err != nil {
		return TerminalWriteCommitResult{}, err
	}
	now := manager.clock().UTC()
	terminalSession, prepared, result, data, err := manager.prepareTerminalWriteCommit(input, sha256Hex, now)
	if err != nil {
		return TerminalWriteCommitResult{}, err
	}

	written, err := manager.writeSessionInput(ctx, terminalSession, data)
	if err != nil {
		return TerminalWriteCommitResult{}, fmt.Errorf(
			"commit prepared terminal write %s wrote %d of %d bytes: %w",
			prepared.id,
			written,
			len(data),
			err,
		)
	}
	result.WrittenByteCount = written
	return result, nil
}

func validateTerminalWriteCommitInput(input TerminalWriteCommitInput) (string, error) {
	if input.PreparedWriteID == "" {
		return "", errors.New("prepared write id is required")
	}
	if input.DeviceSessionID == "" {
		return "", errors.New("device session id is required")
	}
	return normalizeSHA256(input.SHA256)
}

func (manager *Manager) prepareTerminalWriteCommit(
	input TerminalWriteCommitInput,
	sha256Hex string,
	now time.Time,
) (*session, *preparedTerminalWrite, TerminalWriteCommitResult, []byte, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	prepared := manager.preparedWrites[input.PreparedWriteID]
	if prepared == nil {
		return nil, nil, TerminalWriteCommitResult{}, nil, fmt.Errorf("prepared terminal write not found: %s", input.PreparedWriteID)
	}
	if !now.Before(prepared.expiresAt) {
		delete(manager.preparedWrites, prepared.id)
		return nil, nil, TerminalWriteCommitResult{}, nil, fmt.Errorf("prepared terminal write expired: %s", prepared.id)
	}
	if err := prepared.validateCommitTarget(input, sha256Hex); err != nil {
		return nil, nil, TerminalWriteCommitResult{}, nil, err
	}
	terminalSession, err := manager.preparedWriteSessionLocked(prepared)
	if err != nil {
		delete(manager.preparedWrites, prepared.id)
		return nil, nil, TerminalWriteCommitResult{}, nil, err
	}
	if input.ValidateTarget != nil {
		err := input.ValidateTarget(TerminalWriteCommitTarget{
			WorkspaceID: prepared.workspaceID,
			PaneID:      prepared.paneID,
			SessionID:   terminalSession.id,
		})
		if err != nil {
			delete(manager.preparedWrites, prepared.id)
			return nil, nil, TerminalWriteCommitResult{}, nil, fmt.Errorf("prepared terminal write %s target validation failed: %w", prepared.id, err)
		}
	}
	delete(manager.preparedWrites, prepared.id)
	result := prepared.commitResult()
	data := append([]byte{}, prepared.data...)
	return terminalSession, prepared, result, data, nil
}

func (prepared *preparedTerminalWrite) validateCommitTarget(input TerminalWriteCommitInput, sha256Hex string) error {
	if input.WorkspaceID == "" {
		return errors.New("workspace id is required")
	}
	if prepared.workspaceID != input.WorkspaceID {
		return fmt.Errorf("prepared terminal write %s belongs to workspace %s, not %s", prepared.id, prepared.workspaceID, input.WorkspaceID)
	}
	if prepared.deviceSessionID != input.DeviceSessionID {
		return fmt.Errorf("prepared terminal write %s belongs to a different device session", prepared.id)
	}
	if prepared.sha256 != sha256Hex {
		return fmt.Errorf("prepared terminal write %s sha256 mismatch", prepared.id)
	}
	return nil
}

func decodeAndVerifyTerminalWriteData(input TerminalWritePrepareInput) ([]byte, string, error) {
	if input.DataBase64 == "" {
		return nil, "", errors.New("terminal write dataBase64 is required")
	}
	data, err := base64.StdEncoding.DecodeString(input.DataBase64)
	if err != nil {
		return nil, "", fmt.Errorf("terminal write dataBase64 is invalid: %w", err)
	}
	if len(data) == 0 {
		return nil, "", errors.New("terminal write data is required")
	}
	if len(data) > MaxInputBytes {
		return nil, "", fmt.Errorf("terminal input exceeds %d bytes", MaxInputBytes)
	}
	if input.ByteCount != len(data) {
		return nil, "", fmt.Errorf("terminal write byteCount = %d, want %d", input.ByteCount, len(data))
	}
	expectedSHA256, err := normalizeSHA256(input.SHA256)
	if err != nil {
		return nil, "", err
	}
	actualSHA256 := terminalWriteSHA256(data)
	if expectedSHA256 != actualSHA256 {
		return nil, "", fmt.Errorf("terminal write sha256 mismatch: got %s for decoded bytes, want %s", actualSHA256, expectedSHA256)
	}
	return data, actualSHA256, nil
}

func normalizeSHA256(value string) (string, error) {
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != sha256.Size {
		return "", fmt.Errorf("terminal write sha256 must be a lowercase %d-byte hex digest", sha256.Size)
	}
	if value != strings.ToLower(value) {
		return "", fmt.Errorf("terminal write sha256 must be a lowercase %d-byte hex digest", sha256.Size)
	}
	return value, nil
}

func terminalWriteSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func escapedTerminalWritePreview(data []byte) string {
	var builder strings.Builder
	for _, b := range data {
		switch b {
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		case '\\':
			builder.WriteString(`\\`)
		default:
			if b >= 0x20 && b <= 0x7e {
				builder.WriteByte(b)
			} else {
				builder.WriteString(`\x`)
				builder.WriteString(hex.EncodeToString([]byte{b}))
			}
		}
	}
	return builder.String()
}

func (manager *Manager) writeSessionInput(
	ctx context.Context,
	terminalSession *session,
	data []byte,
) (int, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	terminalSession.writeMu.Lock()
	defer terminalSession.writeMu.Unlock()

	written := 0
	for written < len(data) {
		select {
		case <-ctx.Done():
			return written, ctx.Err()
		default:
		}
		remaining := len(data) - written
		count, err := terminalSession.handle.Write(data[written:])
		if count < 0 || count > remaining {
			return written, fmt.Errorf("write terminal input returned invalid byte count %d for %d remaining bytes", count, remaining)
		}
		written += count
		if err != nil {
			return written, fmt.Errorf("write terminal input: %w", err)
		}
		if count == 0 {
			return written, io.ErrShortWrite
		}
	}
	return written, nil
}

func (manager *Manager) runningSessionForPaneLocked(workspaceID string, paneID string) (*session, error) {
	sessionID, ok := manager.sessionByPane[workspacePaneKey{workspaceID: workspaceID, paneID: paneID}]
	if !ok {
		return nil, fmt.Errorf("terminal session not found for workspace %s pane %s", workspaceID, paneID)
	}
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil {
		delete(manager.sessionByPane, workspacePaneKey{workspaceID: workspaceID, paneID: paneID})
		return nil, fmt.Errorf("terminal session not found for workspace %s pane %s", workspaceID, paneID)
	}
	if terminalSession.status != SessionStatusRunning && terminalSession.status != SessionStatusStarting {
		return nil, fmt.Errorf("terminal session %s is not running: %s", sessionID, terminalSession.status)
	}
	return terminalSession, nil
}

func (manager *Manager) preparedWriteSessionLocked(prepared *preparedTerminalWrite) (*session, error) {
	currentSessionID, ok := manager.sessionByPane[workspacePaneKey{workspaceID: prepared.workspaceID, paneID: prepared.paneID}]
	if !ok || currentSessionID != prepared.sessionID {
		return nil, fmt.Errorf(
			"prepared terminal write %s target changed for workspace %s pane %s",
			prepared.id,
			prepared.workspaceID,
			prepared.paneID,
		)
	}
	terminalSession := manager.sessionByID[prepared.sessionID]
	if terminalSession == nil {
		delete(manager.sessionByPane, workspacePaneKey{workspaceID: prepared.workspaceID, paneID: prepared.paneID})
		return nil, fmt.Errorf("prepared terminal write %s target session is gone", prepared.id)
	}
	if terminalSession.status != SessionStatusRunning && terminalSession.status != SessionStatusStarting {
		return nil, fmt.Errorf(
			"prepared terminal write %s target session %s is not running: %s",
			prepared.id,
			prepared.sessionID,
			terminalSession.status,
		)
	}
	return terminalSession, nil
}

func (manager *Manager) purgeExpiredPreparedWritesLocked(now time.Time) {
	for id, prepared := range manager.preparedWrites {
		if !now.Before(prepared.expiresAt) {
			delete(manager.preparedWrites, id)
		}
	}
}

func (prepared *preparedTerminalWrite) result() TerminalPreparedWrite {
	return TerminalPreparedWrite{
		PreparedWriteID: prepared.id,
		WorkspaceID:     prepared.workspaceID,
		PaneID:          prepared.paneID,
		SessionID:       prepared.sessionID,
		DeviceSessionID: prepared.deviceSessionID,
		ByteCount:       prepared.byteCount,
		SHA256:          prepared.sha256,
		Preview:         prepared.preview,
		CreatedAt:       prepared.createdAt.UTC().Format(time.RFC3339Nano),
		ExpiresAt:       prepared.expiresAt.UTC().Format(time.RFC3339Nano),
	}
}

func (prepared *preparedTerminalWrite) commitResult() TerminalWriteCommitResult {
	return TerminalWriteCommitResult{
		PreparedWriteID: prepared.id,
		WorkspaceID:     prepared.workspaceID,
		PaneID:          prepared.paneID,
		SessionID:       prepared.sessionID,
		DeviceSessionID: prepared.deviceSessionID,
		ByteCount:       prepared.byteCount,
		SHA256:          prepared.sha256,
	}
}

func newPreparedWriteID() (string, error) {
	var randomBytes [16]byte
	if _, err := rand.Read(randomBytes[:]); err != nil {
		return "", fmt.Errorf("generate prepared terminal write id: %w", err)
	}
	return "terminal_write_" + hex.EncodeToString(randomBytes[:]), nil
}
