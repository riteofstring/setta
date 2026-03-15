package httpapi

import (
	"bytes"
	"context"
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
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
)

type stubInfoService struct {
	mode string
	info RuntimeInfo
}

type testEnv map[string]string

func (e testEnv) lookup(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

func (s stubInfoService) ServerMode(context.Context) string {
	return s.mode
}

func (s stubInfoService) RuntimeInfo(context.Context) RuntimeInfo {
	return s.info
}

func TestHandlerServesFoundationRoutes(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info: stubInfoService{
			mode: "ide",
			info: RuntimeInfo{
				Mode: "ide",
				Paths: RuntimePaths{
					WorkspaceRoot:      "/tmp/workspace",
					SettaHome:          "/tmp/.setta",
					ProfileLookupHome:  "/tmp/.setta",
					SettaFilesRoot:     "/tmp/workspace/setta_files",
					SettaFilesLocation: "local",
					RuntimeRoot:        "/tmp/workspace/setta_files/runtime",
				},
				Policy: RuntimePathPolicy{
					GlobalSettaFilesBase: "/tmp/.setta/setta_files",
					AutoMode:             "create_local",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if healthResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", healthResponse.Code)
	}

	serverModeResponse := httptest.NewRecorder()
	handler.ServeHTTP(serverModeResponse, httptest.NewRequest(http.MethodGet, "/api/serverMode", nil))
	if serverModeResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", serverModeResponse.Code)
	}
	if strings.TrimSpace(serverModeResponse.Body.String()) != `{"mode":"ide"}` {
		t.Fatalf("unexpected server mode payload %q", serverModeResponse.Body.String())
	}

	runtimeInfoResponse := httptest.NewRecorder()
	handler.ServeHTTP(runtimeInfoResponse, httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil))
	if runtimeInfoResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", runtimeInfoResponse.Code)
	}

	var payload RuntimeInfo
	if err := json.Unmarshal(runtimeInfoResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode runtime info: %v", err)
	}
	if payload.Paths.SettaFilesLocation != "local" {
		t.Fatalf("expected local setta files location, got %q", payload.Paths.SettaFilesLocation)
	}
}

func TestHandlerAddsCORSHeadersToUnauthorizedDevFrontendRequests(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/serverMode", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	request.RemoteAddr = "10.0.0.5:1234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d with body %q", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:3000" {
		t.Fatalf("expected reflected CORS origin, got %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("expected credentials CORS header, got %q", got)
	}
}

func TestHandlerAutoAuthsLocalDevFrontendOriginRequests(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/runtimeInfo", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	request.RemoteAddr = "127.0.0.1:1234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if len(response.Result().Cookies()) != 1 {
		t.Fatalf("expected one auto-minted auth cookie, got %d", len(response.Result().Cookies()))
	}
}

func TestHandlerAutoAuthsLocalDevFrontendRefererRequests(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/runtimeInfo", nil)
	request.Header.Set("Origin", "http://evil.local")
	request.Header.Set("Referer", "http://127.0.0.1:3000/chat")
	request.RemoteAddr = "127.0.0.1:1234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if len(response.Result().Cookies()) != 1 {
		t.Fatalf("expected one auto-minted auth cookie, got %d", len(response.Result().Cookies()))
	}
}

