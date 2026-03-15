package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/chatattachments"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type attachmentRouteSessionProvider struct {
	current *auth.CurrentSession
}

func (p attachmentRouteSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func TestRegisterAttachmentRootRoutesServesDownloadedAttachment(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("attachment body"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: attachmentRouteSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}
	payload, err := service.BuildPayload(chatattachments.BuildPayloadRequest{
		Messages: []map[string]any{
			{"attachments": []any{map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain"}}},
		},
		ProjectConfigID:     "project-alpha",
		IncludeDownloadURLs: true,
	})
	if err != nil {
		t.Fatalf("build payload: %v", err)
	}
	downloadURL := payload.AttachmentURLs["artifacts/notes.txt"]
	path := strings.TrimPrefix(downloadURL, "http://127.0.0.1:8000")

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    service,
	}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request = request.WithContext(modes.ContextWithRequestInfo(request.Context(), modes.RequestInfo{
		Policy: modes.NewPolicy(config.ModeIDE),
	}))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if response.Body.String() != "attachment body" {
		t.Fatalf("expected attachment body, got %q", response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "text/plain" {
		t.Fatalf("expected text/plain, got %q", got)
	}
	if got := response.Header().Get("Content-Disposition"); !strings.Contains(got, `filename="notes.txt"`) {
		t.Fatalf("expected content disposition filename, got %q", got)
	}
}

func TestRegisterAttachmentRootRoutesRejectsInvalidToken(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: attachmentRouteSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    service,
	}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/invalid", nil)
	request = request.WithContext(modes.ContextWithRequestInfo(request.Context(), modes.RequestInfo{
		Policy: modes.NewPolicy(config.ModeIDE),
	}))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_attachment_token" {
		t.Fatalf("expected invalid_attachment_token, got %#v", payload)
	}
}

func TestRegisterAttachmentRootRoutesRejectsExpiredToken(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	service := newAttachmentRouteTestService(t, root, nil)

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    service,
	}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	token := mintAttachmentRouteTestToken(t, attachmentRouteTestTokenPayload{
		ArtifactID: "artifacts/missing.txt",
		Exp:        time.Date(2026, 3, 10, 11, 59, 0, 0, time.UTC).Unix(),
	})
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/"+token, nil)
	request = request.WithContext(modes.ContextWithRequestInfo(request.Context(), modes.RequestInfo{
		Policy: modes.NewPolicy(config.ModeIDE),
	}))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_attachment_token" {
		t.Fatalf("expected invalid_attachment_token, got %#v", payload)
	}
}

func TestRegisterAttachmentRootRoutesRejectsShareSessionTokenInIDEMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	service := newAttachmentRouteTestService(t, root, nil)

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    service,
	}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	token := mintAttachmentRouteTestToken(t, attachmentRouteTestTokenPayload{
		ArtifactID:     "artifacts/missing.txt",
		Exp:            time.Date(2026, 3, 10, 12, 10, 0, 0, time.UTC).Unix(),
		ShareSessionID: "share-session",
	})
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/"+token, nil)
	request = request.WithContext(modes.ContextWithRequestInfo(request.Context(), modes.RequestInfo{
		Policy: modes.NewPolicy(config.ModeIDE),
	}))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "attachment_session_mismatch" {
		t.Fatalf("expected attachment_session_mismatch, got %#v", payload)
	}
}

func TestRegisterAttachmentRootRoutesRejectsUnknownProjectConfig(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("attachment body"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}
	service := newAttachmentRouteTestService(t, root, nil)

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    service,
	}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	token := mintAttachmentRouteTestToken(t, attachmentRouteTestTokenPayload{
		ArtifactID:      "artifacts/notes.txt",
		Exp:             time.Date(2026, 3, 10, 12, 10, 0, 0, time.UTC).Unix(),
		ProjectConfigID: "missing-project",
	})
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/"+token, nil)
	request = request.WithContext(modes.ContextWithRequestInfo(request.Context(), modes.RequestInfo{
		Policy: modes.NewPolicy(config.ModeIDE),
	}))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "project_config_not_found" {
		t.Fatalf("expected project_config_not_found, got %#v", payload)
	}
}

