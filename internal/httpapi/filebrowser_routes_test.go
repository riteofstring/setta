package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

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

func TestRegisterFileBrowserRoutesReturnsWorkspacePythonSignal(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	if err := os.WriteFile(filepath.Join(workspaceRoot, "pyproject.toml"), []byte("[project]\nname = \"demo\"\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetWorkspacePythonSignal, strings.NewReader(`{"folderPath":"`+workspaceRoot+`"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload filebrowser.WorkspacePythonSignalResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode workspace python payload: %v", err)
	}
	if payload.FolderPath != workspaceRoot {
		t.Fatalf("expected workspace folder path %q, got %q", workspaceRoot, payload.FolderPath)
	}
	if !payload.HasPython {
		t.Fatal("expected workspace python signal to be true")
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

func TestRegisterFileBrowserRoutesChecksIfFileExistsRelativeToWorkspaceAndRejectsOutsidePaths(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	if err := os.WriteFile(filepath.Join(workspaceRoot, "exists.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatalf("write workspace file: %v", err)
	}

	existsRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckIfFileExists, strings.NewReader(`{"filepath":"exists.txt"}`))
	existsRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, existsRequest, authService)

	existsResponse := httptest.NewRecorder()
	handler.ServeHTTP(existsResponse, existsRequest)
	if existsResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", existsResponse.Code, existsResponse.Body.String())
	}
	if strings.TrimSpace(existsResponse.Body.String()) != "true" {
		t.Fatalf("expected true response, got %q", existsResponse.Body.String())
	}

	blankRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckIfFileExists, strings.NewReader(`{"filepath":"   "}`))
	blankRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, blankRequest, authService)

	blankResponse := httptest.NewRecorder()
	handler.ServeHTTP(blankResponse, blankRequest)
	if blankResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", blankResponse.Code, blankResponse.Body.String())
	}
	if strings.TrimSpace(blankResponse.Body.String()) != "false" {
		t.Fatalf("expected false response for blank filepath, got %q", blankResponse.Body.String())
	}

	outsidePath := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outsidePath, []byte("outside"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	outsideRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckIfFileExists, strings.NewReader(`{"filepath":"`+outsidePath+`"}`))
	outsideRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, outsideRequest, authService)

	outsideResponse := httptest.NewRecorder()
	handler.ServeHTTP(outsideResponse, outsideRequest)
	if outsideResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", outsideResponse.Code, outsideResponse.Body.String())
	}
	if !strings.Contains(outsideResponse.Body.String(), `"code":"path_forbidden"`) {
		t.Fatalf("expected path_forbidden error, got %q", outsideResponse.Body.String())
	}
}

func TestRegisterFileBrowserRoutesCheckIfFileExistsAllowsShareDeploymentRootsOnly(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	deploymentRoot := t.TempDir()
	allowedPath := filepath.Join(deploymentRoot, "code", "run.py")
	blockedPath := filepath.Join(deploymentRoot, "manifest.json")
	for _, path := range []string{filepath.Dir(allowedPath), filepath.Dir(blockedPath)} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	if err := os.WriteFile(allowedPath, []byte("print('hi')"), 0o644); err != nil {
		t.Fatalf("write allowed deployment file: %v", err)
	}
	if err := os.WriteFile(blockedPath, []byte("{}"), 0o644); err != nil {
		t.Fatalf("write blocked deployment file: %v", err)
	}

	handler := newFileBrowserRouteTestHandlerWithDeploymentRoot(t, config.ModeShare, authService, nil, deploymentRoot)

	allowedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckIfFileExists, strings.NewReader(`{"filepath":"code/run.py"}`))
	allowedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, allowedRequest, authService)

	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowedRequest)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", allowedResponse.Code, allowedResponse.Body.String())
	}
	if strings.TrimSpace(allowedResponse.Body.String()) != "true" {
		t.Fatalf("expected true response for allowed deployment file, got %q", allowedResponse.Body.String())
	}

	blockedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckIfFileExists, strings.NewReader(`{"filepath":"manifest.json"}`))
	blockedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, blockedRequest, authService)

	blockedResponse := httptest.NewRecorder()
	handler.ServeHTTP(blockedResponse, blockedRequest)
	if blockedResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", blockedResponse.Code, blockedResponse.Body.String())
	}
	if !strings.Contains(blockedResponse.Body.String(), `"detail":"`+deploymentFileAccessRestrictionDetail+`"`) {
		t.Fatalf("expected deployment path restriction detail, got %q", blockedResponse.Body.String())
	}
}

