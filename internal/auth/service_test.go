package auth

import (
	"encoding/base64"
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

func TestLoadCurrentSessionUsesSessionsRootOverride(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	overrideRuntimeRoot := filepath.Join(tmpDir, "override-runtime")
	sessionID := "abc123"
	secret := []byte("test-secret")
	metadata := writeSessionFixture(t, overrideRuntimeRoot, sessionID, secret)

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: filepath.Join(tmpDir, "unused-runtime"),
		EnvLookup: envMap{
			sessionIDEnv:    sessionID,
			sessionsRootEnv: filepath.Join(overrideRuntimeRoot, "sessions"),
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session with sessions root override: %v", err)
	}
	if currentSession == nil {
		t.Fatal("expected current session from sessions root override")
	}

	// The retained Python helpers rely on SETTA_SESSIONS_ROOT so auth helpers can
	// resolve a session outside the current working/runtime root.
	if currentSession.Metadata.ID != metadata.ID {
		t.Fatalf("expected session id %q, got %q", metadata.ID, currentSession.Metadata.ID)
	}
	if string(currentSession.Secret) != string(secret) {
		t.Fatalf("expected session secret %q, got %q", string(secret), string(currentSession.Secret))
	}
}

func TestLoadCurrentSessionPrefersExplicitEnvSession(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")

	writeSessionFixture(t, runtimeRoot, "session-a", []byte("first-secret"))
	selectedMetadata := writeSessionFixture(t, runtimeRoot, "session-b", []byte("second-secret"))

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup: envMap{
			sessionIDEnv: "session-b",
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session with explicit env session: %v", err)
	}
	if currentSession == nil {
		t.Fatal("expected current session from explicit env selection")
	}

	// When multiple session directories exist, the explicit SETTA_SESSION_ID must
	// stay authoritative instead of drifting to another on-disk session.
	if currentSession.Metadata.ID != selectedMetadata.ID {
		t.Fatalf("expected selected session id %q, got %q", selectedMetadata.ID, currentSession.Metadata.ID)
	}
	if string(currentSession.Secret) != "second-secret" {
		t.Fatalf("expected selected session secret %q, got %q", "second-secret", string(currentSession.Secret))
	}
}

func TestLoadCurrentSessionReturnsNilWithoutSessionID(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	writeSessionFixture(t, runtimeRoot, "abc123", []byte("test-secret"))

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup:   envMap{}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session without session id: %v", err)
	}
	if currentSession != nil {
		t.Fatalf("expected nil current session without session id, got %#v", currentSession)
	}
}

func TestLoadCurrentSessionReturnsNilWhenSecretMissing(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	secret := []byte("test-secret")
	metadata := writeSessionFixture(t, runtimeRoot, sessionID, secret)
	if err := os.Remove(metadata.SecretPath); err != nil {
		t.Fatalf("remove session secret: %v", err)
	}

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup: envMap{
			sessionIDEnv: sessionID,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session with missing secret: %v", err)
	}
	if currentSession != nil {
		t.Fatalf("expected nil current session when secret is missing, got %#v", currentSession)
	}
}

func TestLoadCurrentSessionReturnsNilWhenCanonicalWorkspacePathMissing(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	metadata := writeSessionFixture(t, runtimeRoot, sessionID, []byte("test-secret"))
	metadata.WorkspacePathCanonical = ""
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal invalid metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(runtimeRoot, "sessions", sessionID, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("rewrite invalid metadata: %v", err)
	}

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup: envMap{
			sessionIDEnv: sessionID,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session with missing canonical workspace path: %v", err)
	}
	if currentSession != nil {
		t.Fatalf("expected nil current session when canonical workspace path is missing, got %#v", currentSession)
	}
}

func TestLoadCurrentSessionReturnsNilWhenServerModeMissing(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	metadata := writeSessionFixture(t, runtimeRoot, sessionID, []byte("test-secret"))
	metadata.ServerMode = ""
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal invalid metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(runtimeRoot, "sessions", sessionID, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("rewrite invalid metadata: %v", err)
	}

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup: envMap{
			sessionIDEnv: sessionID,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load current session with missing server mode: %v", err)
	}
	if currentSession != nil {
		t.Fatalf("expected nil current session when server mode is missing, got %#v", currentSession)
	}
}

