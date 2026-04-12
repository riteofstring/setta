package frontendorigins

import (
	"crypto/tls"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestServiceTrustsOriginsAndPrunesExpiredEntries(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	service, err := NewService(Options{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}

	normalizedOrigin, err := service.TrustOrigin("http://127.0.0.1:9001/path", "session-1", now.Add(5*time.Minute).Unix())
	if err != nil {
		t.Fatalf("trust origin: %v", err)
	}
	if normalizedOrigin != "http://127.0.0.1:9001" {
		t.Fatalf("expected normalized origin, got %q", normalizedOrigin)
	}
	if !service.IsTrustedOrigin("http://127.0.0.1:9001", "session-1") {
		t.Fatal("expected origin to be trusted")
	}

	now = now.Add(6 * time.Minute)
	if service.IsTrustedOrigin("http://127.0.0.1:9001", "session-1") {
		t.Fatal("expected expired origin to be pruned")
	}
}

func TestServiceRefreshSessionExpiryExtendsExistingOrigins(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	service, err := NewService(Options{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}

	origin := "http://127.0.0.1:9001"
	initialExpiry := now.Add(5 * time.Minute).Unix()
	if _, err := service.TrustOrigin(origin, "session-1", initialExpiry); err != nil {
		t.Fatalf("trust origin: %v", err)
	}

	if err := service.RefreshSessionExpiry("session-1", now.Add(15*time.Minute).Unix()); err != nil {
		t.Fatalf("refresh session expiry: %v", err)
	}

	now = now.Add(6 * time.Minute)
	if !service.IsTrustedOrigin(origin, "session-1") {
		t.Fatal("expected refreshed origin expiry to remain trusted past original expiry")
	}
}

func TestServiceIsTrustedOriginRequiresMatchingSessionID(t *testing.T) {
	t.Parallel()

	service, err := NewService(Options{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}

	origin := "http://127.0.0.1:9001"
	if _, err := service.TrustOrigin(origin, "session-1", time.Now().UTC().Add(5*time.Minute).Unix()); err != nil {
		t.Fatalf("trust origin: %v", err)
	}

	if !service.IsTrustedOrigin(origin, "session-1") {
		t.Fatal("expected origin to be trusted for the matching session")
	}
	if service.IsTrustedOrigin(origin, "session-2") {
		t.Fatal("expected origin trust to stay session-scoped")
	}
	if service.IsTrustedOrigin(origin, "") {
		t.Fatal("expected blank-session lookup to fail closed")
	}
}

func TestServiceTrustOriginIgnoresStaleLockFile(t *testing.T) {
	t.Parallel()

	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	lockPath := filepath.Join(runtimeRoot, trustedOriginsStoreName+".lock")
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		t.Fatalf("mkdir stale lock dir: %v", err)
	}
	if err := os.WriteFile(lockPath, []byte("stale"), 0o600); err != nil {
		t.Fatalf("write stale lock file: %v", err)
	}

	service, err := NewService(Options{
		RuntimeRoot: runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}

	origin := "http://127.0.0.1:9001"
	if _, err := service.TrustOrigin(origin, "session-1", time.Now().UTC().Add(5*time.Minute).Unix()); err != nil {
		t.Fatalf("trust origin with stale lock file: %v", err)
	}
	if !service.IsTrustedOrigin(origin, "session-1") {
		t.Fatal("expected trust write to succeed despite stale lock file")
	}
}

func TestServiceTrustOriginReturnsUnavailableWhenLockParentCannotBeCreated(t *testing.T) {
	t.Parallel()

	runtimeRoot := filepath.Join(t.TempDir(), "lock-parent-as-file")
	if err := os.WriteFile(runtimeRoot, []byte("not-a-directory"), 0o600); err != nil {
		t.Fatalf("write runtime-root file: %v", err)
	}

	service, err := NewService(Options{
		RuntimeRoot: runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}

	_, err = service.TrustOrigin("http://127.0.0.1:9001", "session-1", time.Now().UTC().Add(5*time.Minute).Unix())
	if err == nil {
		t.Fatal("expected store-unavailable error")
	}
	var unavailable *StoreUnavailableError
	if !errors.As(err, &unavailable) {
		t.Fatalf("expected store-unavailable error, got %T", err)
	}
	if !strings.Contains(unavailable.Error(), "Failed creating trusted frontend origins store directory") {
		t.Fatalf("unexpected store-unavailable error %q", unavailable.Error())
	}
}

func TestResolveRequestOriginPrefersClientOriginHeaderWhenAllowed(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8000/api/createWorkspaceLaunchIntent", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")

	if got := ResolveRequestOrigin(request, true); got != "http://127.0.0.1:3000" {
		t.Fatalf("expected client origin header, got %q", got)
	}
	if got := ResolveRequestOrigin(request, false); got != "http://127.0.0.1:8000" {
		t.Fatalf("expected request origin fallback, got %q", got)
	}
}

func TestResolveRequestOriginFallsBackToURLHostAndTLS(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "https://example.com/api/runtimeInfo", nil)
	request.Host = ""
	request.TLS = &tls.ConnectionState{}

	if got := ResolveRequestOrigin(request, false); got != "https://example.com" {
		t.Fatalf("expected https origin fallback from url host, got %q", got)
	}
}

func TestNormalizeOriginAcceptsHTTPAndHTTPSOrigins(t *testing.T) {
	t.Parallel()

	if got := NormalizeOrigin("http://127.0.0.1:8000/path"); got != "http://127.0.0.1:8000" {
		t.Fatalf("expected normalized http origin, got %q", got)
	}
	if got := NormalizeOrigin("https://example.com"); got != "https://example.com" {
		t.Fatalf("expected normalized https origin, got %q", got)
	}
}

func TestNormalizeOriginRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	for _, rawOrigin := range []string{"javascript:alert(1)", "  ", ""} {
		if got := NormalizeOrigin(rawOrigin); got != "" {
			t.Fatalf("expected invalid origin %q to fail closed, got %q", rawOrigin, got)
		}
	}
}

func TestLauncherOriginProofRoundTrip(t *testing.T) {
	t.Parallel()

	proof := MintLauncherOriginHandoffProof("session-1", "http://127.0.0.1:9001", []byte("secret"))
	if proof == "" {
		t.Fatal("expected proof to be minted")
	}
	if !ValidateLauncherOriginHandoffProof("session-1", "http://127.0.0.1:9001", proof, []byte("secret")) {
		t.Fatal("expected proof validation to succeed")
	}
	if ValidateLauncherOriginHandoffProof("session-1", "http://127.0.0.1:9001", "wrong", []byte("secret")) {
		t.Fatal("expected invalid proof to fail")
	}
}

func TestAppendLauncherOriginHandoffToBootstrapURLPreservesTokenAndAppendsSignedParams(t *testing.T) {
	t.Parallel()

	updated, err := AppendLauncherOriginHandoffToBootstrapURL(
		"http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
		"http://127.0.0.1:8000",
		"signed-proof",
	)
	if err != nil {
		t.Fatalf("append launcher origin handoff: %v", err)
	}
	parsedURL, err := url.Parse(updated)
	if err != nil {
		t.Fatalf("parse updated bootstrap url: %v", err)
	}
	hashParams, err := url.ParseQuery(strings.TrimPrefix(parsedURL.Fragment, "#"))
	if err != nil {
		t.Fatalf("parse bootstrap url hash params: %v", err)
	}
	if hashParams.Get("token") != "tok" {
		t.Fatalf("expected bootstrap token to remain present, got %q", hashParams.Get("token"))
	}
	if hashParams.Get("lo") != "http://127.0.0.1:8000" {
		t.Fatalf("expected normalized launcher origin, got %q", hashParams.Get("lo"))
	}
	if hashParams.Get("lop") != "signed-proof" {
		t.Fatalf("expected launcher origin proof, got %q", hashParams.Get("lop"))
	}
}

func TestStoreReadRejectsInvalidExpiryValues(t *testing.T) {
	t.Parallel()

	service, err := NewService(Options{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
	})
	if err != nil {
		t.Fatalf("new trusted frontend origin service: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(service.store.path), 0o755); err != nil {
		t.Fatalf("mkdir store dir: %v", err)
	}
	if err := os.WriteFile(service.store.path, []byte(`{"session-1":{"http://127.0.0.1:9001":"bad"}}`), 0o600); err != nil {
		t.Fatalf("write invalid store: %v", err)
	}

	_, err = service.store.read()
	if err == nil {
		t.Fatal("expected store state error")
	}
	var stateErr *StoreStateError
	if !errors.As(err, &stateErr) {
		t.Fatalf("expected store state error, got %T", err)
	}
	if stateErr.Error() != "Trusted frontend origin expiry values must be integers." {
		t.Fatalf("unexpected store state error %q", stateErr.Error())
	}
}