func TestHandlerAutoAuthsLocalDevFrontendRequestsForAuthenticatedRootRoutes(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
		RegisterAuthenticatedRoot: func(r chi.Router) {
			r.Get("/mcp", func(w http.ResponseWriter, _ *http.Request) {
				writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/mcp", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	request.RemoteAddr = "127.0.0.1:1234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if len(response.Result().Cookies()) != 1 {
		t.Fatalf("expected one auto-minted auth cookie, got %d", len(response.Result().Cookies()))
	}
}

func TestHandlerHandlesJSONPreflightForConfiguredDevFrontendOrigin(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8000/api/loadAllProjectMetadata", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set("Access-Control-Request-Headers", "content-type,x-share-session-id")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d with body %q", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:3000" {
		t.Fatalf("expected reflected CORS origin, got %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, http.MethodPost) {
		t.Fatalf("expected POST in allowed methods, got %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Headers"); got != "content-type,x-share-session-id" {
		t.Fatalf("expected reflected preflight headers, got %q", got)
	}
}

func TestHandlerAllowsTrustedFrontendOriginsForCurrentSession(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: currentSession.Metadata.RuntimeRoot,
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	if _, err := trustedOrigins.TrustOrigin("http://127.0.0.1:9001", currentSession.Metadata.ID, time.Now().Add(time.Hour).Unix()); err != nil {
		t.Fatalf("trust origin: %v", err)
	}
	handler, err := NewHandler(Dependencies{
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:           stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:           authService,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/serverMode", nil)
	request.Header.Set("Origin", "http://127.0.0.1:9001")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d with body %q", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:9001" {
		t.Fatalf("expected trusted origin to be allowed for CORS, got %q", got)
	}
}

func TestHandlerReturnsJSONNotFoundEnvelope(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/missing", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"not_found"`) {
		t.Fatalf("expected not_found envelope, got %q", response.Body.String())
	}
}

func TestHandlerRecoversPanics(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			r.Get("/panic", func(http.ResponseWriter, *http.Request) {
				panic("boom")
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/panic", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"internal_error"`) {
		t.Fatalf("expected internal error envelope, got %q", response.Body.String())
	}
}

func TestHandlerProtectsIDEAPIUntilBootstrapConsume(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info: stubInfoService{
			mode: "ide",
			info: RuntimeInfo{Mode: "ide"},
		},
		Auth: authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	unauthorizedResponse := httptest.NewRecorder()
	handler.ServeHTTP(unauthorizedResponse, httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil))
	if unauthorizedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthorizedResponse.Code)
	}
	if !strings.Contains(unauthorizedResponse.Body.String(), `"code":"unauthorized"`) {
		t.Fatalf("expected unauthorized envelope, got %q", unauthorizedResponse.Body.String())
	}

	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest := httptest.NewRequest(
		http.MethodPost,
		"/__setta__/bootstrap/consume",
		bytes.NewBufferString(`{"token":"`+token+`"}`),
	)
	consumeRequest.Header.Set("Content-Type", "application/json")
	consumeResponse := httptest.NewRecorder()
	handler.ServeHTTP(consumeResponse, consumeRequest)
	if consumeResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", consumeResponse.Code, consumeResponse.Body.String())
	}
	if strings.TrimSpace(consumeResponse.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("unexpected bootstrap consume payload %q", consumeResponse.Body.String())
	}

	setCookieHeader := consumeResponse.Header().Get("Set-Cookie")
	if !strings.Contains(setCookieHeader, "setta_auth_abc123=") {
		t.Fatalf("expected session-scoped auth cookie, got %q", setCookieHeader)
	}
	responseCookies := consumeResponse.Result().Cookies()
	if len(responseCookies) != 1 {
		t.Fatalf("expected one auth cookie, got %d", len(responseCookies))
	}

	protectedRequest := httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil)
	protectedRequest.AddCookie(responseCookies[0])
	protectedResponse := httptest.NewRecorder()
	handler.ServeHTTP(protectedResponse, protectedRequest)
	if protectedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", protectedResponse.Code, protectedResponse.Body.String())
	}
}

func TestHandlerServesBootstrapPageWhenAuthEnabled(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, bootstrapPagePath, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected html content type, got %q", contentType)
	}
	if !strings.Contains(response.Body.String(), bootstrapConsumePath) {
		t.Fatalf("expected bootstrap page to reference consume path, got %q", response.Body.String())
	}
}

func TestBootstrapConsumeAcceptsBearerTokenWhenBodyOmitsToken(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info: stubInfoService{
			mode: "ide",
			info: RuntimeInfo{Mode: "ide"},
		},
		Auth: authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest := httptest.NewRequest(
		http.MethodPost,
		"/__setta__/bootstrap/consume",
		bytes.NewBufferString(`{}`),
	)
	consumeRequest.Header.Set("Content-Type", "application/json")
	consumeRequest.Header.Set("Authorization", "Bearer "+token)
	consumeResponse := httptest.NewRecorder()
	handler.ServeHTTP(consumeResponse, consumeRequest)
	if consumeResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", consumeResponse.Code, consumeResponse.Body.String())
	}
	if strings.TrimSpace(consumeResponse.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("unexpected bootstrap consume payload %q", consumeResponse.Body.String())
	}

	// Header-only bootstrap consume must mint the same auth cookie/session
	// context as the documented JSON-body token path.
	responseCookies := consumeResponse.Result().Cookies()
	if len(responseCookies) != 1 {
		t.Fatalf("expected one auth cookie, got %d", len(responseCookies))
	}

	protectedRequest := httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil)
	protectedRequest.AddCookie(responseCookies[0])
	protectedResponse := httptest.NewRecorder()
	handler.ServeHTTP(protectedResponse, protectedRequest)
	if protectedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", protectedResponse.Code, protectedResponse.Body.String())
	}
}

