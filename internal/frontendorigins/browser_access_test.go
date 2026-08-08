package frontendorigins

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

func TestHasTrustedFrontendOriginAcceptsConfiguredDevOrigin(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/runtimeInfo", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")

	if !HasTrustedFrontendOrigin(request, nil, "") {
		t.Fatal("expected configured dev frontend origin to be trusted")
	}
}

func TestHasTrustedFrontendOriginFallsBackToRefererWhenOriginIsUntrusted(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "http")

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/runtimeInfo", nil)
	request.Header.Set("Origin", "http://evil.local")
	request.Header.Set("Referer", "http://127.0.0.1:3000/chat")

	if !HasTrustedFrontendOrigin(request, nil, "") {
		t.Fatal("expected trusted dev frontend referer to override untrusted origin")
	}
}

func TestConfiguredFrontendOriginsForRequestIncludesLoopbackAliasesAndDedupesExtras(t *testing.T) {
	t.Setenv(devFrontendPortEnv, "3000")
	t.Setenv(devFrontendSchemeEnv, "HTTPS")
	t.Setenv(extraFrontendOriginsEnv, "https://example.com, https://localhost:3000, https://example.com")

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8000/api/runtimeInfo", nil)

	got := configuredFrontendOriginsForRequest(request)
	want := []string{
		"https://127.0.0.1:3000",
		"https://localhost:3000",
		"https://example.com",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("expected configured origins %v, got %v", want, got)
	}
}