func TestResolveDeploymentCheckPathRestrictsDeploymentRoots(t *testing.T) {
	t.Parallel()

	deploymentRoot := t.TempDir()
	allowedPaths := []string{
		filepath.Join(deploymentRoot, "artifacts", "bundle.zip"),
		filepath.Join(deploymentRoot, "json_sources", "data.json"),
		filepath.Join(deploymentRoot, "code", "run.py"),
	}
	for _, path := range allowedPaths {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	for _, rawPath := range []string{
		"artifacts/bundle.zip",
		filepath.Join(deploymentRoot, "json_sources", "data.json"),
		"code/run.py",
	} {
		resolved, status, detail, err := resolveDeploymentCheckPath(rawPath, deploymentRoot)
		if err != nil {
			t.Fatalf("resolve deployment path %q: %v", rawPath, err)
		}
		if status != 0 || detail != "" {
			t.Fatalf("expected allowed deployment path for %q, got status=%d detail=%q", rawPath, status, detail)
		}
		if filepath.Base(resolved) == "" {
			t.Fatalf("expected resolved path for %q, got %q", rawPath, resolved)
		}
	}

	_, status, detail, err := resolveDeploymentCheckPath("manifest.json", deploymentRoot)
	if err != nil {
		t.Fatalf("resolve blocked deployment path: %v", err)
	}
	if status != http.StatusForbidden || detail != deploymentFileAccessRestrictionDetail {
		t.Fatalf("expected blocked deployment path, got status=%d detail=%q", status, detail)
	}

	_, status, detail, err = resolveDeploymentCheckPath("code/run.py", "   ")
	if err != nil {
		t.Fatalf("resolve blank deployment root: %v", err)
	}
	if status != http.StatusBadRequest || detail != "Deployment root is not configured." {
		t.Fatalf("expected blank deployment root rejection, got status=%d detail=%q", status, detail)
	}
}

func TestRegisterFileBrowserRoutesChecksWorkspaceInitializationAndOutsideWorkspaceOptIn(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, globalSettaFilesBase, err := newFileBrowserRouteServiceWithRoots(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	initializedLocal := filepath.Join(workspaceRoot, "initialized-local")
	initializedLocalDev := filepath.Join(workspaceRoot, "initialized-local-dev")
	initializedGlobal := filepath.Join(workspaceRoot, "initialized-global")
	plain := filepath.Join(workspaceRoot, "plain")
	for _, path := range []string{initializedLocal, initializedLocalDev, initializedGlobal, plain} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	if err := os.MkdirAll(filepath.Join(initializedLocal, "setta_files"), 0o755); err != nil {
		t.Fatalf("mkdir initialized local root: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(initializedLocalDev, "setta_files_dev"), 0o755); err != nil {
		t.Fatalf("mkdir initialized local dev root: %v", err)
	}
	if err := os.MkdirAll(config.BuildFilesRootFromBase(globalSettaFilesBase, initializedGlobal), 0o755); err != nil {
		t.Fatalf("mkdir initialized global root: %v", err)
	}

	for _, testCase := range []struct {
		name       string
		folderPath string
		want       string
	}{
		{name: "initialized local", folderPath: initializedLocal, want: "true"},
		{name: "initialized local dev", folderPath: initializedLocalDev, want: "true"},
		{name: "initialized global", folderPath: initializedGlobal, want: "true"},
		{name: "plain", folderPath: plain, want: "false"},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckWorkspaceInitialized, strings.NewReader(`{"folderPath":"`+testCase.folderPath+`"}`))
			request.Header.Set("Content-Type", "application/json")
			addHTTPTestAuthCookie(t, request, authService)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}
			if strings.TrimSpace(response.Body.String()) != testCase.want {
				t.Fatalf("expected %s, got %q", testCase.want, response.Body.String())
			}
		})
	}

	outsideRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outsideRoot, "setta_files"), 0o755); err != nil {
		t.Fatalf("mkdir outside initialized root: %v", err)
	}

	blockedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckWorkspaceInitialized, strings.NewReader(`{"folderPath":"`+outsideRoot+`"}`))
	blockedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, blockedRequest, authService)

	blockedResponse := httptest.NewRecorder()
	handler.ServeHTTP(blockedResponse, blockedRequest)
	if blockedResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", blockedResponse.Code, blockedResponse.Body.String())
	}
	if !strings.Contains(blockedResponse.Body.String(), `"code":"path_forbidden"`) {
		t.Fatalf("expected path_forbidden error, got %q", blockedResponse.Body.String())
	}

	allowedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCheckWorkspaceInitialized, strings.NewReader(`{"folderPath":"`+outsideRoot+`","allowOutsideWorkspaceRoot":true}`))
	allowedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, allowedRequest, authService)

	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowedRequest)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", allowedResponse.Code, allowedResponse.Body.String())
	}
	if strings.TrimSpace(allowedResponse.Body.String()) != "true" {
		t.Fatalf("expected true response for allowed outside workspace path, got %q", allowedResponse.Body.String())
	}
}

