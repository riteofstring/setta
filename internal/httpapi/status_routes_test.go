package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/pathreveal"
)

func TestRegisterStatusRoutesReturnsBackendInitStatus(t *testing.T) {
	t.Parallel()

	// The live startup poll should get a stable ready payload from the Go app.
	readyAt := time.Date(2026, time.March, 9, 12, 34, 56, 0, time.UTC)
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		AuthRefreshWindowSeconds: 3600,
		WorktreeName:             "feature-cleanup",
		ReadyAt:                  readyAt,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetBackendInitStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected backend init status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload BackendInitStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode backend init status payload: %v", err)
	}
	if !payload.IsReady {
		t.Fatalf("expected backend to report ready, got %#v", payload)
	}
	if len(payload.Events) != 1 || payload.Events[0].Message != "Go backend ready" {
		t.Fatalf("expected a single ready event, got %#v", payload.Events)
	}
	if !payload.Events[0].Timestamp.Equal(readyAt) {
		t.Fatalf("expected ready timestamp %s, got %s", readyAt, payload.Events[0].Timestamp)
	}
	if payload.WorktreeName == nil || *payload.WorktreeName != "feature-cleanup" {
		t.Fatalf("expected worktree name feature-cleanup, got %#v", payload.WorktreeName)
	}
	if payload.AuthCookieRefreshWindowSeconds != 3600 {
		t.Fatalf("expected auth refresh window 3600, got %d", payload.AuthCookieRefreshWindowSeconds)
	}
}

func TestRegisterStatusRoutesReturnsBackendInitStatusWithoutWorktreeName(t *testing.T) {
	t.Parallel()

	readyAt := time.Date(2026, time.March, 9, 12, 35, 0, 0, time.UTC)
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		AuthRefreshWindowSeconds: 120,
		ReadyAt:                  readyAt,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetBackendInitStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected backend init status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload BackendInitStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode backend init status payload: %v", err)
	}
	if !payload.IsReady {
		t.Fatalf("expected backend to report ready, got %#v", payload)
	}
	if payload.Error != nil {
		t.Fatalf("expected backend init error to remain nil, got %#v", payload.Error)
	}
	if len(payload.Events) != 1 || payload.Events[0].Message != "Go backend ready" {
		t.Fatalf("expected a single ready event, got %#v", payload.Events)
	}
	if !payload.Events[0].Timestamp.Equal(readyAt) {
		t.Fatalf("expected ready timestamp %s, got %s", readyAt, payload.Events[0].Timestamp)
	}
	if payload.WorktreeName != nil {
		t.Fatalf("expected absent worktree name to serialize as null, got %#v", payload.WorktreeName)
	}
	if payload.AuthCookieRefreshWindowSeconds != 120 {
		t.Fatalf("expected auth refresh window 120, got %d", payload.AuthCookieRefreshWindowSeconds)
	}
}

func TestRegisterStatusRoutesReturnsAuthRefreshStatus(t *testing.T) {
	t.Parallel()

	// Websocket refresh polling only needs the auth refresh window contract.
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		AuthRefreshWindowSeconds: 120,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAuthRefreshStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected auth refresh status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload AuthRefreshStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode auth refresh status payload: %v", err)
	}
	if payload.AuthCookieRefreshWindowSeconds != 120 {
		t.Fatalf("expected auth refresh window 120, got %d", payload.AuthCookieRefreshWindowSeconds)
	}
}