func TestLoadCurrentSessionReturnsNilAfterSecretDeletedOnLaterCall(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	sessionID := "abc123"
	secret := []byte("test-secret")
	metadata := writeSessionFixture(t, runtimeRoot, sessionID, secret)

	envLookup := envMap{
		sessionIDEnv: sessionID,
	}.lookup

	currentSession, err := LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup:   envLookup,
	})
	if err != nil {
		t.Fatalf("initial load current session: %v", err)
	}
	if currentSession == nil {
		t.Fatal("expected initial current session")
	}

	if err := os.Remove(metadata.SecretPath); err != nil {
		t.Fatalf("remove session secret: %v", err)
	}

	currentSession, err = LoadCurrentSession(LoadCurrentSessionOptions{
		RuntimeRoot: runtimeRoot,
		EnvLookup:   envLookup,
	})
	if err != nil {
		t.Fatalf("load current session after deleting secret: %v", err)
	}
	if currentSession != nil {
		t.Fatalf("expected nil current session after deleting secret, got %#v", currentSession)
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

func TestNonceTrackerPrunesExpiredNonces(t *testing.T) {
	t.Parallel()

	tracker := NewNonceTracker()
	tracker.Consume("session-1", "nonce-1", 10, 0)

	if !tracker.IsConsumed("session-1", "nonce-1", 0) {
		t.Fatal("expected nonce to remain consumed before expiry")
	}
	if tracker.IsConsumed("session-1", "nonce-1", 10) {
		t.Fatal("expected expired nonce to be pruned at expiry time")
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

func TestServiceBootstrapTokenRejectsTamperedSignature(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, err := service.MintBootstrapToken(issuedAt)
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	tampered := token + "x"

	_, err = service.ConsumeBootstrapToken(tampered, issuedAt.Add(time.Minute))
	if err == nil {
		t.Fatal("expected tampered bootstrap token to fail")
	}
	if err != ErrInvalidBootstrapToken {
		t.Fatalf("expected invalid bootstrap token, got %v", err)
	}
}

func TestLaunchIntentTokenRoundTripUsesPurposeScopedPayload(t *testing.T) {
	t.Parallel()

	manager := NewLaunchIntentTokenManager(10 * time.Minute)
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, exp, err := manager.Mint("session-1", []byte("test-secret"), issuedAt)
	if err != nil {
		t.Fatalf("mint launch intent token: %v", err)
	}

	payload, err := manager.Validate(token, []byte("test-secret"), issuedAt.Add(time.Minute))
	if err != nil {
		t.Fatalf("validate launch intent token: %v", err)
	}
	if payload.SessionID != "session-1" {
		t.Fatalf("expected session-1 session id, got %q", payload.SessionID)
	}
	if payload.Exp != exp {
		t.Fatalf("expected exp %d, got %d", exp, payload.Exp)
	}
	if payload.Purpose != "launch_intent" {
		t.Fatalf("expected launch_intent purpose, got %q", payload.Purpose)
	}
	if payload.Nonce == "" {
		t.Fatal("expected launch intent nonce")
	}
}

func TestServiceBootstrapTokenRejectsLaunchIntentToken(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	currentSession, ok := service.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	manager := NewLaunchIntentTokenManager(10 * time.Minute)
	token, _, err := manager.Mint(currentSession.Metadata.ID, currentSession.Secret, issuedAt)
	if err != nil {
		t.Fatalf("mint launch intent token: %v", err)
	}

	_, err = service.ConsumeBootstrapToken(token, issuedAt.Add(time.Minute))
	if err != ErrInvalidBootstrapToken {
		t.Fatalf("expected launch intent token to be rejected as bootstrap token, got %v", err)
	}
}

func TestServiceBootstrapTokenRejectsMismatchedSessionID(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	currentSession, ok := service.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, err := encodeSignedToken(map[string]any{
		"exp":       issuedAt.Add(time.Minute).Unix(),
		"nonce":     "nonce-1",
		"sessionId": "other-session",
	}, currentSession.Secret)
	if err != nil {
		t.Fatalf("encode bootstrap token: %v", err)
	}

	if _, err := service.ConsumeBootstrapToken(token, issuedAt); err != ErrInvalidBootstrapToken {
		t.Fatalf("expected mismatched session bootstrap token to fail closed, got %v", err)
	}
}

func TestServiceBootstrapTokenRejectsMalformedPayloadOrEncoding(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	currentSession, ok := service.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	testCases := []struct {
		name  string
		token string
	}{
		{
			name:  "invalid_format",
			token: "not-a-token",
		},
		{
			name:  "invalid_base64",
			token: "!!!.abc",
		},
		{
			name:  "invalid_json_payload",
			token: mustSignedRawToken(t, []byte("{"), currentSession.Secret),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if _, err := service.ConsumeBootstrapToken(testCase.token, issuedAt); err != ErrInvalidBootstrapToken {
				t.Fatalf("expected malformed bootstrap token to fail closed, got %v", err)
			}
		})
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

func TestServiceAuthCookieRejectsMismatchedSessionID(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	currentSession, ok := service.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, err := encodeSignedToken(map[string]any{
		"exp":       issuedAt.Add(time.Minute).Unix(),
		"sessionId": "other-session",
	}, currentSession.Secret)
	if err != nil {
		t.Fatalf("encode auth cookie: %v", err)
	}

	if _, err := service.ValidateAuthCookie(token, issuedAt); err != ErrInvalidAuthCookie {
		t.Fatalf("expected mismatched session auth cookie to fail closed, got %v", err)
	}
}

func TestServiceAuthCookieRejectsMalformedPayloadOrEncoding(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	currentSession, ok := service.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	testCases := []struct {
		name  string
		token string
	}{
		{
			name:  "invalid_format",
			token: "not-a-token",
		},
		{
			name:  "invalid_base64",
			token: "!!!.abc",
		},
		{
			name:  "invalid_json_payload",
			token: mustSignedRawToken(t, []byte("{"), currentSession.Secret),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if _, err := service.ValidateAuthCookie(testCase.token, issuedAt); err != ErrInvalidAuthCookie {
				t.Fatalf("expected malformed auth cookie to fail closed, got %v", err)
			}
		})
	}
}

func TestServiceAuthCookieRejectsTamperedSignature(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, _, err := service.MintAuthCookie(issuedAt)
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}

	tampered := token + "x"

	_, err = service.ValidateAuthCookie(tampered, issuedAt.Add(time.Minute))
	if err == nil {
		t.Fatal("expected tampered auth cookie to fail")
	}
	if err != ErrInvalidAuthCookie {
		t.Fatalf("expected invalid auth cookie, got %v", err)
	}
}

func TestServiceAuthCookieRejectsExpiry(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")
	issuedAt := time.Unix(1_700_000_000, 0).UTC()

	token, _, err := service.MintAuthCookie(issuedAt)
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}

	_, err = service.ValidateAuthCookie(token, issuedAt.Add((12*time.Hour)+(time.Minute)))
	if err == nil {
		t.Fatal("expected expired auth cookie to fail")
	}
	if err != ErrInvalidAuthCookie {
		t.Fatalf("expected invalid auth cookie, got %v", err)
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

func TestNormalizeCookieBaseNameDefaultsAndSanitizesHTTPToken(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		raw  string
		want string
	}{
		{name: "empty", raw: "", want: DefaultAuthCookieName},
		{name: "whitespace", raw: "   ", want: DefaultAuthCookieName},
		{name: "trimmed", raw: " setta_auth ", want: "setta_auth"},
		{name: "space replaced", raw: "setta auth", want: "setta_auth"},
		{name: "semicolon replaced", raw: "setta;auth", want: "setta_auth"},
		{name: "backslash replaced", raw: "setta\\auth", want: "setta_auth"},
		{name: "http token kept", raw: "setta_auth-1", want: "setta_auth-1"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if got := NormalizeCookieBaseName(testCase.raw); got != testCase.want {
				t.Fatalf("NormalizeCookieBaseName(%q) = %q, want %q", testCase.raw, got, testCase.want)
			}
		})
	}
}

func TestServiceCookieNameRejectsBlankSessionID(t *testing.T) {
	t.Parallel()

	service := newTestService(t, "")

	_, err := service.CookieName("  ")
	if err == nil {
		t.Fatal("expected blank session id to fail")
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

func mustSignedRawToken(t *testing.T, payload []byte, secret []byte) string {
	t.Helper()

	signature, err := signPayload(payload, secret)
	if err != nil {
		t.Fatalf("sign raw token payload: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(signature)
}
