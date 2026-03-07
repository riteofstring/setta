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
