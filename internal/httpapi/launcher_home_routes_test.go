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
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/launcher"
	"setta/internal/modes"
)

func TestRegisterLauncherHomeRoutesListsAndMutatesRecentWorkspaces(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	settaHome := filepath.Join(t.TempDir(), ".setta")
	workspaceRoot := filepath.Join(allowedRoot, "workspace-a")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	resolvedWorkspaceRoot, err := filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		t.Fatalf("resolve workspace root: %v", err)
	}

	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, settaHome, launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	}))

	addResponse := httptest.NewRecorder()
	addRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAddLauncherRecentWorkspace,
		stringsReader(`{"settaHome":"`+settaHome+`","workspaceRoot":"`+workspaceRoot+`"}`),
	)
	addRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(addResponse, addRequest)
	if addResponse.Code != http.StatusOK {
		t.Fatalf("expected add recent workspace 200, got %d with body %q", addResponse.Code, addResponse.Body.String())
	}

	var addPayload launcherRecentWorkspacesResponse
	if err := json.Unmarshal(addResponse.Body.Bytes(), &addPayload); err != nil {
		t.Fatalf("decode add recent workspace payload: %v", err)
	}
	if !addPayload.Ok || len(addPayload.Workspaces) != 1 || addPayload.Workspaces[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected add recent workspace payload %#v", addPayload)
	}

	getResponse := httptest.NewRecorder()
	getRequest := httptest.NewRequest(
		http.MethodGet,
		"/api"+RouteGetLauncherRecentWorkspaces+"?setta_home="+urlQueryEscape(settaHome),
		nil,
	)
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected get recent workspaces 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}

	var getPayload launcherRecentWorkspacesResponse
	if err := json.Unmarshal(getResponse.Body.Bytes(), &getPayload); err != nil {
		t.Fatalf("decode get recent workspaces payload: %v", err)
	}
	if !getPayload.Ok || len(getPayload.Workspaces) != 1 || getPayload.Workspaces[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected get recent workspaces payload %#v", getPayload)
	}

	pinResponse := httptest.NewRecorder()
	pinRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RoutePinLauncherRecentWorkspace,
		stringsReader(`{"settaHome":"`+settaHome+`","workspaceRoot":"`+workspaceRoot+`","pinned":true}`),
	)
	pinRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(pinResponse, pinRequest)
	if pinResponse.Code != http.StatusOK {
		t.Fatalf("expected pin recent workspace 200, got %d with body %q", pinResponse.Code, pinResponse.Body.String())
	}

	var pinPayload launcherRecentWorkspacesResponse
	if err := json.Unmarshal(pinResponse.Body.Bytes(), &pinPayload); err != nil {
		t.Fatalf("decode pin recent workspace payload: %v", err)
	}
	if !pinPayload.Ok || len(pinPayload.Workspaces) != 1 || !pinPayload.Workspaces[0].Pinned {
		t.Fatalf("unexpected pin recent workspace payload %#v", pinPayload)
	}

	removeResponse := httptest.NewRecorder()
	removeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRemoveLauncherRecentWorkspace,
		stringsReader(`{"settaHome":"`+settaHome+`","workspaceRoot":"`+workspaceRoot+`"}`),
	)
	removeRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(removeResponse, removeRequest)
	if removeResponse.Code != http.StatusOK {
		t.Fatalf("expected remove recent workspace 200, got %d with body %q", removeResponse.Code, removeResponse.Body.String())
	}

	var removePayload launcherRecentWorkspacesResponse
	if err := json.Unmarshal(removeResponse.Body.Bytes(), &removePayload); err != nil {
		t.Fatalf("decode remove recent workspace payload: %v", err)
	}
	if !removePayload.Ok || len(removePayload.Workspaces) != 0 {
		t.Fatalf("unexpected remove recent workspace payload %#v", removePayload)
	}
}

