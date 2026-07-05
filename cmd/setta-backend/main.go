package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"setta/internal/httpapi"
	"setta/internal/runtime"
)

const backendServeStateSchemaVersion = 1

type backendServeState struct {
	SchemaVersion   int    `json:"schemaVersion"`
	PID             int    `json:"pid"`
	Addr            string `json:"addr"`
	BaseURL         string `json:"baseUrl"`
	RuntimeID       string `json:"runtimeId"`
	DisplayName     string `json:"displayName"`
	ProtocolVersion int    `json:"protocolVersion"`
	StartedAt       string `json:"startedAt"`
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(args []string, stdout io.Writer, stderr io.Writer, getenv func(string) string) int {
	config, err := configFromArgs(args, stdout, stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	readyOutput := config.Stdout
	var readyBuffer bytes.Buffer
	config.Stdout = &readyBuffer
	server, err := runtime.Start(ctx, config)
	if err != nil {
		fmt.Fprintf(stderr, "start backend: %v\n", err)
		return 1
	}
	closeOnFailure := true
	defer func() {
		if closeOnFailure {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
			_ = server.Shutdown(shutdownCtx)
			_ = server.Wait()
			cancel()
		}
	}()
	readyPayload := append([]byte(nil), readyBuffer.Bytes()...)
	ready, err := decodeBackendReadyEvent(bytes.NewReader(readyPayload))
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 1
	}
	serveState, err := publishBackendServeState(ctx, config.AppDataDir, ready)
	if err != nil {
		fmt.Fprintf(stderr, "publish serve state: %v\n", err)
		return 1
	}
	if _, err := readyOutput.Write(readyPayload); err != nil {
		_ = removeBackendServeStateIfMatches(config.AppDataDir, serveState)
		fmt.Fprintf(stderr, "write ready event: %v\n", err)
		return 1
	}
	closeOnFailure = false

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()

	var shutdownErr error
	if err := removeBackendServeStateIfMatches(config.AppDataDir, serveState); err != nil {
		shutdownErr = err
	}
	if err := server.Shutdown(shutdownCtx); err != nil {
		shutdownErr = firstError(shutdownErr, fmt.Errorf("shutdown backend: %w", err))
	}
	if err := server.Wait(); err != nil {
		shutdownErr = firstError(shutdownErr, fmt.Errorf("wait for backend: %w", err))
	}
	if shutdownErr != nil {
		fmt.Fprintf(stderr, "%v\n", shutdownErr)
		return 1
	}
	return 0
}

func decodeBackendReadyEvent(reader io.Reader) (runtime.ReadyEvent, error) {
	var ready runtime.ReadyEvent
	if err := json.NewDecoder(reader).Decode(&ready); err != nil {
		return runtime.ReadyEvent{}, fmt.Errorf("decode runtime ready event: %w", err)
	}
	if ready.Event != "ready" {
		return runtime.ReadyEvent{}, fmt.Errorf("runtime ready event = %q, want ready", ready.Event)
	}
	if ready.Addr == "" {
		return runtime.ReadyEvent{}, fmt.Errorf("runtime ready event did not include an address")
	}
	return ready, nil
}

func publishBackendServeState(ctx context.Context, appDataDir string, ready runtime.ReadyEvent) (backendServeState, error) {
	baseURL := "http://" + ready.Addr
	info, err := getBackendRuntimeInfo(ctx, baseURL)
	if err != nil {
		return backendServeState{}, err
	}
	state := backendServeState{
		SchemaVersion:   backendServeStateSchemaVersion,
		PID:             os.Getpid(),
		Addr:            ready.Addr,
		BaseURL:         baseURL,
		RuntimeID:       info.RuntimeID,
		DisplayName:     info.DisplayName,
		ProtocolVersion: info.ProtocolVersion,
		StartedAt:       time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := validateBackendServeState(state); err != nil {
		return backendServeState{}, err
	}
	if err := writeBackendServeState(appDataDir, state); err != nil {
		return backendServeState{}, err
	}
	return state, nil
}

func getBackendRuntimeInfo(ctx context.Context, baseURL string) (httpapi.RuntimeInfoResponse, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/runtime/info", nil)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("create runtime info request: %w", err)
	}
	client := http.Client{Timeout: 5 * time.Second}
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
	if info.RuntimeID == "" {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime info returned empty runtime id")
	}
	if info.DisplayName == "" {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime info returned empty display name")
	}
	if info.ProtocolVersion <= 0 {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime info returned invalid protocol version %d", info.ProtocolVersion)
	}
	return info, nil
}

func writeBackendServeState(appDataDir string, state backendServeState) error {
	if err := validateBackendServeState(state); err != nil {
		return err
	}
	path := backendServeStatePath(appDataDir)
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

func removeBackendServeStateIfMatches(appDataDir string, expected backendServeState) error {
	path := backendServeStatePath(appDataDir)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read serve state %s: %w", path, err)
	}
	var current backendServeState
	if err := json.Unmarshal(data, &current); err != nil {
		return fmt.Errorf("parse serve state %s: %w", path, err)
	}
	if current.PID != expected.PID || current.Addr != expected.Addr || current.RuntimeID != expected.RuntimeID {
		return nil
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove serve state %s: %w", path, err)
	}
	return nil
}

func backendServeStatePath(appDataDir string) string {
	return filepath.Join(appDataDir, "runtime", "serve-state.json")
}

func validateBackendServeState(state backendServeState) error {
	if state.SchemaVersion != backendServeStateSchemaVersion {
		return fmt.Errorf("unsupported serve-state schema version %d", state.SchemaVersion)
	}
	if state.PID <= 0 {
		return fmt.Errorf("serve-state pid must be positive: %d", state.PID)
	}
	if state.Addr == "" {
		return fmt.Errorf("serve-state addr is required")
	}
	if state.BaseURL == "" {
		return fmt.Errorf("serve-state baseUrl is required")
	}
	if state.RuntimeID == "" {
		return fmt.Errorf("serve-state runtimeId is required")
	}
	if state.DisplayName == "" {
		return fmt.Errorf("serve-state displayName is required")
	}
	if state.ProtocolVersion <= 0 {
		return fmt.Errorf("serve-state protocolVersion must be positive")
	}
	if state.StartedAt == "" {
		return fmt.Errorf("serve-state startedAt is required")
	}
	return nil
}

func firstError(current error, next error) error {
	if current != nil {
		return current
	}
	return next
}

func configFromArgs(args []string, stdout io.Writer, stderr io.Writer, getenv func(string) string) (runtime.Config, error) {
	config := runtime.DefaultConfig()
	config.Stdout = stdout
	config.Stderr = stderr

	port, err := defaultPort(getenv("SETTA_BACKEND_PORT"))
	if err != nil {
		return config, err
	}
	allowRemote, err := defaultBool(getenv("SETTA_BACKEND_ALLOW_REMOTE"), "SETTA_BACKEND_ALLOW_REMOTE")
	if err != nil {
		return config, err
	}
	appDataDir, err := defaultAppDataDir(getenv)
	if err != nil {
		return config, err
	}

	flagSet := flag.NewFlagSet("setta-backend", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.AppDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.BoolVar(&config.AllowRemote, "allow-remote", allowRemote, "allow binding to non-loopback numeric IP addresses")
	flagSet.StringVar(&config.BundledSettaCLIDir, "bundled-cli-dir", envOrDefault(getenv, "SETTA_BUNDLED_SETTA_CLI_DIR", config.BundledSettaCLIDir), "directory containing the bundled setta CLI executable for workflow agents")
	flagSet.StringVar(&config.RuntimeDisplayName, "display-name", envOrDefault(getenv, "SETTA_RUNTIME_DISPLAY_NAME", config.RuntimeDisplayName), "runtime display name to persist for this Setta instance")
	flagSet.StringVar(&config.Host, "host", envOrDefault(getenv, "SETTA_BACKEND_HOST", config.Host), "loopback host to bind")
	flagSet.IntVar(&config.Port, "port", port, "port to bind, or 0 for an ephemeral port")
	flagSet.StringVar(&config.Version, "version", envOrDefault(getenv, "SETTA_BACKEND_VERSION", config.Version), "backend version metadata")
	if harness := getenv("SETTA_E2E_CHAT_HARNESS"); harness != "" {
		if getenv("SETTA_E2E") != "1" {
			return config, fmt.Errorf("SETTA_E2E_CHAT_HARNESS requires SETTA_E2E=1")
		}
		config.ChatHarness = runtime.ChatHarnessMode(harness)
	}
	if disableAutomaticCartographer := getenv("SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER"); disableAutomaticCartographer != "" {
		if getenv("SETTA_E2E") != "1" {
			return config, fmt.Errorf("SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER requires SETTA_E2E=1")
		}
		if disableAutomaticCartographer != "1" {
			return config, fmt.Errorf("SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER must be 1")
		}
		config.DisableAutomaticCartographerProcessing = true
	}

	if err := flagSet.Parse(args); err != nil {
		return config, err
	}
	if err := config.Validate(); err != nil {
		return config, fmt.Errorf("invalid configuration: %w", err)
	}
	return config, nil
}

func defaultAppDataDir(getenv func(string) string) (string, error) {
	if value := getenv("SETTA_APP_DATA_DIR"); value != "" {
		return value, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve default app data directory: %w", err)
	}
	return filepath.Join(homeDir, ".setta"), nil
}

func defaultPort(rawPort string) (int, error) {
	if rawPort == "" {
		return 0, nil
	}
	port, err := strconv.Atoi(rawPort)
	if err != nil {
		return 0, fmt.Errorf("SETTA_BACKEND_PORT must be an integer: %w", err)
	}
	return port, nil
}

func defaultBool(rawValue string, name string) (bool, error) {
	if rawValue == "" || rawValue == "0" {
		return false, nil
	}
	if rawValue == "1" {
		return true, nil
	}
	return false, fmt.Errorf("%s must be 0 or 1", name)
}

func envOrDefault(getenv func(string) string, name string, fallback string) string {
	value := getenv(name)
	if value == "" {
		return fallback
	}
	return value
}
