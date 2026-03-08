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
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
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

	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, settaHome, home, newLauncherHomeOpenWorkspaceService(t, settaHome, home, &httpAPICapturingLauncher{}))

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

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, home, newLauncherHomeOpenWorkspaceService(t, defaultSettaHome, home, &httpAPICapturingLauncher{}))

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
	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, home, newLauncherHomeOpenWorkspaceService(t, defaultSettaHome, home, &httpAPICapturingLauncher{}))

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

	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, home, newLauncherHomeOpenWorkspaceService(t, defaultSettaHome, home, &httpAPICapturingLauncher{}))

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

func TestRegisterLauncherHomeRoutesOpensWorkspaceAndReturnsBootstrapFragment(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	if err := os.MkdirAll(defaultSettaHome, 0o755); err != nil {
		t.Fatalf("mkdir default setta home: %v", err)
	}
	workspaceRoot := filepath.Join(allowedRoot, "workspace-open")
	resolvedWorkspaceRoot, err := filepath.EvalSymlinks(allowedRoot)
	if err != nil {
		t.Fatalf("resolve allowed root: %v", err)
	}
	resolvedWorkspaceRoot = filepath.Join(resolvedWorkspaceRoot, "workspace-open")
	resolvedSettaHome, err := filepath.EvalSymlinks(defaultSettaHome)
	if err != nil {
		t.Fatalf("resolve default setta home: %v", err)
	}

	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	sessionLauncher := &httpAPICapturingLauncher{
		resultFunc: func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
			return launcher.IDELaunchResult{
				Session: auth.SessionMetadata{
					ID:   "session-1",
					Host: "127.0.0.1",
					Port: 61234,
				},
				Secret: []byte("secret"),
				Paths: config.Paths{
					WorkspaceRoot:         resolvedWorkspaceRoot,
					SettaHome:             resolvedSettaHome,
					SettaFilesRoot:        filepath.Join(resolvedWorkspaceRoot, "setta_files"),
					ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
					RuntimeRoot:           filepath.Join(resolvedWorkspaceRoot, "setta_files", "runtime"),
				},
				StartedNew: true,
			}, nil
		},
	}

	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, home, newLauncherHomeOpenWorkspaceService(t, defaultSettaHome, home, sessionLauncher))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteOpenLauncherWorkspace,
		stringsReader(`{"workspaceRoot":"`+workspaceRoot+`","createIfMissing":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected open workspace 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launcherOpenWorkspaceResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode open workspace payload: %v", err)
	}
	if !payload.Ok || payload.BootstrapURLFragment == nil || *payload.BootstrapURLFragment != "http://127.0.0.1:61234/__setta__/bootstrap#token=tok" {
		t.Fatalf("unexpected open workspace payload %#v", payload)
	}
	if payload.WorkspaceRoot == nil || *payload.WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected workspace root payload %#v", payload.WorkspaceRoot)
	}
	if payload.SettaHome == nil || *payload.SettaHome != resolvedSettaHome {
		t.Fatalf("unexpected setta home payload %#v", payload.SettaHome)
	}
	if payload.SessionID == nil || *payload.SessionID != "session-1" || payload.StartedNew == nil || !*payload.StartedNew {
		t.Fatalf("unexpected session payload %#v", payload)
	}
	if sessionLauncher.input == nil || sessionLauncher.input.SettaFilesLocation == nil || *sessionLauncher.input.SettaFilesLocation != "auto" {
		t.Fatalf("expected route to normalize omitted files location to auto, got %#v", sessionLauncher.input)
	}
}

func TestRegisterLauncherHomeRoutesOpenWorkspaceProfilePreservesOmittedSettaFilesLocation(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	workspaceRoot := filepath.Join(allowedRoot, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	sessionLauncher := &httpAPICapturingLauncher{
		err: &launcher.SessionLaunchError{
			Code:    "Captured",
			Message: "intentional capture",
		},
	}

	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, home, newLauncherHomeOpenWorkspaceService(t, defaultSettaHome, home, sessionLauncher))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteOpenLauncherWorkspace,
		stringsReader(`{"workspaceRoot":"`+workspaceRoot+`","profile":"dev"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected open workspace 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launcherOpenWorkspaceResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode open workspace payload: %v", err)
	}
	if payload.Ok || payload.Error == nil || payload.Error.Code != "Captured" {
		t.Fatalf("unexpected open workspace error payload %#v", payload)
	}
	if sessionLauncher.input == nil {
		t.Fatal("expected launcher input to be captured")
	}
	if sessionLauncher.input.SettaFilesLocation != nil {
		t.Fatalf("expected omitted files location with profile to remain nil, got %#v", sessionLauncher.input.SettaFilesLocation)
	}
}