func TestRegisterStatusRoutesReturnsSettaHomeInfoInIDEMode(t *testing.T) {
	t.Parallel()

	// Workspace switching depends on the current Setta home and active files root scope.
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		SettaHome:                "/tmp/.setta-development",
		GlobalSettaFilesBase:     "/tmp/.setta-development/setta_files",
		ActiveSettaFilesLocation: "custom",
		SettaFilesRoot:           "/tmp/workspace/setta_files_dev",
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetSettaHomeInfo, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected setta home info 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload SettaHomeInfoResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode setta home info payload: %v", err)
	}
	if payload.SettaHome != "/tmp/.setta-development" {
		t.Fatalf("expected setta home /tmp/.setta-development, got %q", payload.SettaHome)
	}
	if payload.GlobalSettaFilesBase != "/tmp/.setta-development/setta_files" {
		t.Fatalf("unexpected global setta files base %q", payload.GlobalSettaFilesBase)
	}
	if payload.ActiveSettaFilesLocation == nil || *payload.ActiveSettaFilesLocation != "custom" {
		t.Fatalf("expected custom files location, got %#v", payload.ActiveSettaFilesLocation)
	}
	if payload.LLMConfigPath != "/tmp/workspace/setta_files_dev/llm_config.json" {
		t.Fatalf("unexpected llm config path %q", payload.LLMConfigPath)
	}
}

