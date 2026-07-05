package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/jsonio"
	"setta/internal/runtimeauth"
)

const workspaceTerminalWriteAuthSchemaVersion = 1

type workspaceTerminalWriteAuthState struct {
	SchemaVersion int    `json:"schemaVersion"`
	RuntimeID     string `json:"runtimeId"`
	DeviceID      string `json:"deviceId"`
	DeviceToken   string `json:"deviceToken"`
	DisplayName   string `json:"displayName"`
	CreatedAt     string `json:"createdAt"`
}

func workspaceTerminalWriteCommandAuth(ctx context.Context, appDataDir string, deps cliDeps) (serveState, string, error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		if errors.Is(err, errServeStateNotFound) {
			return serveState{}, "", newWorkspaceCLIError("setta_serve_state_missing", err)
		}
		return serveState{}, "", newWorkspaceCLIError("setta_serve_state_read_failed", err)
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return serveState{}, "", newWorkspaceCLIError("setta_serve_unreachable", err)
	}
	token, found, err := readWorkspaceTerminalWriteAuthToken(appDataDir, state.RuntimeID)
	if err != nil {
		return serveState{}, "", err
	}
	if found {
		return state, token, nil
	}
	token, err = createWorkspaceTerminalWriteAuthToken(ctx, appDataDir, state.RuntimeID)
	if err != nil {
		return serveState{}, "", err
	}
	return state, token, nil
}

func readWorkspaceTerminalWriteAuthToken(appDataDir string, runtimeID string) (string, bool, error) {
	path := workspaceTerminalWriteAuthPath(appDataDir)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", false, nil
	}
	if err != nil {
		return "", false, newWorkspaceCLIError("workspace_terminal_write_auth_read_failed", fmt.Errorf("read workspace terminal write auth state %s: %w", path, err))
	}
	var state workspaceTerminalWriteAuthState
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &state); err != nil {
		return "", false, newWorkspaceCLIError("workspace_terminal_write_auth_decode_failed", fmt.Errorf("decode workspace terminal write auth state %s: %w", path, err))
	}
	if err := validateWorkspaceTerminalWriteAuthState(state, runtimeID); err != nil {
		return "", false, newWorkspaceCLIError("workspace_terminal_write_auth_invalid", fmt.Errorf("validate workspace terminal write auth state %s: %w", path, err))
	}
	return state.DeviceToken, true, nil
}

func createWorkspaceTerminalWriteAuthToken(ctx context.Context, appDataDir string, runtimeID string) (string, error) {
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		return "", newWorkspaceCLIError("workspace_terminal_write_auth_store_open_failed", fmt.Errorf("open runtime auth store: %w", err))
	}
	defer store.Close()

	session, token, err := store.CreateDeviceSession(ctx, workspaceTerminalWritesCLIAuthDisplayName)
	if err != nil {
		return "", newWorkspaceCLIError("workspace_terminal_write_auth_session_create_failed", fmt.Errorf("create workspace terminal write device session: %w", err))
	}
	state := workspaceTerminalWriteAuthState{
		SchemaVersion: workspaceTerminalWriteAuthSchemaVersion,
		RuntimeID:     runtimeID,
		DeviceID:      session.ID,
		DeviceToken:   token,
		DisplayName:   session.DisplayName,
		CreatedAt:     session.CreatedAt,
	}
	if err := writeWorkspaceTerminalWriteAuthState(appDataDir, state); err != nil {
		_, _, _ = store.RevokeDeviceSession(context.Background(), session.ID)
		return "", err
	}
	return token, nil
}

func writeWorkspaceTerminalWriteAuthState(appDataDir string, state workspaceTerminalWriteAuthState) error {
	if err := validateWorkspaceTerminalWriteAuthState(state, state.RuntimeID); err != nil {
		return newWorkspaceCLIError("workspace_terminal_write_auth_invalid", err)
	}
	path := workspaceTerminalWriteAuthPath(appDataDir)
	runtimeDir := filepath.Dir(path)
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return newWorkspaceCLIError("workspace_terminal_write_auth_write_failed", fmt.Errorf("create workspace terminal write auth directory %s: %w", runtimeDir, err))
	}
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return newWorkspaceCLIError("workspace_terminal_write_auth_encode_failed", fmt.Errorf("marshal workspace terminal write auth state: %w", err))
	}
	payload = append(payload, '\n')
	tempFile, err := os.CreateTemp(runtimeDir, ".workspace-terminal-write-auth-*.tmp")
	if err != nil {
		return newWorkspaceCLIError("workspace_terminal_write_auth_write_failed", fmt.Errorf("create temporary workspace terminal write auth file in %s: %w", runtimeDir, err))
	}
	tempPath := tempFile.Name()
	defer func() {
		_ = os.Remove(tempPath)
	}()
	if _, err := tempFile.Write(payload); err != nil {
		_ = tempFile.Close()
		return newWorkspaceCLIError("workspace_terminal_write_auth_write_failed", fmt.Errorf("write temporary workspace terminal write auth file %s: %w", tempPath, err))
	}
	if err := tempFile.Chmod(0o600); err != nil {
		_ = tempFile.Close()
		return newWorkspaceCLIError("workspace_terminal_write_auth_write_failed", fmt.Errorf("chmod temporary workspace terminal write auth file %s: %w", tempPath, err))
	}
	if err := tempFile.Close(); err != nil {
		return newWorkspaceCLIError("workspace_terminal_write_auth_write_failed", fmt.Errorf("close temporary workspace terminal write auth file %s: %w", tempPath, err))
	}
	if err := os.Rename(tempPath, path); err != nil {
		return newWorkspaceCLIError("workspace_terminal_write_auth_write_failed", fmt.Errorf("write workspace terminal write auth state %s: %w", path, err))
	}
	return nil
}

func validateWorkspaceTerminalWriteAuthState(state workspaceTerminalWriteAuthState, runtimeID string) error {
	if state.SchemaVersion != workspaceTerminalWriteAuthSchemaVersion {
		return fmt.Errorf("unsupported schema version %d", state.SchemaVersion)
	}
	if err := validateRuntimeID(state.RuntimeID); err != nil {
		return fmt.Errorf("runtimeId is invalid: %w", err)
	}
	if state.RuntimeID != runtimeID {
		return fmt.Errorf("runtimeId = %s, want %s", state.RuntimeID, runtimeID)
	}
	if strings.TrimSpace(state.DeviceID) == "" {
		return errors.New("deviceId is required")
	}
	if strings.TrimSpace(state.DisplayName) == "" {
		return errors.New("displayName is required")
	}
	if strings.TrimSpace(state.CreatedAt) == "" {
		return errors.New("createdAt is required")
	}
	if state.DeviceToken == "" || strings.ContainsAny(state.DeviceToken, " \t\r\n") {
		return errors.New("deviceToken is required and must not contain whitespace")
	}
	return nil
}

func workspaceTerminalWriteAuthPath(appDataDir string) string {
	return filepath.Join(appDataDir, "runtime", "workspace-terminal-write-auth.json")
}