func TestBootstrapPageUsesDevFrontendRedirectWhenConfigured(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000"+bootstrapPagePath, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "http://127.0.0.1:3000/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8000") {
		t.Fatalf("expected dev frontend redirect in bootstrap page, got %q", response.Body.String())
	}
}

func TestBootstrapConsumeReturnsVerifiedLauncherOrigin(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: currentSession.Metadata.RuntimeRoot,
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	handler, err := NewHandler(Dependencies{
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:           stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:           authService,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}
	launcherOrigin := "http://127.0.0.1:9001"
	launcherOriginProof := frontendorigins.MintLauncherOriginHandoffProof(
		currentSession.Metadata.ID,
		launcherOrigin,
		currentSession.Secret,
	)

	requestBody := `{"token":"` + token + `","launcherOrigin":"` + launcherOrigin + `","launcherOriginProof":"` + launcherOriginProof + `"}`
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, bootstrapConsumePath, bytes.NewBufferString(requestBody))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode bootstrap consume payload: %v", err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected ok bootstrap consume payload, got %#v", payload)
	}
	if payload["launcherOrigin"] != launcherOrigin {
		t.Fatalf("expected launcher origin %q, got %#v", launcherOrigin, payload)
	}
	if !trustedOrigins.IsTrustedOrigin(launcherOrigin, currentSession.Metadata.ID) {
		t.Fatal("expected launcher origin to be trusted for current session")
	}
}

