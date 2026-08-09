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
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
)

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