func TestRegisterAttachmentRootRoutesServeUnicodeFilenameWithEncodedDisposition(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	filename := "Screenshot 2026-01-30 8.59.34\u202fAM.png"
	if err := os.WriteFile(filepath.Join(artifactsRoot, filename), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}

	authService := newTestAuthService(t)
	service := newAttachmentRouteTestService(t, root, nil)
	handler := newAttachmentRouteTestHandler(t, config.ModeIDE, authService, service, nil)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAttachmentDownloadURL, strings.NewReader(`{"artifactId":"artifacts/`+filename+`"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload GetAttachmentDownloadURLResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode attachment url payload: %v", err)
	}

	fileRequest := httptest.NewRequest(http.MethodGet, strings.TrimPrefix(payload.URL, "http://example.com"), nil)
	fileResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileResponse, fileRequest)
	if fileResponse.Code != http.StatusOK {
		t.Fatalf("expected download 200, got %d with body %q", fileResponse.Code, fileResponse.Body.String())
	}
	if body := fileResponse.Body.String(); body != "hello" {
		t.Fatalf("expected attachment body %q, got %q", "hello", body)
	}
	contentDisposition := fileResponse.Header().Get("Content-Disposition")
	if !strings.Contains(contentDisposition, "filename*=") {
		t.Fatalf("expected RFC 5987 content disposition, got %q", contentDisposition)
	}
	if strings.Contains(contentDisposition, "\u202f") {
		t.Fatalf("expected unicode separator to be encoded out of content disposition, got %q", contentDisposition)
	}
	for _, r := range contentDisposition {
		if r > 127 {
			t.Fatalf("expected ascii-only content disposition header, got %q", contentDisposition)
		}
	}
}

func TestRegisterAttachmentRootRoutesRequiresService(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{})
	if err == nil {
		t.Fatal("expected missing service error")
	}
	if !strings.Contains(err.Error(), "attachment service is required") {
		t.Fatalf("expected missing service error, got %v", err)
	}
}

func TestRegisterAttachmentRoutesReturnsDownloadURLAndServesAttachment(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("attachment body"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}

	authService := newTestAuthService(t)
	service := newAttachmentRouteTestService(t, root, nil)
	handler := newAttachmentRouteTestHandler(t, config.ModeIDE, authService, service, nil)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAttachmentDownloadURL, strings.NewReader(`{"artifactId":"artifacts/notes.txt","projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload GetAttachmentDownloadURLResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode attachment url payload: %v", err)
	}
	if !strings.HasPrefix(payload.URL, "http://example.com/api/attachments/") {
		t.Fatalf("expected absolute attachment url, got %q", payload.URL)
	}

	fileRequest := httptest.NewRequest(http.MethodGet, strings.TrimPrefix(payload.URL, "http://example.com"), nil)
	fileResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileResponse, fileRequest)
	if fileResponse.Code != http.StatusOK {
		t.Fatalf("expected download 200, got %d with body %q", fileResponse.Code, fileResponse.Body.String())
	}
	if body := fileResponse.Body.String(); body != "attachment body" {
		t.Fatalf("expected attachment body %q, got %q", "attachment body", body)
	}
}