func TestRegisterFileBrowserRoutesAllowOutsideWorkspaceFolderListingWhenEnabled(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, _, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	outsideRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outsideRoot, "outside-folder"), 0o755); err != nil {
		t.Fatalf("mkdir outside folder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outsideRoot, "outside-file.txt"), []byte("outside"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}

	blockedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFolderContents, strings.NewReader(`{"folderPath":"`+outsideRoot+`"}`))
	blockedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, blockedRequest, authService)

	blockedResponse := httptest.NewRecorder()
	handler.ServeHTTP(blockedResponse, blockedRequest)
	if blockedResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", blockedResponse.Code, blockedResponse.Body.String())
	}
	if !strings.Contains(blockedResponse.Body.String(), `"code":"path_forbidden"`) {
		t.Fatalf("expected path_forbidden error, got %q", blockedResponse.Body.String())
	}

	allowedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFolderContents, strings.NewReader(`{"folderPath":"`+outsideRoot+`","allowOutsideWorkspaceRoot":true}`))
	allowedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, allowedRequest, authService)

	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowedRequest)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", allowedResponse.Code, allowedResponse.Body.String())
	}

	var payload filebrowser.ListFolderResponse
	if err := json.Unmarshal(allowedResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode folder listing payload: %v", err)
	}
	names := make(map[string]filebrowser.FolderContentItem, len(payload.Items))
	for _, item := range payload.Items {
		names[item.Name] = item
	}
	if _, ok := names["outside-folder"]; !ok {
		t.Fatalf("expected outside-folder entry, got %#v", payload.Items)
	}
	if _, ok := names["outside-file.txt"]; !ok {
		t.Fatalf("expected outside-file.txt entry, got %#v", payload.Items)
	}

	relativeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetFolderContents,
		strings.NewReader(
			`{"baseFolderPath":"`+outsideRoot+`","folderPath":"outside-folder","allowOutsideWorkspaceRoot":true}`,
		),
	)
	relativeRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, relativeRequest, authService)

	relativeResponse := httptest.NewRecorder()
	handler.ServeHTTP(relativeResponse, relativeRequest)
	if relativeResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for relative outside-root listing, got %d with body %q", relativeResponse.Code, relativeResponse.Body.String())
	}

	var relativePayload filebrowser.ListFolderResponse
	if err := json.Unmarshal(relativeResponse.Body.Bytes(), &relativePayload); err != nil {
		t.Fatalf("decode relative folder payload: %v", err)
	}
	expectedResolvedFolder := filepath.Join(outsideRoot, "outside-folder")
	if relativePayload.FolderPath != expectedResolvedFolder {
		t.Fatalf("expected resolved relative folder path %q, got %q", expectedResolvedFolder, relativePayload.FolderPath)
	}
}

