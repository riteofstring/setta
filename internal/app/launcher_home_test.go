package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppLauncherModeListsAndMutatesRecentWorkspacesOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeLauncher

	allowedRoot := filepath.Dir(cfg.Paths.WorkspaceRoot)
	workspaceRoot := filepath.Join(allowedRoot, "workspace-a")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	resolvedWorkspaceRoot, err := filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		t.Fatalf("resolve workspace root: %v", err)
	}
	t.Setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", allowedRoot)

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

	addRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteAddLauncherRecentWorkspace,
		strings.NewReader(`{"settaHome":"`+cfg.Paths.SettaHome+`","workspaceRoot":"`+workspaceRoot+`"}`),
	)
	if err != nil {
		t.Fatalf("new add request: %v", err)
	}
	addRequest.Header.Set("Content-Type", "application/json")

	addResponse, err := http.DefaultClient.Do(addRequest)
	if err != nil {
		t.Fatalf("post add recent workspace: %v", err)
	}
	defer addResponse.Body.Close()
	if addResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(addResponse.Body)
		t.Fatalf("expected add recent workspace 200, got %d with body %q", addResponse.StatusCode, string(body))
	}

	var addPayload struct {
		Ok         bool `json:"ok"`
		Workspaces []struct {
			WorkspaceRoot string `json:"workspaceRoot"`
		} `json:"workspaces"`
	}
	if err := json.NewDecoder(addResponse.Body).Decode(&addPayload); err != nil {
		t.Fatalf("decode add recent workspace response: %v", err)
	}
	if !addPayload.Ok || len(addPayload.Workspaces) != 1 || addPayload.Workspaces[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected add recent workspace payload %#v", addPayload)
	}

	listRequest, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/api"+httpapi.RouteGetLauncherRecentWorkspaces+"?setta_home="+url.QueryEscape(cfg.Paths.SettaHome),
		nil,
	)
	if err != nil {
		t.Fatalf("new list recent workspaces request: %v", err)
	}

	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("get recent workspaces: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected get recent workspaces 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var listPayload struct {
		Ok         bool `json:"ok"`
		Workspaces []struct {
			WorkspaceRoot string `json:"workspaceRoot"`
		} `json:"workspaces"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode list recent workspaces response: %v", err)
	}
	if !listPayload.Ok || len(listPayload.Workspaces) != 1 || listPayload.Workspaces[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected recent workspaces payload %#v", listPayload)
	}
}