func TestRegisterStatusRoutesBlocksSettaHomeInfoOutsideIDEMode(t *testing.T) {
	t.Parallel()

	// The launcher scope read stays IDE-only because the live caller is the IDE workspace switcher.
	for _, mode := range []config.Mode{config.ModeLauncher, config.ModeShare, config.ModeApp} {
		mode := mode
		t.Run(string(mode), func(t *testing.T) {
			t.Parallel()

			handler := newStatusRouteTestHandler(t, mode, StatusRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
			})

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetSettaHomeInfo, nil)
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected setta home info 403 in mode %s, got %d with body %q", mode, response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterStatusRoutesRevealsPathsInIDEMode(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	targetPath := filepath.Join(workspaceRoot, "skill.md")
	if err := os.WriteFile(targetPath, []byte("# Skill"), 0o644); err != nil {
		t.Fatalf("write target file: %v", err)
	}
	logPath := filepath.Join(t.TempDir(), "command.json")
	revealService, err := pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: statusRouteTestCommandContext(logPath, 0, 0, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RevealPath: revealService,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRevealPathInOSFileExplorer, strings.NewReader(`{"path":"`+targetPath+`"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected reveal path 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response payload, got %q", response.Body.String())
	}

	command := readStatusRouteCommandLog(t, logPath)
	if want := []string{"open", "-R", resolveStatusRouteTestPath(t, targetPath)}; !reflect.DeepEqual(command, want) {
		t.Fatalf("expected reveal command %#v, got %#v", want, command)
	}
}

func TestRegisterStatusRoutesRejectsRevealPathOutsideAllowedRoots(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	outsidePath := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(outsidePath, []byte("# Outside"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	revealService, err := pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: statusRouteTestCommandContext(filepath.Join(t.TempDir(), "unused.json"), 0, 0, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RevealPath: revealService,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRevealPathInOSFileExplorer, strings.NewReader(`{"path":"`+outsidePath+`"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected reveal path 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Path is outside allowed reveal roots.") {
		t.Fatalf("expected allowed-root message, got %q", response.Body.String())
	}
}

func TestRegisterStatusRoutesRejectsMissingRevealPathOutsideAllowedRoots(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	missingOutsidePath := filepath.Join(t.TempDir(), "outside", "missing.md")
	revealService, err := pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: statusRouteTestCommandContext(filepath.Join(t.TempDir(), "unused.json"), 0, 0, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RevealPath: revealService,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRevealPathInOSFileExplorer, strings.NewReader(`{"path":"`+missingOutsidePath+`"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected reveal path 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Path is outside allowed reveal roots.") {
		t.Fatalf("expected allowed-root message, got %q", response.Body.String())
	}
	if strings.Contains(response.Body.String(), "path_not_found") {
		t.Fatalf("expected missing outside-root path to avoid path_not_found leak, got %q", response.Body.String())
	}
}

func TestRegisterStatusRoutesMapsRevealCommandFailure(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	targetPath := filepath.Join(workspaceRoot, "skill.md")
	if err := os.WriteFile(targetPath, []byte("# Skill"), 0o644); err != nil {
		t.Fatalf("write target file: %v", err)
	}
	revealService, err := pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: statusRouteTestCommandContext(filepath.Join(t.TempDir(), "command.json"), 2, 0, "", "permission denied"),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RevealPath: revealService,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRevealPathInOSFileExplorer, strings.NewReader(`{"path":"`+targetPath+`"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected reveal path 500, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"path_reveal_failed"`) {
		t.Fatalf("expected path_reveal_failed envelope, got %q", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Failed to reveal path in file explorer: permission denied") {
		t.Fatalf("expected command failure detail, got %q", response.Body.String())
	}
}

func TestRegisterStatusRoutesMapsRevealCommandTimeout(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	targetPath := filepath.Join(workspaceRoot, "skill.md")
	if err := os.WriteFile(targetPath, []byte("# Skill"), 0o644); err != nil {
		t.Fatalf("write target file: %v", err)
	}
	revealService, err := pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: statusRouteTestCommandContext(filepath.Join(t.TempDir(), "command.json"), 0, 1500, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RevealPath: revealService,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRevealPathInOSFileExplorer, strings.NewReader(`{"path":"`+targetPath+`"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected reveal path 500, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"path_reveal_failed"`) {
		t.Fatalf("expected path_reveal_failed envelope, got %q", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "timed out after 1s") {
		t.Fatalf("expected timeout detail, got %q", response.Body.String())
	}
}

func newStatusRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	deps StatusRouteDependencies,
) http.Handler {
	t.Helper()

	deps.ModePolicy = modes.NewPolicy(mode)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterStatusRoutes(r, deps); err != nil {
				t.Fatalf("register status routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new status route handler: %v", err)
	}
	return handler
}

func TestStatusRouteHelperProcess(t *testing.T) {
	if os.Getenv("SETTA_STATUS_ROUTE_HELPER") != "1" {
		return
	}

	args := os.Args
	separator := -1
	for i, arg := range args {
		if arg == "--" {
			separator = i
			break
		}
	}
	if separator == -1 || len(args) < separator+7 {
		os.Exit(2)
	}

	logPath := args[separator+1]
	exitCode, err := strconv.Atoi(args[separator+2])
	if err != nil {
		os.Exit(2)
	}
	sleepMillis, err := strconv.Atoi(args[separator+3])
	if err != nil {
		os.Exit(2)
	}
	stdoutText := args[separator+4]
	stderrText := args[separator+5]
	command := args[separator+6:]
	payload, err := json.Marshal(command)
	if err != nil {
		os.Exit(2)
	}
	if sleepMillis > 0 {
		time.Sleep(time.Duration(sleepMillis) * time.Millisecond)
	}
	if err := os.WriteFile(logPath, payload, 0o644); err != nil {
		os.Exit(2)
	}
	if stdoutText != "" {
		_, _ = os.Stdout.WriteString(stdoutText)
	}
	if stderrText != "" {
		_, _ = os.Stderr.WriteString(stderrText)
	}
	os.Exit(exitCode)
}

func statusRouteTestCommandContext(
	logPath string,
	exitCode int,
	sleepMillis int,
	stdoutText string,
	stderrText string,
) func(context.Context, string, ...string) *exec.Cmd {
	return func(ctx context.Context, name string, args ...string) *exec.Cmd {
		commandArgs := []string{
			"-test.run=TestStatusRouteHelperProcess",
			"--",
			logPath,
			strconv.Itoa(exitCode),
			strconv.Itoa(sleepMillis),
			stdoutText,
			stderrText,
			name,
		}
		commandArgs = append(commandArgs, args...)
		cmd := exec.CommandContext(ctx, os.Args[0], commandArgs...)
		cmd.Env = append(os.Environ(), "SETTA_STATUS_ROUTE_HELPER=1")
		return cmd
	}
}

func readStatusRouteCommandLog(t *testing.T, path string) []string {
	t.Helper()

	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read command log: %v", err)
	}
	var command []string
	if err := json.Unmarshal(payload, &command); err != nil {
		t.Fatalf("decode command log: %v", err)
	}
	return command
}

func resolveStatusRouteTestPath(t *testing.T, path string) string {
	t.Helper()

	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return path
	}
	return resolvedPath
}