func TestRegisterFileBrowserRoutesReturnsFileStat(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	filePath := filepath.Join(workspaceRoot, "file-stat.txt")
	if err := os.WriteFile(filePath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write file stat fixture: %v", err)
	}
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("stat file stat fixture: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserFileStat, strings.NewReader(`{"path":"`+filePath+`"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload filebrowser.FileStatResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode file stat payload: %v", err)
	}
	if payload.Path != filePath {
		t.Fatalf("expected path %q, got %q", filePath, payload.Path)
	}
	if payload.MtimeNs != info.ModTime().UnixNano() {
		t.Fatalf("expected mtime %d, got %d", info.ModTime().UnixNano(), payload.MtimeNs)
	}
	if payload.Size != info.Size() {
		t.Fatalf("expected size %d, got %d", info.Size(), payload.Size)
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

	var payload filebrowser.ListFolderResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode folder payload: %v", err)
	}
	names := make(map[string]filebrowser.FolderContentItem, len(payload.Items))
	for _, item := range payload.Items {
		names[item.Name] = item
	}
	for _, name := range []string{".env", ".gitignore"} {
		if _, ok := names[name]; !ok {
			t.Fatalf("expected default listing to include %q, got %#v", name, payload.Items)
		}
	}
	for _, name := range []string{".git", ".venv", "node_modules", "setta_files"} {
		if _, ok := names[name]; ok {
			t.Fatalf("expected default listing to hide %q, got %#v", name, payload.Items)
		}
	}
}

func TestRegisterFileBrowserRoutesMapMissingAndNotDirectoryFolderErrors(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	missingFolder := filepath.Join(workspaceRoot, "missing-folder")
	missingRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFolderContents, strings.NewReader(`{"folderPath":"`+missingFolder+`"}`))
	missingRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, missingRequest, authService)

	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, missingRequest)
	assertFileBrowserRouteError(t, missingResponse, http.StatusNotFound, "path_not_found", "Path does not exist: "+missingFolder)

	notDirectoryPath := filepath.Join(workspaceRoot, "not-a-folder.txt")
	if err := os.WriteFile(notDirectoryPath, []byte("file"), 0o644); err != nil {
		t.Fatalf("write not-a-folder fixture: %v", err)
	}
	notDirectoryRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFolderContents, strings.NewReader(`{"folderPath":"`+notDirectoryPath+`"}`))
	notDirectoryRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, notDirectoryRequest, authService)

	notDirectoryResponse := httptest.NewRecorder()
	handler.ServeHTTP(notDirectoryResponse, notDirectoryRequest)
	assertFileBrowserRouteError(t, notDirectoryResponse, http.StatusBadRequest, "path_not_directory", "Path is not a directory: "+notDirectoryPath)
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

