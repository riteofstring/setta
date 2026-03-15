package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/filebrowser"
	"setta/internal/modes"
)

func TestRegisterFileBrowserRoutesReturnsRootAndServesDownloads(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	rootRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserRoot, strings.NewReader("null"))
	rootRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, rootRequest, authService)

	rootResponse := httptest.NewRecorder()
	handler.ServeHTTP(rootResponse, rootRequest)
	if rootResponse.Code != http.StatusOK {
		t.Fatalf("expected root 200, got %d with body %q", rootResponse.Code, rootResponse.Body.String())
	}

	var rootPayload filebrowser.RootResponse
	if err := json.Unmarshal(rootResponse.Body.Bytes(), &rootPayload); err != nil {
		t.Fatalf("decode root payload: %v", err)
	}
	if rootPayload.RootPath != workspaceRoot {
		t.Fatalf("expected workspace root %q, got %q", workspaceRoot, rootPayload.RootPath)
	}

	// The route should mint download URLs against the backend origin and serve the matching file bytes.
	downloadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserDownloadURL, strings.NewReader(`{"paths":["`+filepath.Join(workspaceRoot, "notes.txt")+`"]}`))
	downloadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, downloadRequest, authService)

	downloadResponse := httptest.NewRecorder()
	handler.ServeHTTP(downloadResponse, downloadRequest)
	if downloadResponse.Code != http.StatusOK {
		t.Fatalf("expected download url 200, got %d with body %q", downloadResponse.Code, downloadResponse.Body.String())
	}

	var downloadPayload []filebrowser.FileBrowserDownloadURLEntry
	if err := json.Unmarshal(downloadResponse.Body.Bytes(), &downloadPayload); err != nil {
		t.Fatalf("decode download url payload: %v", err)
	}
	if len(downloadPayload) != 1 {
		t.Fatalf("expected one download url, got %#v", downloadPayload)
	}
	if !strings.HasPrefix(downloadPayload[0].URL, "http://example.com/api/fileBrowser/") {
		t.Fatalf("expected absolute backend download url, got %q", downloadPayload[0].URL)
	}

	token := strings.TrimPrefix(downloadPayload[0].URL, "http://example.com/api/fileBrowser/")
	fileRequest := httptest.NewRequest(http.MethodGet, "/api/fileBrowser/"+token, nil)
	addHTTPTestAuthCookie(t, fileRequest, authService)

	fileResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileResponse, fileRequest)
	if fileResponse.Code != http.StatusOK {
		t.Fatalf("expected file download 200, got %d with body %q", fileResponse.Code, fileResponse.Body.String())
	}
	if body := fileResponse.Body.String(); body != "route file body" {
		t.Fatalf("expected file body %q, got %q", "route file body", body)
	}
}

func TestRegisterFileBrowserRoutesCreatesWorkspaceFiles(t *testing.T) {
	t.Parallel()

	// The legacy createFile caller should now create empty workspace files
	// through the Go-owned file browser service.
	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateFile, strings.NewReader(`{"filepath":"data/input.json"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response payload, got %q", response.Body.String())
	}

	if _, err := os.Stat(filepath.Join(workspaceRoot, "data", "input.json")); err != nil {
		t.Fatalf("expected created workspace file: %v", err)
	}
}

func TestRegisterFileBrowserRoutesDefaultFolderContentsShowDotfilesButHideIgnoredRoots(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	if err := os.WriteFile(filepath.Join(workspaceRoot, ".env"), []byte("API_KEY=test"), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, ".gitignore"), []byte("dist/\n"), 0o644); err != nil {
		t.Fatalf("write .gitignore: %v", err)
	}
	for _, path := range []string{
		filepath.Join(workspaceRoot, ".git"),
		filepath.Join(workspaceRoot, ".venv"),
		filepath.Join(workspaceRoot, "node_modules"),
		filepath.Join(workspaceRoot, "setta_files"),
	} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFolderContents, strings.NewReader(`{"folderPath":"`+workspaceRoot+`"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload []filebrowser.FolderContentItem
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode folder payload: %v", err)
	}
	names := make(map[string]filebrowser.FolderContentItem, len(payload))
	for _, item := range payload {
		names[item.Name] = item
	}
	for _, name := range []string{".env", ".gitignore"} {
		if _, ok := names[name]; !ok {
			t.Fatalf("expected default listing to include %q, got %#v", name, payload)
		}
	}
	for _, name := range []string{".git", ".venv", "node_modules", "setta_files"} {
		if _, ok := names[name]; ok {
			t.Fatalf("expected default listing to hide %q, got %#v", name, payload)
		}
	}
}

func TestRegisterFileBrowserRoutesRejectsCreateFileOutsideWorkspaceRoot(t *testing.T) {
	t.Parallel()

	// Path validation should stay on the Go file browser owner so callers cannot
	// create files outside the workspace root.
	authService := newTestAuthService(t)
	service, _, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateFile, strings.NewReader(`{"filepath":"../outside.json"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"path_forbidden"`) {
		t.Fatalf("expected path_forbidden error, got %q", response.Body.String())
	}
}

func TestRegisterFileBrowserRoutesBlocksDeploymentModeWithExplicitMessage(t *testing.T) {
	t.Parallel()

	handler := newFileBrowserRouteTestHandler(t, config.ModeShare, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserRoot, strings.NewReader("null"))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "File browsing is disabled in deployment mode.") {
		t.Fatalf("expected deployment-mode file browser message, got %q", response.Body.String())
	}
}

func TestRegisterFileBrowserRoutesBlocksCreateFileInDeploymentMode(t *testing.T) {
	t.Parallel()

	// The current createFile caller remains IDE-only even though the broader
	// file browser surface has explicit deployment-mode messaging.
	handler := newFileBrowserRouteTestHandler(t, config.ModeShare, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateFile, strings.NewReader(`{"filepath":"notes.json"}`))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func TestRegisterFileBrowserRoutesBlocksLauncherMode(t *testing.T) {
	t.Parallel()

	handler := newFileBrowserRouteTestHandler(t, config.ModeLauncher, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserRoot, strings.NewReader("null"))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Launcher mode does not allow this endpoint.") {
		t.Fatalf("expected launcher-mode message, got %q", response.Body.String())
	}
}

func newFileBrowserRouteService(t *testing.T, authService *auth.Service) (*filebrowser.Service, string, *binarypayload.Store, error) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	runtimeRoot := filepath.Join(root, "runtime-root")
	globalSettaFilesBase := filepath.Join(root, ".setta", "setta_files")
	for _, path := range []string{workspaceRoot, settaFilesRoot, runtimeRoot, globalSettaFilesBase} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "notes.txt"), []byte("route file body"), 0o644); err != nil {
		t.Fatalf("write route file: %v", err)
	}
	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		return nil, "", nil, err
	}
	service, err := filebrowser.NewService(filebrowser.ServiceOptions{
		WorkspaceRoot:        workspaceRoot,
		SettaFilesRoot:       settaFilesRoot,
		RuntimeRoot:          runtimeRoot,
		GlobalSettaFilesBase: globalSettaFilesBase,
		BinaryStore:          binaryStore,
		Sessions:             authService,
	})
	if err != nil {
		return nil, "", nil, err
	}
	return service, workspaceRoot, binaryStore, nil
}

func newFileBrowserRouteTestHandler(t *testing.T, mode config.Mode, authService *auth.Service, service *filebrowser.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterFileBrowserRoutes(r, FileBrowserRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Browser:    service,
			}); err != nil {
				t.Fatalf("register file browser routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}