func TestRegisterAttachmentRoutesSkipsMissingEntriesInPluralResponse(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("attachment body"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}

	authService := newTestAuthService(t)
	service := newAttachmentRouteTestService(t, root, nil)
	handler := newAttachmentRouteTestHandler(t, config.ModeIDE, authService, service, nil)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAttachmentDownloadURLs, strings.NewReader(`{"artifactIds":["artifacts/notes.txt","artifacts/missing.txt"],"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload []AttachmentDownloadURLEntry
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode attachment url entries: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected one attachment url entry, got %#v", payload)
	}
	if payload[0].ArtifactID != "artifacts/notes.txt" {
		t.Fatalf("expected surviving attachment id, got %#v", payload)
	}
}

func TestRegisterAttachmentRoutesIncludesShareSessionForDeployment(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        config.ModeShare,
		Now:         &now,
		GeneratedID: "share-session",
		Policy: map[string]any{
			"allowFileDownloads": true,
		},
	})
	shareSession, _, err := deploymentRuntime.GetOrCreateSession("share-session")
	if err != nil {
		t.Fatalf("create deployment session: %v", err)
	}
	deploymentArtifactsRoot := filepath.Join(deploymentRuntime.Paths().DeploymentRoot, "artifacts")
	if err := os.MkdirAll(deploymentArtifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir deployment artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(deploymentArtifactsRoot, "notes.txt"), []byte("deployment attachment"), 0o644); err != nil {
		t.Fatalf("write deployment attachment: %v", err)
	}

	authService := newTestAuthService(t)
	service := newAttachmentRouteTestService(t, t.TempDir(), deploymentRuntime)
	handler := newAttachmentRouteTestHandler(t, config.ModeShare, authService, service, deploymentRuntime)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAttachmentDownloadURL, strings.NewReader(`{"artifactId":"artifacts/notes.txt","projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, shareSession.ID)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload GetAttachmentDownloadURLResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode deployment attachment url payload: %v", err)
	}
	if !strings.Contains(payload.URL, "shareSessionId="+shareSession.ID) {
		t.Fatalf("expected share session query in attachment url, got %q", payload.URL)
	}

	fileRequest := httptest.NewRequest(http.MethodGet, strings.TrimPrefix(payload.URL, "http://example.com"), nil)
	fileResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileResponse, fileRequest)
	if fileResponse.Code != http.StatusOK {
		t.Fatalf("expected deployment download 200, got %d with body %q", fileResponse.Code, fileResponse.Body.String())
	}
	if body := fileResponse.Body.String(); body != "deployment attachment" {
		t.Fatalf("expected deployment attachment body %q, got %q", "deployment attachment", body)
	}
}

func TestRegisterAttachmentRoutesRejectsDeploymentDownloadsWhenPolicyDisabled(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        config.ModeShare,
		Now:         &now,
		GeneratedID: "share-session",
		Policy: map[string]any{
			"allowFileDownloads": false,
		},
	})
	shareSession, _, err := deploymentRuntime.GetOrCreateSession("share-session")
	if err != nil {
		t.Fatalf("create deployment session: %v", err)
	}

	authService := newTestAuthService(t)
	service := newAttachmentRouteTestService(t, t.TempDir(), deploymentRuntime)
	handler := newAttachmentRouteTestHandler(t, config.ModeShare, authService, service, deploymentRuntime)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAttachmentDownloadURL, strings.NewReader(`{"artifactId":"artifacts/notes.txt","projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, shareSession.ID)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment policy disallows file downloads.") {
		t.Fatalf("expected deployment policy message, got %q", response.Body.String())
	}
}

func newAttachmentRouteTestService(
	t *testing.T,
	settaFilesRoot string,
	deploymentRuntime *deployments.Runtime,
) *chatattachments.Service {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Deployment:     deploymentRuntime,
		Sessions: attachmentRouteSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}
	return service
}

func newAttachmentRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	authService *auth.Service,
	service *chatattachments.Service,
	deploymentRuntime *deployments.Runtime,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(mode),
		RegisterRoot: func(r chi.Router) {
			if err := RegisterAttachmentRootRoutes(r, AttachmentRootRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				ShareSessions: deploymentRuntime,
				Deployment:    deploymentRuntime,
				Service:       service,
			}); err != nil {
				t.Fatalf("register attachment root routes: %v", err)
			}
		},
		Register: func(r chi.Router) {
			if err := RegisterAttachmentRoutes(r, AttachmentRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				ShareSessions: deploymentRuntime,
				Deployment:    deploymentRuntime,
				Service:       service,
			}); err != nil {
				t.Fatalf("register attachment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

type attachmentRouteTestTokenPayload struct {
	ArtifactID      string `json:"artifactId"`
	Exp             int64  `json:"exp"`
	ProjectConfigID string `json:"projectConfigId,omitempty"`
	ShareSessionID  string `json:"shareSessionId,omitempty"`
}

func mintAttachmentRouteTestToken(t *testing.T, payload attachmentRouteTestTokenPayload) string {
	t.Helper()

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal token payload: %v", err)
	}
	digest := hmac.New(sha256.New, []byte("secret"))
	if _, err := digest.Write(payloadBytes); err != nil {
		t.Fatalf("sign token payload: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString(payloadBytes) + "." + base64.RawURLEncoding.EncodeToString(digest.Sum(nil))
}