func TestRegisterFileBrowserRoutesMapReadAndWriteGuardErrors(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, binaryStore, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	oversizePath := filepath.Join(workspaceRoot, "oversize.txt")
	if err := os.WriteFile(oversizePath, []byte("too large"), 0o644); err != nil {
		t.Fatalf("write oversize file: %v", err)
	}
	oversizeRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserFileContent, strings.NewReader(`{"path":"`+oversizePath+`","maxBytes":4}`))
	oversizeRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, oversizeRequest, authService)

	oversizeResponse := httptest.NewRecorder()
	handler.ServeHTTP(oversizeResponse, oversizeRequest)
	if oversizeResponse.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d with body %q", oversizeResponse.Code, oversizeResponse.Body.String())
	}
	var oversizePayload errorResponse
	if err := json.Unmarshal(oversizeResponse.Body.Bytes(), &oversizePayload); err != nil {
		t.Fatalf("decode oversize error: %v", err)
	}
	if oversizePayload.Error.Code != "file_too_large" {
		t.Fatalf("expected file_too_large, got %#v", oversizePayload)
	}

	existingPath := filepath.Join(workspaceRoot, "existing.txt")
	if err := os.WriteFile(existingPath, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	createRef, err := binaryStore.StoreBytes([]byte("created"), "text/plain", false)
	if err != nil {
		t.Fatalf("store create payload: %v", err)
	}
	createOnlyRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteWriteFileBrowserContent, strings.NewReader(`{"path":"`+existingPath+`","contentId":"`+createRef.ContentID+`","expectedMtimeNs":null}`))
	createOnlyRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, createOnlyRequest, authService)

	createOnlyResponse := httptest.NewRecorder()
	handler.ServeHTTP(createOnlyResponse, createOnlyRequest)
	if createOnlyResponse.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", createOnlyResponse.Code, createOnlyResponse.Body.String())
	}
	var createOnlyPayload errorResponse
	if err := json.Unmarshal(createOnlyResponse.Body.Bytes(), &createOnlyPayload); err != nil {
		t.Fatalf("decode create-only error: %v", err)
	}
	if createOnlyPayload.Error.Code != "file_conflict" {
		t.Fatalf("expected file_conflict, got %#v", createOnlyPayload)
	}

	invalidPayloadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteWriteFileBrowserContent, strings.NewReader(`{"path":"`+filepath.Join(workspaceRoot, "invalid.txt")+`","contentId":"missing","expectedMtimeNs":null}`))
	invalidPayloadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, invalidPayloadRequest, authService)

	invalidPayloadResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidPayloadResponse, invalidPayloadRequest)
	if invalidPayloadResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", invalidPayloadResponse.Code, invalidPayloadResponse.Body.String())
	}
	var invalidPayload errorResponse
	if err := json.Unmarshal(invalidPayloadResponse.Body.Bytes(), &invalidPayload); err != nil {
		t.Fatalf("decode invalid payload error: %v", err)
	}
	if invalidPayload.Error.Code != "invalid_binary_content_payload" {
		t.Fatalf("expected invalid_binary_content_payload, got %#v", invalidPayload)
	}

	stalePath := filepath.Join(workspaceRoot, "stale.txt")
	if err := os.WriteFile(stalePath, []byte("old"), 0o644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}
	staleInfo, err := os.Stat(stalePath)
	if err != nil {
		t.Fatalf("stat stale file: %v", err)
	}
	updatedMtime := staleInfo.ModTime().Add(2 * time.Second)
	if err := os.Chtimes(stalePath, updatedMtime, updatedMtime); err != nil {
		t.Fatalf("touch stale file: %v", err)
	}
	updateRef, err := binaryStore.StoreBytes([]byte("updated"), "text/plain", false)
	if err != nil {
		t.Fatalf("store update payload: %v", err)
	}
	staleRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteWriteFileBrowserContent, strings.NewReader(`{"path":"`+stalePath+`","contentId":"`+updateRef.ContentID+`","expectedMtimeNs":`+strconv.FormatInt(staleInfo.ModTime().UnixNano(), 10)+`}`))
	staleRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, staleRequest, authService)

	staleResponse := httptest.NewRecorder()
	handler.ServeHTTP(staleResponse, staleRequest)
	if staleResponse.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", staleResponse.Code, staleResponse.Body.String())
	}
	var stalePayload errorResponse
	if err := json.Unmarshal(staleResponse.Body.Bytes(), &stalePayload); err != nil {
		t.Fatalf("decode stale error: %v", err)
	}
	if stalePayload.Error.Code != "file_conflict" {
		t.Fatalf("expected file_conflict, got %#v", stalePayload)
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

func TestRegisterFileBrowserRoutesBlocksTransferInDeploymentModeWithExplicitMessage(t *testing.T) {
	t.Parallel()

	handler := newFileBrowserRouteTestHandler(t, config.ModeShare, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteTransferFileBrowserEntry,
		strings.NewReader(`{"sourcePath":"notes.txt","destinationFolderPath":".","operation":"move"}`),
	)
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

func TestRegisterFileBrowserRoutesDownloadTokenMissesMatchSourceTransport(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, err := newFileBrowserRouteService(t, authService)
	if err != nil {
		t.Fatalf("new file browser route service: %v", err)
	}
	handler := newFileBrowserRouteTestHandler(t, config.ModeIDE, authService, service)

	invalidRequest := httptest.NewRequest(http.MethodGet, "/api/fileBrowser/invalid-token", nil)
	addHTTPTestAuthCookie(t, invalidRequest, authService)
	invalidResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidResponse, invalidRequest)
	assertFileBrowserRouteError(t, invalidResponse, http.StatusForbidden, "invalid_file_browser_token", "Invalid or expired file browser token.")

	mintURL := func(path string) string {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetFileBrowserDownloadURL, strings.NewReader(`{"paths":["`+path+`"]}`))
		request.Header.Set("Content-Type", "application/json")
		addHTTPTestAuthCookie(t, request, authService)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
		}

		var payload []filebrowser.FileBrowserDownloadURLEntry
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode download urls: %v", err)
		}
		if len(payload) != 1 {
			t.Fatalf("expected one download url, got %#v", payload)
		}
		return payload[0].URL
	}

	missingPath := filepath.Join(workspaceRoot, "missing-after-mint.txt")
	if err := os.WriteFile(missingPath, []byte("temp"), 0o644); err != nil {
		t.Fatalf("write mint file: %v", err)
	}
	missingURL := mintURL(missingPath)
	if err := os.Remove(missingPath); err != nil {
		t.Fatalf("remove minted file: %v", err)
	}
	missingRequest := httptest.NewRequest(http.MethodGet, strings.TrimPrefix(missingURL, "http://example.com"), nil)
	addHTTPTestAuthCookie(t, missingRequest, authService)
	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, missingRequest)
	assertFileBrowserRouteError(t, missingResponse, http.StatusNotFound, "path_not_found", "File not found.")

	notFilePath := filepath.Join(workspaceRoot, "folder-after-mint.txt")
	if err := os.WriteFile(notFilePath, []byte("temp"), 0o644); err != nil {
		t.Fatalf("write path-not-file mint target: %v", err)
	}
	notFileURL := mintURL(notFilePath)
	if err := os.Remove(notFilePath); err != nil {
		t.Fatalf("remove path-not-file target: %v", err)
	}
	if err := os.MkdirAll(notFilePath, 0o755); err != nil {
		t.Fatalf("replace mint target with directory: %v", err)
	}
	notFileRequest := httptest.NewRequest(http.MethodGet, strings.TrimPrefix(notFileURL, "http://example.com"), nil)
	addHTTPTestAuthCookie(t, notFileRequest, authService)
	notFileResponse := httptest.NewRecorder()
	handler.ServeHTTP(notFileResponse, notFileRequest)
	assertFileBrowserRouteError(t, notFileResponse, http.StatusBadRequest, "path_not_file", "File path is not a file.")
}