func TestRegisterLauncherHomeRoutesOpenWorkspaceExplicitAutoOverridesProfile(t *testing.T) {
	t.Parallel()

	allowedRoot := t.TempDir()
	workspaceRoot := filepath.Join(allowedRoot, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	home := launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: testEnv{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}.lookup,
	})
	sessionLauncher := &httpAPICapturingLauncher{
		err: &launcher.SessionLaunchError{
			Code:    "Captured",
			Message: "intentional capture",
		},
	}

	handler := newLauncherHomeRouteTestHandler(t, config.ModeLauncher, defaultSettaHome, home, newLauncherHomeOpenWorkspaceService(t, defaultSettaHome, home, sessionLauncher))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteOpenLauncherWorkspace,
		stringsReader(`{"workspaceRoot":"`+workspaceRoot+`","profile":"dev","settaFilesLocation":"auto"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected open workspace 200, got %d with body %q", response.Code, response.Body.String())
	}

	if sessionLauncher.input == nil || sessionLauncher.input.SettaFilesLocation == nil || *sessionLauncher.input.SettaFilesLocation != "auto" {
		t.Fatalf("expected explicit auto to be preserved, got %#v", sessionLauncher.input)
	}
}

func TestRegisterLauncherHomeRoutesIsNotMountedOutsideLauncherMode(t *testing.T) {
	t.Parallel()

	home := launcher.NewHomeService(launcher.HomeServiceOptions{})
	handler := newLauncherHomeRouteTestHandler(t, config.ModeIDE, filepath.Join(t.TempDir(), ".setta"), home, newLauncherHomeOpenWorkspaceService(t, filepath.Join(t.TempDir(), ".setta"), home, &httpAPICapturingLauncher{}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetLauncherRecentWorkspaces, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected launcher home route to be absent outside launcher mode, got %d with body %q", response.Code, response.Body.String())
	}
}

func newLauncherHomeRouteTestHandler(t *testing.T, mode config.Mode, defaultSettaHome string, home *launcher.HomeService, openWorkspace *launcher.OpenWorkspaceService) http.Handler {
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
				OpenWorkspace:    openWorkspace,
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

func newLauncherHomeOpenWorkspaceService(t *testing.T, defaultSettaHome string, home *launcher.HomeService, sessionLauncher launcher.IDEWorkspaceSessionLauncher) *launcher.OpenWorkspaceService {
	t.Helper()

	service, err := launcher.NewOpenWorkspaceService(launcher.OpenWorkspaceServiceOptions{
		DefaultSettaHome: defaultSettaHome,
		Home:             home,
		Sessions:         sessionLauncher,
		MintBootstrapToken: func(string, []byte, time.Time) (string, error) {
			return "tok", nil
		},
	})
	if err != nil {
		t.Fatalf("new launcher open-workspace service: %v", err)
	}
	return service
}

type httpAPICapturingLauncher struct {
	input      *launcher.IDELaunchInput
	resultFunc func(launcher.IDELaunchInput) (launcher.IDELaunchResult, error)
	err        error
}

func (l *httpAPICapturingLauncher) EnsureSession(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
	inputCopy := input
	if input.SettaFilesLocation != nil {
		location := *input.SettaFilesLocation
		inputCopy.SettaFilesLocation = &location
	}
	l.input = &inputCopy
	if l.resultFunc != nil {
		return l.resultFunc(input)
	}
	if l.err != nil {
		return launcher.IDELaunchResult{}, l.err
	}
	return launcher.IDELaunchResult{}, nil
}

func urlQueryEscape(value string) string {
	return url.QueryEscape(value)
}
