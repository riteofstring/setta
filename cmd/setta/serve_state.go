package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/httpapi"
	"setta/internal/jsonio"
)

const serveStateSchemaVersion = 1

var errServeStateNotFound = errors.New("serve state not found")

type serveState struct {
	SchemaVersion   int    `json:"schemaVersion"`
	PID             int    `json:"pid"`
	Addr            string `json:"addr"`
	BaseURL         string `json:"baseUrl"`
	RuntimeID       string `json:"runtimeId"`
	DisplayName     string `json:"displayName"`
	ProtocolVersion int    `json:"protocolVersion"`
	StartedAt       string `json:"startedAt"`
}

func serveStatePath(appDataDir string) string {
	return filepath.Join(appDataDir, "runtime", "serve-state.json")
}

func buildServeState(
	appDataDir string,
	addr string,
	info httpapi.RuntimeInfoResponse,
	deps cliDeps,
) (serveState, error) {
	state := serveState{
		SchemaVersion:   serveStateSchemaVersion,
		PID:             deps.pid(),
		Addr:            addr,
		BaseURL:         "http://" + addr,
		RuntimeID:       info.RuntimeID,
		DisplayName:     info.DisplayName,
		ProtocolVersion: info.ProtocolVersion,
		StartedAt:       deps.now().UTC().Format(time.RFC3339Nano),
	}
	if err := validateServeState(appDataDir, state); err != nil {
		return serveState{}, err
	}
	return state, nil
}

func writeServeState(appDataDir string, state serveState) error {
	if err := validateServeState(appDataDir, state); err != nil {
		return err
	}
	path := serveStatePath(appDataDir)
	runtimeDir := filepath.Dir(path)
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return fmt.Errorf("create serve-state directory %s: %w", runtimeDir, err)
	}
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal serve state: %w", err)
	}
	payload = append(payload, '\n')
	tempFile, err := os.CreateTemp(runtimeDir, ".serve-state-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary serve-state file in %s: %w", runtimeDir, err)
	}
	tempPath := tempFile.Name()
	defer func() {
		_ = os.Remove(tempPath)
	}()
	if _, err := tempFile.Write(payload); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("write temporary serve-state file %s: %w", tempPath, err)
	}
	if err := tempFile.Chmod(0o600); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("chmod temporary serve-state file %s: %w", tempPath, err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temporary serve-state file %s: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("write serve state %s: %w", path, err)
	}
	return nil
}

func readServeState(appDataDir string) (serveState, error) {
	path := serveStatePath(appDataDir)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return serveState{}, fmt.Errorf("%w at %s; start `setta serve` with the same --app-data-dir first", errServeStateNotFound, path)
	}
	if err != nil {
		return serveState{}, fmt.Errorf("read serve state %s: %w", path, err)
	}
	var state serveState
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &state); err != nil {
		return serveState{}, fmt.Errorf("parse serve state %s: %w", path, err)
	}
	if err := validateServeState(appDataDir, state); err != nil {
		return serveState{}, fmt.Errorf("validate serve state %s: %w", path, err)
	}
	return state, nil
}

func removeServeStateIfMatches(appDataDir string, state serveState) error {
	current, err := readServeState(appDataDir)
	if err != nil {
		if errors.Is(err, errServeStateNotFound) {
			return nil
		}
		return err
	}
	if current.PID != state.PID || current.Addr != state.Addr || current.RuntimeID != state.RuntimeID {
		return nil
	}
	path := serveStatePath(appDataDir)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove serve state %s: %w", path, err)
	}
	return nil
}

func validateServeState(appDataDir string, state serveState) error {
	if err := validateServeStateAppDataDir(appDataDir); err != nil {
		return err
	}
	if err := validateServeStateProcess(state); err != nil {
		return err
	}
	if err := validateServeStateBaseURL(state.BaseURL); err != nil {
		return err
	}
	return validateServeStateRuntime(state)
}

func validateServeStateAppDataDir(appDataDir string) error {
	if appDataDir == "" {
		return errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	return nil
}

func validateServeStateProcess(state serveState) error {
	if state.SchemaVersion != serveStateSchemaVersion {
		return fmt.Errorf("unsupported serve-state schema version %d", state.SchemaVersion)
	}
	if state.PID <= 0 {
		return fmt.Errorf("serve-state pid must be positive: %d", state.PID)
	}
	if strings.TrimSpace(state.Addr) == "" {
		return errors.New("serve-state addr is required")
	}
	if strings.TrimSpace(state.StartedAt) == "" {
		return errors.New("serve-state startedAt is required")
	}
	return nil
}

func validateServeStateBaseURL(rawBaseURL string) error {
	baseURL, err := url.Parse(rawBaseURL)
	if err != nil {
		return fmt.Errorf("serve-state baseUrl is invalid: %w", err)
	}
	if baseURL.Scheme != "http" || baseURL.Host == "" || baseURL.Path != "" || baseURL.RawQuery != "" || baseURL.Fragment != "" {
		return fmt.Errorf("serve-state baseUrl must be an http origin without path or query: %s", rawBaseURL)
	}
	return nil
}

func validateServeStateRuntime(state serveState) error {
	if err := validateRuntimeID(state.RuntimeID); err != nil {
		return fmt.Errorf("serve-state runtimeId is invalid: %w", err)
	}
	if strings.TrimSpace(state.DisplayName) == "" {
		return errors.New("serve-state displayName is required")
	}
	if state.ProtocolVersion <= 0 {
		return fmt.Errorf("serve-state protocolVersion must be positive: %d", state.ProtocolVersion)
	}
	return nil
}

func verifyServeState(ctx context.Context, client *http.Client, state serveState) (httpapi.RuntimeInfoResponse, error) {
	info, err := getRuntimeInfo(ctx, client, state.BaseURL)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("setta serve is not reachable at %s: %w", state.BaseURL, err)
	}
	if info.RuntimeID != state.RuntimeID {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime at %s has id %s, but serve state records %s", state.BaseURL, info.RuntimeID, state.RuntimeID)
	}
	return info, nil
}

func getRuntimeInfo(ctx context.Context, client *http.Client, baseURL string) (httpapi.RuntimeInfoResponse, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/runtime/info", nil)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("create runtime info request: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("request runtime info: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime info status %d", response.StatusCode)
	}
	var info httpapi.RuntimeInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&info); err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("decode runtime info: %w", err)
	}
	if err := validateRuntimeID(info.RuntimeID); err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime info returned invalid runtime id: %w", err)
	}
	if strings.TrimSpace(info.DisplayName) == "" {
		return httpapi.RuntimeInfoResponse{}, errors.New("runtime info returned empty display name")
	}
	if info.ProtocolVersion <= 0 {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime info returned invalid protocol version %d", info.ProtocolVersion)
	}
	return info, nil
}

func validateRuntimeID(runtimeID string) error {
	if len(runtimeID) != 32 {
		return errors.New("must be 32 lowercase hex characters")
	}
	if _, err := hex.DecodeString(runtimeID); err != nil || strings.ToLower(runtimeID) != runtimeID {
		return errors.New("must be 32 lowercase hex characters")
	}
	return nil
}