func TestBootstrapConsumeReturnsStoreUnavailableWhenTrustPersistenceFails(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	lockParent := filepath.Join(t.TempDir(), "lock-parent-as-file")
	if err := os.WriteFile(lockParent, []byte("not-a-directory"), 0o600); err != nil {
		t.Fatalf("write lock-parent file: %v", err)
	}
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: lockParent,
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	handler, err := NewHandler(Dependencies{
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:           stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:           authService,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}
	launcherOrigin := "http://127.0.0.1:9001"
	launcherOriginProof := frontendorigins.MintLauncherOriginHandoffProof(
		currentSession.Metadata.ID,
		launcherOrigin,
		currentSession.Secret,
	)

	requestBody := `{"token":"` + token + `","launcherOrigin":"` + launcherOrigin + `","launcherOriginProof":"` + launcherOriginProof + `"}`
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, bootstrapConsumePath, bytes.NewBufferString(requestBody))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"trusted_frontend_origin_store_unavailable"`) {
		t.Fatalf("expected trusted origin store failure payload, got %q", response.Body.String())
	}
}

func TestBootstrapPageIncludesLauncherHandoffAndWorkspaceHistoryStorage(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, bootstrapPagePath, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	html := response.Body.String()
	for _, needle := range []string{
		`const workspaceHistoryHandoffKey = "setta.workspaceHistoryHandoff";`,
		`localStorage.setItem(workspaceHistoryHandoffKey, trimmed);`,
		`const launcherOriginKey = "setta.launcherOrigin";`,
		`const launcherOriginStorage = sessionStorage;`,
		`hashParams.get("lo")`,
		`hashParams.get("lop")`,
		`hashParams.get("osw")`,
		`const openWorkspaceSwitcherQueryParam = "__setta_open_workspace_switcher";`,
		`redirect.searchParams.set(openWorkspaceSwitcherQueryParam, "1");`,
		`consumeBody.launcherOrigin = launcherOriginHandoff.origin;`,
		`consumeBody.launcherOriginProof = launcherOriginHandoff.proof;`,
		`launcherOriginStorage.setItem(launcherOriginKey, trimmed);`,
	} {
		if !strings.Contains(html, needle) {
			t.Fatalf("expected bootstrap page to contain %q, got %q", needle, html)
		}
	}
}

func TestHandlerRejectsReplayedBootstrapToken(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	requestBody := []byte(`{"token":"` + token + `"}`)
	firstResponse := httptest.NewRecorder()
	firstRequest := httptest.NewRequest(http.MethodPost, "/__setta__/bootstrap/consume", bytes.NewReader(requestBody))
	firstRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(firstResponse, firstRequest)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first consume to succeed, got %d", firstResponse.Code)
	}

	secondRequest := httptest.NewRequest(http.MethodPost, "/__setta__/bootstrap/consume", bytes.NewReader(requestBody))
	secondRequest.Header.Set("Content-Type", "application/json")
	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, secondRequest)
	if secondResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected replay to fail with 401, got %d", secondResponse.Code)
	}
	if !strings.Contains(secondResponse.Body.String(), `"code":"invalid_token"`) {
		t.Fatalf("expected invalid token envelope, got %q", secondResponse.Body.String())
	}
}

func TestHandlerProtectsAuthenticatedRootRoutes(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
		RegisterAuthenticatedRoot: func(r chi.Router) {
			r.Get("/mcp", func(w http.ResponseWriter, _ *http.Request) {
				writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	unauthorizedResponse := httptest.NewRecorder()
	handler.ServeHTTP(unauthorizedResponse, httptest.NewRequest(http.MethodGet, "/mcp", nil))
	if unauthorizedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthorizedResponse.Code)
	}

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	cookieName, err := authService.CookieName(currentSession.Metadata.ID)
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	authorizedRequest := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	authorizedRequest.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})
	authorizedResponse := httptest.NewRecorder()
	handler.ServeHTTP(authorizedResponse, authorizedRequest)
	if authorizedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", authorizedResponse.Code, authorizedResponse.Body.String())
	}
}

func TestHandlerReturnsBootstrapHTMLForUnauthorizedAuthenticatedRootRoutes(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
		RegisterAuthenticatedRoot: func(r chi.Router) {
			r.Get("/mcp", func(w http.ResponseWriter, _ *http.Request) {
				writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	unauthorizedResponse := httptest.NewRecorder()
	handler.ServeHTTP(unauthorizedResponse, httptest.NewRequest(http.MethodGet, "/mcp", nil))
	if unauthorizedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthorizedResponse.Code)
	}
	if contentType := unauthorizedResponse.Header().Get("Content-Type"); !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected html unauthorized content type, got %q", contentType)
	}
	body := unauthorizedResponse.Body.String()
	if !strings.Contains(body, "Setta Unauthorized") {
		t.Fatalf("expected unauthorized html title, got %q", body)
	}
	if !strings.Contains(body, bootstrapPagePath) {
		t.Fatalf("expected unauthorized html to link to bootstrap page, got %q", body)
	}
	if strings.Contains(body, `"code":"unauthorized"`) {
		t.Fatalf("did not expect json unauthorized envelope in html response, got %q", body)
	}
}

func TestHandlerInjectsRequestAuthContext(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
		Register: func(r chi.Router) {
			r.Get("/authContext", func(w http.ResponseWriter, r *http.Request) {
				requestInfo, err := auth.RequireRequestInfo(r)
				if err != nil {
					t.Fatalf("require request auth: %v", err)
				}
				writeJSON(w, http.StatusOK, map[string]string{
					"sessionId": requestInfo.SessionID,
					"source":    string(requestInfo.Source),
				})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest := httptest.NewRequest(
		http.MethodPost,
		"/__setta__/bootstrap/consume",
		bytes.NewBufferString(`{"token":"`+token+`"}`),
	)
	consumeRequest.Header.Set("Content-Type", "application/json")
	consumeResponse := httptest.NewRecorder()
	handler.ServeHTTP(consumeResponse, consumeRequest)
	if consumeResponse.Code != http.StatusOK {
		t.Fatalf("bootstrap consume failed with %d", consumeResponse.Code)
	}

	responseCookies := consumeResponse.Result().Cookies()
	if len(responseCookies) != 1 {
		t.Fatalf("expected one auth cookie, got %d", len(responseCookies))
	}

	protectedRequest := httptest.NewRequest(http.MethodGet, "/api/authContext", nil)
	protectedRequest.AddCookie(responseCookies[0])
	protectedResponse := httptest.NewRecorder()
	handler.ServeHTTP(protectedResponse, protectedRequest)
	if protectedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", protectedResponse.Code, protectedResponse.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(protectedResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode auth context payload: %v", err)
	}
	if payload["sessionId"] != "abc123" {
		t.Fatalf("expected session id abc123, got %q", payload["sessionId"])
	}
	if payload["source"] != "cookie" {
		t.Fatalf("expected source cookie, got %q", payload["source"])
	}
}

func TestHandlerBlocksIDEModeRouteInShareMode(t *testing.T) {
	t.Parallel()

	policy := modes.NewPolicy(config.ModeShare)
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: policy,
		Register: func(r chi.Router) {
			r.With(RequireIDEMode(policy)).Get("/ideOnly", func(w http.ResponseWriter, r *http.Request) {
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/ideOnly", nil))
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
		t.Fatalf("expected deployment mode message, got %q", response.Body.String())
	}
}

func TestHandlerShareSessionMiddlewareInjectsContext(t *testing.T) {
	t.Parallel()

	store := newTestHTTPShareSessionStore("header", "cookie", "query")
	policy := modes.NewPolicy(config.ModeShare)
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: policy,
		Register: func(r chi.Router) {
			r.With(RequireShareSession(modes.Resolver{
				Policy: policy,
				Store:  store,
			})).Get("/shareContext", func(w http.ResponseWriter, r *http.Request) {
				requestInfo, err := modes.RequireRequestInfo(r)
				if err != nil {
					t.Fatalf("require request mode info: %v", err)
				}
				writeJSON(w, http.StatusOK, map[string]string{
					"mode":           string(requestInfo.Policy.Mode()),
					"shareSessionId": requestInfo.ShareSessionID,
				})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/shareContext?shareSessionId=query", nil)
	request.Header.Set(modes.ShareSessionHeaderName, "header")
	request.AddCookie(&http.Cookie{
		Name:  modes.ShareSessionCookieName,
		Value: "cookie",
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share context payload: %v", err)
	}
	if payload["mode"] != "share" {
		t.Fatalf("expected share mode, got %q", payload["mode"])
	}
	if payload["shareSessionId"] != "header" {
		t.Fatalf("expected header precedence, got %q", payload["shareSessionId"])
	}
	if store.touched["header"] != 1 {
		t.Fatalf("expected touched share session count 1, got %d", store.touched["header"])
	}
}

func TestHandlerShareSessionMiddlewareRejectsMissingAndUnknownSessions(t *testing.T) {
	t.Parallel()

	store := newTestHTTPShareSessionStore("known")
	policy := modes.NewPolicy(config.ModeShare)
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: policy,
		Register: func(r chi.Router) {
			r.With(RequireShareSession(modes.Resolver{
				Policy: policy,
				Store:  store,
			})).Get("/shareContext", func(w http.ResponseWriter, r *http.Request) {
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, httptest.NewRequest(http.MethodGet, "/api/shareContext", nil))
	if missingResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", missingResponse.Code, missingResponse.Body.String())
	}
	if !strings.Contains(missingResponse.Body.String(), `"code":"missing_share_session"`) {
		t.Fatalf("expected missing_share_session envelope, got %q", missingResponse.Body.String())
	}

	unknownRequest := httptest.NewRequest(http.MethodGet, "/api/shareContext?shareSessionId=unknown", nil)
	unknownResponse := httptest.NewRecorder()
	handler.ServeHTTP(unknownResponse, unknownRequest)
	if unknownResponse.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", unknownResponse.Code, unknownResponse.Body.String())
	}
	if !strings.Contains(unknownResponse.Body.String(), `"code":"unknown_share_session"`) {
		t.Fatalf("expected unknown_share_session envelope, got %q", unknownResponse.Body.String())
	}
}

func TestHandlerRefreshesNearExpiryAuthCookieOnAPIResponses(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	now := time.Now().UTC()
	oldToken, _, err := authService.MintAuthCookie(now.Add(-(12 * time.Hour) + (30 * time.Minute)))
	if err != nil {
		t.Fatalf("mint old auth cookie: %v", err)
	}
	oldInfo, err := authService.ValidateAuthCookie(oldToken, now)
	if err != nil {
		t.Fatalf("validate old auth cookie: %v", err)
	}

	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil)
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: oldToken,
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	responseCookies := response.Result().Cookies()
	if len(responseCookies) != 1 {
		t.Fatalf("expected one refreshed auth cookie, got %d", len(responseCookies))
	}
	newInfo, err := authService.ValidateAuthCookie(responseCookies[0].Value, time.Now().UTC())
	if err != nil {
		t.Fatalf("validate refreshed auth cookie: %v", err)
	}
	if !newInfo.ExpiresAt.After(oldInfo.ExpiresAt) {
		t.Fatalf("expected refreshed cookie expiry after %s, got %s", oldInfo.ExpiresAt, newInfo.ExpiresAt)
	}
}

func TestHandlerDoesNotRefreshNearExpiryAuthCookieOnAuthenticatedRootRoutes(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
		RegisterAuthenticatedRoot: func(r chi.Router) {
			r.Get("/mcp", func(w http.ResponseWriter, _ *http.Request) {
				writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	now := time.Now().UTC()
	oldToken, _, err := authService.MintAuthCookie(now.Add(-(12 * time.Hour) + (30 * time.Minute)))
	if err != nil {
		t.Fatalf("mint old auth cookie: %v", err)
	}
	oldInfo, err := authService.ValidateAuthCookie(oldToken, now)
	if err != nil {
		t.Fatalf("validate old auth cookie: %v", err)
	}

	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: oldToken,
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	responseCookies := response.Result().Cookies()
	if len(responseCookies) != 0 {
		t.Fatalf("expected no refreshed auth cookie on authenticated root route, got %d", len(responseCookies))
	}
	validatedInfo, err := authService.ValidateAuthCookie(oldToken, time.Now().UTC())
	if err != nil {
		t.Fatalf("revalidate original auth cookie: %v", err)
	}
	if !validatedInfo.ExpiresAt.Equal(oldInfo.ExpiresAt) {
		t.Fatalf("expected root route to leave auth cookie expiry unchanged at %s, got %s", oldInfo.ExpiresAt, validatedInfo.ExpiresAt)
	}
}

func TestHandlerDoesNotRefreshFreshAuthCookieOnAPIResponses(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:   authService,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	freshToken, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint fresh auth cookie: %v", err)
	}
	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil)
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: freshToken,
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if cookieHeader := response.Header().Get("Set-Cookie"); cookieHeader != "" {
		t.Fatalf("expected no refreshed cookie header, got %q", cookieHeader)
	}
}

func TestHandlerRefreshesTrustedFrontendOriginExpiryWithAuthCookie(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}

	trustedNow := time.Now().UTC()
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: currentSession.Metadata.RuntimeRoot,
		Now:         func() time.Time { return trustedNow },
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}
	handler, err := NewHandler(Dependencies{
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:           stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:           authService,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	oldToken, _, err := authService.MintAuthCookie(trustedNow.Add(-(12 * time.Hour) + (30 * time.Minute)))
	if err != nil {
		t.Fatalf("mint old auth cookie: %v", err)
	}
	oldInfo, err := authService.ValidateAuthCookie(oldToken, trustedNow)
	if err != nil {
		t.Fatalf("validate old auth cookie: %v", err)
	}

	origin := "http://127.0.0.1:61234"
	if _, err := trustedOrigins.TrustOrigin(origin, currentSession.Metadata.ID, oldInfo.ExpiresAt.Unix()); err != nil {
		t.Fatalf("trust origin: %v", err)
	}

	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil)
	request.Header.Set("Origin", origin)
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: oldToken,
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if len(response.Result().Cookies()) != 1 {
		t.Fatalf("expected one refreshed auth cookie, got %d", len(response.Result().Cookies()))
	}

	trustedNow = oldInfo.ExpiresAt.Add(time.Second)
	if !trustedOrigins.IsTrustedOrigin(origin, currentSession.Metadata.ID) {
		t.Fatal("expected auth-cookie refresh to extend trusted frontend origin expiry")
	}
}

func newTestAuthService(t *testing.T) *auth.Service {
	t.Helper()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	sessionDir := filepath.Join(runtimeRoot, "sessions", sessionID)
	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          filepath.Join(tmpDir, "workspace"),
		WorkspacePathCanonical: filepath.Join(tmpDir, "workspace"),
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            runtimeRoot,
		ServerMode:             "ide",
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write metadata: %v", err)
	}

	service, err := auth.NewService(auth.Options{
		Mode:        config.ModeIDE,
		RuntimeRoot: runtimeRoot,
		EnvLookup: testEnv{
			"SETTA_SESSION_ID": sessionID,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("new auth service: %v", err)
	}
	return service
}

type testHTTPShareSessionStore struct {
	sessions map[string]bool
	touched  map[string]int
}

func newTestHTTPShareSessionStore(sessionIDs ...string) *testHTTPShareSessionStore {
	sessions := make(map[string]bool, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		sessions[sessionID] = true
	}
	return &testHTTPShareSessionStore{
		sessions: sessions,
		touched:  make(map[string]int),
	}
}

func (s *testHTTPShareSessionStore) HasSession(sessionID string) bool {
	return s.sessions[sessionID]
}

func (s *testHTTPShareSessionStore) TouchSession(sessionID string) error {
	s.touched[sessionID]++
	return nil
}
