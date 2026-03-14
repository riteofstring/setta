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
		strings.NewReader(`{"settaHome":"`+cfg.Paths.SettaHome+`"}`),
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
		SettaHome        *string           `json:"settaHome"`
		ManagedArtifacts map[string]string `json:"managedArtifacts"`
	}
	if err := json.NewDecoder(setupResponse.Body).Decode(&setupPayload); err != nil {
		t.Fatalf("decode setup launcher response: %v", err)
	}
	if !setupPayload.Ok || setupPayload.Installed == nil || !*setupPayload.Installed {
		t.Fatalf("unexpected setup launcher payload %#v", setupPayload)
	}
	expectedSettaHome, err := launcher.ResolveScopedSettaHome(cfg.Paths.SettaHome, cfg.Paths.SettaHome)
	if err != nil {
		t.Fatalf("resolve expected setta home: %v", err)
	}
	if setupPayload.SettaHome == nil || *setupPayload.SettaHome != expectedSettaHome {
		t.Fatalf("expected setup setta home %q, got %#v", expectedSettaHome, setupPayload.SettaHome)
	}
	if len(setupPayload.ManagedArtifacts) != 0 {
		t.Fatalf("expected metadata-only launcher install, got managed artifacts %#v", setupPayload.ManagedArtifacts)
	}

	removeRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteRemoveLauncher,
		strings.NewReader(`{"settaHome":"`+cfg.Paths.SettaHome+`"}`),
	)
	if err != nil {
		t.Fatalf("new remove launcher request: %v", err)
	}
	removeRequest.Header.Set("Content-Type", "application/json")
	removeRequest.AddCookie(&http.Cookie{Name: cookieName, Value: token})

	removeResponse, err := http.DefaultClient.Do(removeRequest)
	if err != nil {
		t.Fatalf("post remove launcher: %v", err)
	}
	defer removeResponse.Body.Close()
	if removeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(removeResponse.Body)
		t.Fatalf("expected remove launcher 200, got %d with body %q", removeResponse.StatusCode, string(body))
	}

	var removePayload struct {
		Ok        bool  `json:"ok"`
		Installed *bool `json:"installed"`
	}
	if err := json.NewDecoder(removeResponse.Body).Decode(&removePayload); err != nil {
		t.Fatalf("decode remove launcher response: %v", err)
	}
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
		strings.NewReader(`{"settaHome":"`+cfg.Paths.SettaHome+`","channel":"uv-tool","installSource":"uv-tool","installArtifacts":true}`),
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
