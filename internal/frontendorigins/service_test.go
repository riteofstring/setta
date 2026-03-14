package frontendorigins

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
