package auth

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/config"
)

type envMap map[string]string

func (e envMap) lookup(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

func TestLoadCurrentSessionUsesRuntimeRootFallback(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	secret := []byte("test-secret")
	metadata := writeSessionFixture(t, runtimeRoot, sessionID, secret)

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup: envMap{
			sessionIDEnv: sessionID,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session: %v", err)
	}
	if currentSession == nil {
		t.Fatal("expected current session")
	}
	if currentSession.Metadata.ID != metadata.ID {
		t.Fatalf("expected session id %q, got %q", metadata.ID, currentSession.Metadata.ID)
	}
	if string(currentSession.Secret) != string(secret) {
		t.Fatalf("expected session secret %q, got %q", string(secret), string(currentSession.Secret))
	}
}

func TestServiceBootstrapTokenRoundTripRejectsReplay(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, err := service.MintBootstrapToken(issuedAt)
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	requestInfo, err := service.ConsumeBootstrapToken(token, issuedAt.Add(time.Minute))
	if err != nil {
		t.Fatalf("consume bootstrap token: %v", err)
	}
	if requestInfo.Source != AuthSourceBootstrap {
		t.Fatalf("expected bootstrap source, got %q", requestInfo.Source)
	}

	_, err = service.ConsumeBootstrapToken(token, issuedAt.Add(2*time.Minute))
	if err == nil {
		t.Fatal("expected replayed bootstrap token to fail")
	}
	if err != ErrInvalidBootstrapToken {
		t.Fatalf("expected invalid bootstrap token, got %v", err)
	}
}

func TestServiceBootstrapTokenRejectsExpiry(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, err := service.MintBootstrapToken(issuedAt)
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	_, err = service.ConsumeBootstrapToken(token, issuedAt.Add(11*time.Minute))
	if err == nil {
		t.Fatal("expected expired bootstrap token to fail")
	}
	if err != ErrInvalidBootstrapToken {
		t.Fatalf("expected invalid bootstrap token, got %v", err)
	}
}

func TestServiceAuthCookieRoundTrip(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, payload, err := service.MintAuthCookie(issuedAt)
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	if payload.Exp <= issuedAt.Unix() {
		t.Fatalf("expected future expiry, got %d", payload.Exp)
	}

	requestInfo, err := service.ValidateAuthCookie(token, issuedAt.Add(time.Minute))
	if err != nil {
		t.Fatalf("validate auth cookie: %v", err)
	}
	if requestInfo.Source != AuthSourceCookie {
		t.Fatalf("expected cookie source, got %q", requestInfo.Source)
	}
	if requestInfo.SessionID != payload.SessionID {
		t.Fatalf("expected session id %q, got %q", payload.SessionID, requestInfo.SessionID)
	}
}

func TestServiceCookieNameIsSessionScopedAndSanitized(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "setta auth/name")

	cookieName, err := service.CookieName("abc123")
	if err != nil {
		t.Fatalf("build cookie name: %v", err)
	}
	if cookieName != "setta_auth_name_abc123" {
		t.Fatalf("expected sanitized session-scoped cookie name, got %q", cookieName)
	}
}

func TestServiceShouldRefreshNearExpiryAuthCookie(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	now := time.Now().UTC()
	issuedAt := now.Add(-(12 * time.Hour) + (30 * time.Minute))

	token, _, err := service.MintAuthCookie(issuedAt)
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}

	requestInfo, err := service.ValidateAuthCookie(token, now)
	if err != nil {
		t.Fatalf("validate auth cookie: %v", err)
	}
	if service.ShouldRefreshAuthCookie(requestInfo, now) != true {
		t.Fatal("expected near-expiry auth cookie to require refresh")
	}
}

func TestServiceDoesNotRefreshFreshAuthCookie(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	now := time.Now().UTC()

	token, _, err := service.MintAuthCookie(now)
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}

	requestInfo, err := service.ValidateAuthCookie(token, now)
	if err != nil {
		t.Fatalf("validate auth cookie: %v", err)
	}
	if service.ShouldRefreshAuthCookie(requestInfo, now) {
		t.Fatal("expected fresh auth cookie to skip refresh")
	}
}

func TestRequireRequestInfoReturnsErrorWhenMissing(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest("GET", "/api/test", nil)
	_, err := RequireRequestInfo(request)
	if !errors.Is(err, ErrMissingRequestInfo) {
		t.Fatalf("expected missing request info error, got %v", err)
	}
}

func newTestService(t *testing.T, profileCookieName string) *Service {
	t.Helper()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	secret := []byte("test-secret")
	writeSessionFixture(t, runtimeRoot, sessionID, secret)

	service, err := NewService(Options{
		Mode:              config.ModeIDE,
		RuntimeRoot:       runtimeRoot,
		ProfileCookieName: profileCookieName,
		EnvLookup: envMap{
			sessionIDEnv: sessionID,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("new auth service: %v", err)
	}
	return service
}

func writeSessionFixture(t *testing.T, runtimeRoot string, sessionID string, secret []byte) SessionMetadata {
	t.Helper()

	sessionDir := filepath.Join(runtimeRoot, "sessions", sessionID)
	secretPath := filepath.Join(sessionDir, "secret")
	metadata := SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          filepath.Join(runtimeRoot, "..", "workspace"),
		WorkspacePathCanonical: filepath.Join(runtimeRoot, "..", "workspace"),
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            runtimeRoot,
		ServerMode:             "ide",
	}

	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	if err := os.WriteFile(secretPath, secret, 0o600); err != nil {
		t.Fatalf("write secret: %v", err)
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write metadata: %v", err)
	}
	return metadata
}