func TestRegisterLauncherHomeRoutesListsDirectoriesWithPagination(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	listedDirectory := filepath.Join(allowedRoot, "listed")
	if err := os.MkdirAll(listedDirectory, 0o755); err != nil {
		t.Fatalf("mkdir listed directory: %v", err)
	}
	for _, name := range []string{"alpha", "beta", "gamma", "delta"} {
		if err := os.MkdirAll(filepath.Join(listedDirectory, name), 0o755); err != nil {
			t.Fatalf("mkdir list entry %q: %v", name, err)
		}
	}

	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, filepath.Join(t.TempDir(), ".setta"), launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	}))

	firstResponse := httptest.NewRecorder()
	firstRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteListLauncherDirectory,
		stringsReader(`{"path":"`+listedDirectory+`","pageSize":2}`),
	)
	firstRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(firstResponse, firstRequest)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first directory page 200, got %d with body %q", firstResponse.Code, firstResponse.Body.String())
	}

	var firstPayload launcherListDirectoryResponse
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("decode first directory page payload: %v", err)
	}
	if !firstPayload.Ok || len(firstPayload.Entries) != 2 || !firstPayload.HasMore || firstPayload.NextCursor == nil {
		t.Fatalf("unexpected first directory page payload %#v", firstPayload)
	}

	secondResponse := httptest.NewRecorder()
	secondRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteListLauncherDirectory,
		stringsReader(`{"path":"`+listedDirectory+`","pageSize":2,"cursor":"`+*firstPayload.NextCursor+`"}`),
	)
	secondRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(secondResponse, secondRequest)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second directory page 200, got %d with body %q", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload launcherListDirectoryResponse
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("decode second directory page payload: %v", err)
	}
	if !secondPayload.Ok || len(secondPayload.Entries) != 2 {
		t.Fatalf("unexpected second directory page payload %#v", secondPayload)
	}
}

func TestRegisterLauncherHomeRoutesListsFilesystemRoots(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	resolvedAllowedRoot, err := filepath.EvalSymlinks(allowedRoot)
	if err != nil {
		t.Fatalf("resolve allowed root: %v", err)
	}
	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, filepath.Join(t.TempDir(), ".setta"), launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetLauncherFilesystemRoots, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected filesystem roots 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launcherFilesystemRootsResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode filesystem roots payload: %v", err)
	}
	if !payload.Ok {
		t.Fatalf("expected successful filesystem roots payload, got %#v", payload)
	}
	foundAllowedRoot := false
	for _, root := range payload.Roots {
		if root == resolvedAllowedRoot {
			foundAllowedRoot = true
			break
		}
	}
	if !foundAllowedRoot {
		t.Fatalf("expected filesystem roots to include %q, got %#v", resolvedAllowedRoot, payload.Roots)
	}
}

func TestRegisterLauncherHomeRoutesUsesDefaultSettaHomeWhenScopeBlank(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	workspaceRoot := filepath.Join(allowedRoot, "workspace-default-home")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	resolvedWorkspaceRoot, err := filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		t.Fatalf("resolve workspace root: %v", err)
	}

	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	}))

	addResponse := httptest.NewRecorder()
	addRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAddLauncherRecentWorkspace,
		stringsReader(`{"workspaceRoot":"`+workspaceRoot+`"}`),
	)
	addRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(addResponse, addRequest)
	if addResponse.Code != http.StatusOK {
		t.Fatalf("expected add recent workspace 200, got %d with body %q", addResponse.Code, addResponse.Body.String())
	}

	getResponse := httptest.NewRecorder()
	getRequest := httptest.NewRequest(
		http.MethodGet,
		"/api"+RouteGetLauncherRecentWorkspaces+"?setta_home=+++",
		nil,
	)
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected get recent workspaces 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}

	var payload launcherRecentWorkspacesResponse
	if err := json.Unmarshal(getResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode blank-scope recent workspaces payload: %v", err)
	}
	if !payload.Ok || len(payload.Workspaces) != 1 || payload.Workspaces[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected blank-scope recent workspaces payload %#v", payload)
	}
}

func TestRegisterLauncherHomeRoutesIsNotMountedOutsideLauncherMode(t *testing.T) {
	t.Parallel()

	handler := newLauncherHomeRouteTestHandler(t, config.ModeIDE, filepath.Join(t.TempDir(), ".setta"), launcher.NewHomeService(launcher.HomeServiceOptions{}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetLauncherRecentWorkspaces, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected launcher home route to be absent outside launcher mode, got %d with body %q", response.Code, response.Body.String())
	}
}

func newLauncherHomeRouteTestHandler(t *testing.T, mode config.Mode, defaultSettaHome string, home *launcher.HomeService) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info: stubInfoService{
			mode: string(mode),
			info: RuntimeInfo{Mode: string(mode)},
		},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLauncherHomeRoutes(r, LauncherHomeRouteDependencies{
				ModePolicy:       modes.NewPolicy(mode),
				DefaultSettaHome: defaultSettaHome,
				Home:             home,
			}); err != nil {
				t.Fatalf("register launcher home routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new launcher home handler: %v", err)
	}
	return handler
}

func stringsReader(value string) io.Reader {
	return strings.NewReader(value)
}

func urlQueryEscape(value string) string {
	return url.QueryEscape(value)
}
