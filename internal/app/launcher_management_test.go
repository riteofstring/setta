package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/launcher"
	"setta/internal/observability"
)

func TestAppIDEModeManagesMetadataOnlyLauncherInstallOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	harness := startAppLauncherManagementHarness(t, cfg)
	setupPayload := postAppSetupLauncher(t, harness, `{"settaHome":"`+cfg.Paths.SettaHome+`"}`)
	assertMetadataOnlyLauncherSetup(t, cfg, setupPayload)

	removePayload := postAppRemoveLauncher(t, harness, `{"settaHome":"`+cfg.Paths.SettaHome+`"}`)
	if !removePayload.Ok || removePayload.Installed == nil || *removePayload.Installed {
		t.Fatalf("unexpected remove launcher payload %#v", removePayload)
	}
}

func TestAppIDEModeManagesLauncherArtifactsOverHTTP(t *testing.T) {
	prepareAppLauncherManagementTestHome(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	setupRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+cfg.Paths.SettaHome+`","channel":"uv-tool","installSource":"uv_tool","installArtifacts":true}`),
	)
	if err != nil {
		t.Fatalf("new setup launcher request: %v", err)
	}
	setupRequest.Header.Set("Content-Type", "application/json")
	setupRequest.AddCookie(&http.Cookie{Name: cookieName, Value: token})

	setupResponse, err := http.DefaultClient.Do(setupRequest)
	if err != nil {
		t.Fatalf("post setup launcher: %v", err)
	}
	defer setupResponse.Body.Close()
	if setupResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(setupResponse.Body)
		t.Fatalf("expected setup launcher 200, got %d with body %q", setupResponse.StatusCode, string(body))
	}

	var setupPayload struct {
		Ok               bool              `json:"ok"`
		Installed        *bool             `json:"installed"`
		ManagedArtifacts map[string]string `json:"managedArtifacts"`
	}
	if err := json.NewDecoder(setupResponse.Body).Decode(&setupPayload); err != nil {
		t.Fatalf("decode setup launcher response: %v", err)
	}
	if !setupPayload.Ok || setupPayload.Installed == nil || !*setupPayload.Installed {
		t.Fatalf("unexpected setup launcher payload %#v", setupPayload)
	}
	if len(setupPayload.ManagedArtifacts) == 0 {
		t.Fatalf("expected managed artifacts after setup, got %#v", setupPayload)
	}
}

func TestAppIDEModeRepairsLauncherTargetOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	writeMissingAppLauncherTargetMetadata(t, cfg)
	harness := startAppLauncherManagementHarness(t, cfg)
	repairPayload := postAppRepairLauncher(t, harness, `{"settaHome":"`+cfg.Paths.SettaHome+`"}`)
	assertAppLauncherRepairPayload(t, repairPayload)
}

type appLauncherManagementHarness struct {
	serverURL  string
	authCookie *http.Cookie
}

type appLauncherSetupPayload struct {
	Ok               bool              `json:"ok"`
	Installed        *bool             `json:"installed"`
	SettaHome        *string           `json:"settaHome"`
	ManagedArtifacts map[string]string `json:"managedArtifacts"`
}

type appLauncherRemovePayload struct {
	Ok        bool  `json:"ok"`
	Installed *bool `json:"installed"`
}

type appLauncherRepairPayload struct {
	Ok            bool     `json:"ok"`
	Installed     *bool    `json:"installed"`
	TargetCommand []string `json:"targetCommand"`
	TargetValid   *bool    `json:"targetValid"`
	TargetError   *string  `json:"targetError"`
}

