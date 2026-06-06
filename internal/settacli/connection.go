package settacli

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"setta/internal/backendconn"
	"setta/internal/settahttpclient"
)

const missingBackendConnectionMessage = "backend connection was not found; start Setta, set SETTA_BACKEND_ADDR, or pass --backend-addr"

type backendConnection struct {
	SchemaVersion int    `json:"schemaVersion"`
	Addr          string `json:"addr"`
	Source        string `json:"source"`
	AppDataDir    string `json:"appDataDir"`
	Authenticated bool   `json:"authenticated"`
	PID           int    `json:"pid,omitempty"`
	RuntimePath   string `json:"runtimePath,omitempty"`
	StartedAt     string `json:"startedAt,omitempty"`
	Version       string `json:"version,omitempty"`
	Token         string `json:"token,omitempty"`
}

func (context *Context) cachedBackendConnection() (backendConnection, error) {
	if context.backendConnection != nil {
		return *context.backendConnection, nil
	}
	connection, err := context.resolveBackendConnection(false)
	if err != nil {
		return backendConnection{}, err
	}
	context.backendConnection = &connection
	return connection, nil
}

func (context *Context) resolveBackendConnection(requireHealth bool) (backendConnection, error) {
	if context.Globals.BackendAddr != "" {
		connection := backendConnection{
			SchemaVersion: schemaVersion,
			Addr:          context.Globals.BackendAddr,
			Source:        "flags",
			AppDataDir:    context.selectedAppDataDirOrEmpty(),
			Token:         firstNonEmpty(context.Globals.BackendToken, context.Getenv(backendconn.TokenEnv)),
		}
		return context.validateResolvedConnection(connection, requireHealth)
	}
	if addr := context.Getenv(backendconn.AddrEnv); addr != "" {
		connection := backendConnection{
			SchemaVersion: schemaVersion,
			Addr:          addr,
			Source:        "environment",
			AppDataDir:    context.selectedAppDataDirOrEmpty(),
			Token:         context.Getenv(backendconn.TokenEnv),
		}
		return context.validateResolvedConnection(connection, requireHealth)
	}
	return context.resolveRuntimeBackendConnection()
}

func (context *Context) resolveRuntimeBackendConnection() (backendConnection, error) {
	appDataDir, err := context.selectedAppDataDir()
	if err != nil {
		return backendConnection{}, err
	}
	path := backendconn.RuntimeFilePath(appDataDir)
	record, err := backendconn.ReadRuntimeFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return backendConnection{}, errors.New(missingBackendConnectionMessage)
	}
	if err != nil {
		return backendConnection{}, err
	}
	if err := backendconn.ValidateRuntimeRecord(record, path); err != nil {
		return backendConnection{}, err
	}
	connection := backendConnection{
		SchemaVersion: schemaVersion,
		Addr:          record.Addr,
		Source:        "runtime_file",
		AppDataDir:    record.AppDataDir,
		PID:           record.PID,
		RuntimePath:   path,
		StartedAt:     record.StartedAt,
		Version:       record.Version,
		Token:         record.Token,
	}
	if err := context.authenticateBackendConnection(connection); err != nil {
		return backendConnection{}, fmt.Errorf("backend runtime file %s failed health check: %w", path, err)
	}
	connection.Authenticated = true
	return connection, nil
}

func (context *Context) validateResolvedConnection(connection backendConnection, requireHealth bool) (backendConnection, error) {
	if err := backendconn.ValidateLoopbackHTTPURL(connection.Addr); err != nil {
		return backendConnection{}, fmt.Errorf("backend address is invalid: %w", err)
	}
	if requireHealth {
		if err := context.authenticateBackendConnection(connection); err != nil {
			return backendConnection{}, err
		}
		connection.Authenticated = true
	}
	return connection, nil
}

func (context *Context) authenticateBackendConnection(connection backendConnection) error {
	client, err := settahttpclient.New(connection.Addr, context.Globals.Timeout, settahttpclient.WithAuthToken(connection.Token))
	if err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(context.Globals.Timeout)
	defer cancel()
	raw, err := client.Call(ctx, "BackendHealth", nil)
	if err != nil {
		return err
	}
	var payload struct {
		OK bool `json:"ok"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return fmt.Errorf("decode backend health response: %w", err)
	}
	if !payload.OK {
		return errors.New("backend health response was not ok")
	}
	return nil
}

func (context *Context) selectedAppDataDirOrEmpty() string {
	appDataDir, err := context.selectedAppDataDir()
	if err != nil {
		return ""
	}
	return appDataDir
}

func (context *Context) selectedAppDataDir() (string, error) {
	if value := context.Getenv(backendconn.AppDataDirEnv); value != "" {
		return value, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve default app data directory: %w", err)
	}
	return filepath.Join(homeDir, ".setta"), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