func TestWriteFileBrowserRouteErrorMapsKnownKindsAndFallsBack(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetFileBrowserRoot, nil)
	for kind, expected := range map[filebrowser.ErrorKind]struct {
		status int
		code   string
	}{
		filebrowser.ErrorInvalidRequest:       {status: http.StatusBadRequest, code: "invalid_request"},
		filebrowser.ErrorPathForbidden:        {status: http.StatusForbidden, code: "path_forbidden"},
		filebrowser.ErrorPathNotFound:         {status: http.StatusNotFound, code: "path_not_found"},
		filebrowser.ErrorPathNotFile:          {status: http.StatusBadRequest, code: "path_not_file"},
		filebrowser.ErrorPathNotDirectory:     {status: http.StatusBadRequest, code: "path_not_directory"},
		filebrowser.ErrorConflict:             {status: http.StatusConflict, code: "file_conflict"},
		filebrowser.ErrorTooLarge:             {status: http.StatusRequestEntityTooLarge, code: "file_too_large"},
		filebrowser.ErrorBinaryPayloadInvalid: {status: http.StatusBadRequest, code: "invalid_binary_content_payload"},
		filebrowser.ErrorTokenUnavailable:     {status: http.StatusInternalServerError, code: "file_browser_token_unavailable"},
		filebrowser.ErrorInvalidDownloadToken: {status: http.StatusForbidden, code: "invalid_file_browser_token"},
	} {
		response := httptest.NewRecorder()
		writeFileBrowserRouteError(response, request, &filebrowser.Error{Kind: kind, Message: "mapped message"})
		assertFileBrowserRouteError(t, response, expected.status, expected.code, "mapped message")
	}

	internalResponse := httptest.NewRecorder()
	writeFileBrowserRouteError(internalResponse, request, &filebrowser.Error{Kind: filebrowser.ErrorKind("unexpected"), Message: "ignored"})
	assertFileBrowserRouteError(t, internalResponse, http.StatusInternalServerError, "internal_error", "Internal Server Error")

	plainResponse := httptest.NewRecorder()
	writeFileBrowserRouteError(plainResponse, request, os.ErrPermission)
	assertFileBrowserRouteError(t, plainResponse, http.StatusInternalServerError, "internal_error", "Internal Server Error")
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
	service, workspaceRoot, binaryStore, _, err := newFileBrowserRouteServiceWithRoots(t, authService)
	return service, workspaceRoot, binaryStore, err
}

