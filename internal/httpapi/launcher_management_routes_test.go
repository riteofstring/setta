package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/launcher"
	"setta/internal/modes"
)

func TestRegisterLauncherManagementRoutesReportsNotInstalled(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetLauncherStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected launcher status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launcherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode launcher status payload: %v", err)
	}
	if !payload.Ok || payload.Installed == nil || *payload.Installed {
		t.Fatalf("unexpected launcher status payload %#v", payload)
	}
	if payload.UpdateCapability == nil || *payload.UpdateCapability != string(launcher.LauncherUpdateCapabilityUnsupported) {
		t.Fatalf("expected unsupported update capability, got %#v", payload.UpdateCapability)
	}
}

func TestRegisterLauncherManagementRoutesHonorsScopedSettaHome(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	scopedSettaHome := filepath.Join(t.TempDir(), ".setta-scoped")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodGet,
		"/api"+RouteGetLauncherStatus+"?setta_home="+url.QueryEscape(scopedSettaHome),
		nil,
	)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected scoped launcher status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launcherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode scoped launcher status payload: %v", err)
	}
	expectedSettaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, scopedSettaHome)
	if err != nil {
		t.Fatalf("resolve expected scoped setta home: %v", err)
	}
	if payload.SettaHome == nil || *payload.SettaHome != expectedSettaHome {
		t.Fatalf("expected scoped setta home %q, got %#v", expectedSettaHome, payload.SettaHome)
	}
}

func TestRegisterLauncherManagementRoutesSetupAndRemoveRoundtripMetadataOnly(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	setupResponse := httptest.NewRecorder()
	setupRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`"}`),
	)
	setupRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(setupResponse, setupRequest)
	if setupResponse.Code != http.StatusOK {
		t.Fatalf("expected setup launcher 200, got %d with body %q", setupResponse.Code, setupResponse.Body.String())
	}

	var setupPayload launcherStatusResponse
	if err := json.Unmarshal(setupResponse.Body.Bytes(), &setupPayload); err != nil {
		t.Fatalf("decode setup launcher payload: %v", err)
	}
	if !setupPayload.Ok || setupPayload.Installed == nil || !*setupPayload.Installed {
		t.Fatalf("unexpected setup launcher payload %#v", setupPayload)
	}
	if len(setupPayload.ManagedArtifacts) != 0 {
		t.Fatalf("expected metadata-only install, got managed artifacts %#v", setupPayload.ManagedArtifacts)
	}

	removeResponse := httptest.NewRecorder()
	removeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRemoveLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`"}`),
	)
	removeRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(removeResponse, removeRequest)
	if removeResponse.Code != http.StatusOK {
		t.Fatalf("expected remove launcher 200, got %d with body %q", removeResponse.Code, removeResponse.Body.String())
	}

	var removePayload launcherStatusResponse
	if err := json.Unmarshal(removeResponse.Body.Bytes(), &removePayload); err != nil {
		t.Fatalf("decode remove launcher payload: %v", err)
	}
	if !removePayload.Ok || removePayload.Installed == nil || *removePayload.Installed {
		t.Fatalf("unexpected remove launcher payload %#v", removePayload)
	}
}

func TestRegisterLauncherManagementRoutesRejectUnknownSetupFields(t *testing.T) {
	t.Parallel()

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, filepath.Join(t.TempDir(), ".setta"), newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"managedArtifacts":{"manual":"/tmp/artifact"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected strict setup decode 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid setup response: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request error, got %#v", payload)
	}
	if !strings.Contains(payload.Error.Message, "managedArtifacts") {
		t.Fatalf("expected unknown field detail to mention managedArtifacts, got %#v", payload)
	}
}

func TestRegisterLauncherManagementRoutesRejectMalformedSetupJSON(t *testing.T) {
	t.Parallel()

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, filepath.Join(t.TempDir(), ".setta"), newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"channel":`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected malformed setup payload 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode malformed setup response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error, got %#v", payload)
	}
}

func TestRegisterLauncherManagementRoutesSetupInstallsManagedArtifacts(t *testing.T) {
	prepareLauncherManagementTestHome(t)

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`","channel":"uv-tool","installSource":"uv-tool","installArtifacts":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected setup launcher 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launcherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode managed artifact setup response: %v", err)
	}
	if !payload.Ok || payload.Installed == nil || !*payload.Installed {
		t.Fatalf("expected setup launcher to succeed for managed artifacts, got %#v", payload)
	}
	if len(payload.ManagedArtifacts) == 0 {
		t.Fatalf("expected managed artifacts in setup payload, got %#v", payload)
	}
}

func newLauncherManagementRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	defaultSettaHome string,
	manager *launcher.ManagementService,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLauncherManagementRoutes(r, LauncherManagementRouteDependencies{
				ModePolicy:       modes.NewPolicy(mode),
				DefaultSettaHome: defaultSettaHome,
				Manager:          manager,
			}); err != nil {
				t.Fatalf("register launcher management routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new launcher management handler: %v", err)
	}
	return handler
}

func newLauncherManagementService(t *testing.T) *launcher.ManagementService {
	t.Helper()

	executablePath := filepath.Join(t.TempDir(), "setta")
	if err := os.WriteFile(executablePath, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write launcher management executable: %v", err)
	}
	service, err := launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
		Version:        "1.2.3",
	})
	if err != nil {
		t.Fatalf("new launcher management service: %v", err)
	}
	return service
}

func prepareLauncherManagementTestHome(t *testing.T) string {
	t.Helper()

	homeDir := filepath.Join(t.TempDir(), "home")
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir test home: %v", err)
	}
	switch runtime.GOOS {
	case "windows":
		t.Setenv("USERPROFILE", homeDir)
		t.Setenv("APPDATA", filepath.Join(homeDir, "AppData", "Roaming"))
		t.Setenv("LOCALAPPDATA", filepath.Join(homeDir, "AppData", "Local"))
	default:
		t.Setenv("HOME", homeDir)
	}
	return homeDir
}
