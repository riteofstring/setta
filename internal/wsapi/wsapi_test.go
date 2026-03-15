package wsapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
)

type testEnv map[string]string

func (e testEnv) lookup(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

type testShareSessionStore struct {
	sessions map[string]bool
	touched  map[string]int
}

func newTestShareSessionStore(sessionIDs ...string) *testShareSessionStore {
	sessions := make(map[string]bool, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		sessions[sessionID] = true
	}
	return &testShareSessionStore{
		sessions: sessions,
		touched:  make(map[string]int),
	}
}

func (s *testShareSessionStore) HasSession(sessionID string) bool {
	return s.sessions[sessionID]
}

func (s *testShareSessionStore) TouchSession(sessionID string) error {
	s.touched[sessionID]++
	return nil
}

func TestAuthenticatedHandlerClosesUnauthorizedWebsocket(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	server := newWebsocketServer(t, Dependencies{
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}, func(ctx context.Context, conn *websocket.Conn, info ConnectionInfo) error {
		return conn.Write(ctx, websocket.MessageText, []byte("ok"))
	})
	defer server.Close()

	conn, _, err := websocket.Dial(context.Background(), websocketURL(server.URL, "/ws"), nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.CloseNow()

	_, _, err = conn.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeUnauthorized {
		t.Fatalf("expected unauthorized close code %d, got %d", CloseCodeUnauthorized, status)
	}
}

func TestAuthenticatedHandlerAcceptsBootstrapBearerToken(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	token, err := authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	server := newWebsocketServer(t, Dependencies{
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}, func(ctx context.Context, conn *websocket.Conn, info ConnectionInfo) error {
		authInfo, ok := auth.RequestInfoFromContext(ctx)
		if !ok {
			t.Fatal("expected auth request info in websocket context")
		}
		if authInfo.Source != auth.AuthSourceBootstrap {
			t.Fatalf("expected bootstrap auth source, got %q", authInfo.Source)
		}
		return conn.Write(ctx, websocket.MessageText, []byte("bootstrap"))
	})
	defer server.Close()

	headers := http.Header{
		"Authorization": []string{"Bearer " + token},
	}
	conn, _, err := websocket.Dial(context.Background(), websocketURL(server.URL, "/ws"), &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.CloseNow()

	_, payload, err := conn.Read(context.Background())
	if err != nil {
		t.Fatalf("read websocket payload: %v", err)
	}
	if string(payload) != "bootstrap" {
		t.Fatalf("expected bootstrap payload, got %q", string(payload))
	}
}

func TestAuthenticatedHandlerAcceptsAuthCookie(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	server := newWebsocketServer(t, Dependencies{
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}, func(ctx context.Context, conn *websocket.Conn, info ConnectionInfo) error {
		authInfo, ok := auth.RequestInfoFromContext(ctx)
		if !ok {
			t.Fatal("expected auth request info in websocket context")
		}
		if authInfo.Source != auth.AuthSourceCookie {
			t.Fatalf("expected cookie auth source, got %q", authInfo.Source)
		}
		return conn.Write(ctx, websocket.MessageText, []byte("cookie"))
	})
	defer server.Close()

	headers := http.Header{
		"Cookie": []string{cookieName + "=" + token},
	}
	conn, _, err := websocket.Dial(context.Background(), websocketURL(server.URL, "/ws"), &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.CloseNow()

	_, payload, err := conn.Read(context.Background())
	if err != nil {
		t.Fatalf("read websocket payload: %v", err)
	}
	if string(payload) != "cookie" {
		t.Fatalf("expected cookie payload, got %q", string(payload))
	}
}

func TestAuthenticatedHandlerResolvesShareSessionInDeploymentMode(t *testing.T) {
	t.Parallel()

	store := newTestShareSessionStore("share-a")
	server := newWebsocketServer(t, Dependencies{
		ModePolicy:    modes.NewPolicy(config.ModeShare),
		ShareSessions: store,
	}, func(ctx context.Context, conn *websocket.Conn, info ConnectionInfo) error {
		modeInfo, ok := modes.RequestInfoFromContext(ctx)
		if !ok {
			t.Fatal("expected mode request info in websocket context")
		}
		payload, err := json.Marshal(map[string]string{
			"mode":           string(modeInfo.Policy.Mode()),
			"shareSessionId": modeInfo.ShareSessionID,
		})
		if err != nil {
			t.Fatalf("marshal websocket payload: %v", err)
		}
		return conn.Write(ctx, websocket.MessageText, payload)
	})
	defer server.Close()

	conn, _, err := websocket.Dial(
		context.Background(),
		websocketURL(server.URL, "/ws?shareSessionId=share-a"),
		nil,
	)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.CloseNow()

	_, payload, err := conn.Read(context.Background())
	if err != nil {
		t.Fatalf("read websocket payload: %v", err)
	}

	var decoded map[string]string
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode websocket payload: %v", err)
	}
	if decoded["mode"] != "share" {
		t.Fatalf("expected share mode, got %q", decoded["mode"])
	}
	if decoded["shareSessionId"] != "share-a" {
		t.Fatalf("expected share session id share-a, got %q", decoded["shareSessionId"])
	}
	if store.touched["share-a"] != 1 {
		t.Fatalf("expected share session touch count 1, got %d", store.touched["share-a"])
	}
}

func TestAuthenticatedHandlerClosesMissingAndUnknownShareSession(t *testing.T) {
	t.Parallel()

	server := newWebsocketServer(t, Dependencies{
		ModePolicy:    modes.NewPolicy(config.ModeShare),
		ShareSessions: newTestShareSessionStore("known"),
	}, func(ctx context.Context, conn *websocket.Conn, info ConnectionInfo) error {
		return conn.Write(ctx, websocket.MessageText, []byte("ok"))
	})
	defer server.Close()

	missingConn, _, err := websocket.Dial(context.Background(), websocketURL(server.URL, "/ws"), nil)
	if err != nil {
		t.Fatalf("dial websocket without share session: %v", err)
	}
	defer missingConn.CloseNow()
	_, _, err = missingConn.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeBadRequest {
		t.Fatalf("expected missing-share close code %d, got %d", CloseCodeBadRequest, status)
	}

	unknownConn, _, err := websocket.Dial(
		context.Background(),
		websocketURL(server.URL, "/ws?shareSessionId=unknown"),
		nil,
	)
	if err != nil {
		t.Fatalf("dial websocket with unknown share session: %v", err)
	}
	defer unknownConn.CloseNow()
	_, _, err = unknownConn.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeNotFound {
		t.Fatalf("expected unknown-share close code %d, got %d", CloseCodeNotFound, status)
	}
}

func newWebsocketServer(t *testing.T, deps Dependencies, handler Handler) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.Handle("/ws", AuthenticatedHandler(deps, handler))
	return httptest.NewServer(mux)
}

func websocketURL(serverURL string, path string) string {
	return "ws" + strings.TrimPrefix(serverURL, "http") + path
}

func newTestAuthService(t *testing.T, mode config.Mode) *auth.Service {
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
		Mode:        mode,
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