func newFileBrowserRouteServiceWithRoots(t *testing.T, authService *auth.Service) (*filebrowser.Service, string, *binarypayload.Store, string, error) {
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
		return nil, "", nil, "", err
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
		return nil, "", nil, "", err
	}
	return service, workspaceRoot, binaryStore, globalSettaFilesBase, nil
}

func newFileBrowserRouteTestHandler(t *testing.T, mode config.Mode, authService *auth.Service, service *filebrowser.Service) http.Handler {
	t.Helper()
	return newFileBrowserRouteTestHandlerWithDeploymentRoot(t, mode, authService, service, "")
}

func newFileBrowserRouteTestHandlerWithDeploymentRoot(
	t *testing.T,
	mode config.Mode,
	authService *auth.Service,
	service *filebrowser.Service,
	deploymentRoot string,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterFileBrowserRoutes(r, FileBrowserRouteDependencies{
				ModePolicy:     modes.NewPolicy(mode),
				DeploymentRoot: deploymentRoot,
				Browser:        service,
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

func assertFileBrowserRouteError(t *testing.T, response *httptest.ResponseRecorder, expectedStatus int, expectedCode string, expectedMessage string) {
	t.Helper()

	if response.Code != expectedStatus {
		t.Fatalf("expected %d, got %d with body %q", expectedStatus, response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode file-browser error payload: %v", err)
	}
	if payload.Error.Code != expectedCode || payload.Error.Message != expectedMessage {
		t.Fatalf("expected %s/%q, got %#v", expectedCode, expectedMessage, payload)
	}
}