func startAppLauncherManagementHarness(t *testing.T, cfg config.Config) appLauncherManagementHarness {
	t.Helper()

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	return appLauncherManagementHarness{
		serverURL:  server.URL,
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func postAppSetupLauncher(t *testing.T, harness appLauncherManagementHarness, body string) appLauncherSetupPayload {
	t.Helper()

	response := postAppLauncherManagementRoute(t, harness, httpapi.RouteSetupLauncher, body, "setup launcher")
	defer response.Body.Close()
	var payload appLauncherSetupPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode setup launcher response: %v", err)
	}
	return payload
}

func postAppRemoveLauncher(t *testing.T, harness appLauncherManagementHarness, body string) appLauncherRemovePayload {
	t.Helper()

	response := postAppLauncherManagementRoute(t, harness, httpapi.RouteRemoveLauncher, body, "remove launcher")
	defer response.Body.Close()
	var payload appLauncherRemovePayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode remove launcher response: %v", err)
	}
	return payload
}

func postAppRepairLauncher(t *testing.T, harness appLauncherManagementHarness, body string) appLauncherRepairPayload {
	t.Helper()

	response := postAppLauncherManagementRoute(t, harness, httpapi.RouteRepairLauncher, body, "repair launcher")
	defer response.Body.Close()
	var payload appLauncherRepairPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode repair launcher response: %v", err)
	}
	return payload
}

func postAppLauncherManagementRoute(t *testing.T, harness appLauncherManagementHarness, route string, body string, label string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new %s request: %v", label, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post %s: %v", label, err)
	}
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		t.Fatalf("expected %s 200, got %d with body %q", label, response.StatusCode, string(body))
	}
	return response
}

func assertMetadataOnlyLauncherSetup(t *testing.T, cfg config.Config, payload appLauncherSetupPayload) {
	t.Helper()

	if !payload.Ok || payload.Installed == nil || !*payload.Installed {
		t.Fatalf("unexpected setup launcher payload %#v", payload)
	}
	expectedSettaHome, err := launcher.ResolveScopedSettaHome(cfg.Paths.SettaHome, cfg.Paths.SettaHome)
	if err != nil {
		t.Fatalf("resolve expected setta home: %v", err)
	}
	if payload.SettaHome == nil || *payload.SettaHome != expectedSettaHome {
		t.Fatalf("expected setup setta home %q, got %#v", expectedSettaHome, payload.SettaHome)
	}
	if len(payload.ManagedArtifacts) != 0 {
		t.Fatalf("expected metadata-only launcher install, got managed artifacts %#v", payload.ManagedArtifacts)
	}
}

func writeMissingAppLauncherTargetMetadata(t *testing.T, cfg config.Config) {
	t.Helper()

	missingTarget := filepath.Join(t.TempDir(), "missing-setta")
	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{missingTarget},
		Channel:                "manual",
		InstallSource:          launcher.LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "repair-token",
		SettaVersion:           "0.0.1",
		SettaHome:              cfg.Paths.SettaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build repair metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(cfg.Paths.SettaHome, metadata); err != nil {
		t.Fatalf("write repair metadata: %v", err)
	}
}

func assertAppLauncherRepairPayload(t *testing.T, repairPayload appLauncherRepairPayload) {
	t.Helper()

	if !repairPayload.Ok || repairPayload.Installed == nil || !*repairPayload.Installed {
		t.Fatalf("unexpected repair launcher payload %#v", repairPayload)
	}
	if repairPayload.TargetValid == nil || !*repairPayload.TargetValid {
		t.Fatalf("expected repaired target to be valid, got %#v", repairPayload.TargetValid)
	}
	if repairPayload.TargetError != nil {
		t.Fatalf("expected repaired target error to clear, got %#v", repairPayload.TargetError)
	}
	currentExecutable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve current executable path: %v", err)
	}
	resolvedCurrentExecutable, err := filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		t.Fatalf("resolve symlinked current executable path: %v", err)
	}
	if len(repairPayload.TargetCommand) != 1 || repairPayload.TargetCommand[0] != resolvedCurrentExecutable {
		t.Fatalf("expected repaired target command %q, got %#v", resolvedCurrentExecutable, repairPayload.TargetCommand)
	}
}

func prepareAppLauncherManagementTestHome(t *testing.T) string {
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
