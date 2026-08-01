package evalharness

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestNewBackendClientRequiresNumericLoopbackOrigin(t *testing.T) {
	for _, baseURL := range []string{
		"http://127.0.0.1:8080",
		"http://127.0.0.2:1",
		"http://[::1]:65535",
	} {
		t.Run(baseURL, func(t *testing.T) {
			if _, err := NewBackendClient(BackendClientConfig{BaseURL: baseURL, Token: "token"}); err != nil {
				t.Fatalf("valid loopback origin: %v", err)
			}
		})
	}

	for _, baseURL := range []string{
		"https://127.0.0.1:8080",
		"http://localhost:8080",
		"http://192.0.2.1:8080",
		"http://127.0.0.1",
		"http://127.0.0.1:8080/",
		"http://127.0.0.1:8080?",
		"http://user@127.0.0.1:8080",
	} {
		t.Run(baseURL, func(t *testing.T) {
			if _, err := NewBackendClient(BackendClientConfig{BaseURL: baseURL, Token: "token"}); err == nil {
				t.Fatal("unsafe backend origin was accepted")
			}
		})
	}
}

func TestNewBackendClientRejectsUnsafeBootstrapTokens(t *testing.T) {
	for name, token := range map[string]string{
		"empty":      "",
		"whitespace": "token with space",
		"oversized":  strings.Repeat("x", backendMaximumTokenBytes+1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := NewBackendClient(BackendClientConfig{
				BaseURL: "http://127.0.0.1:8080",
				Token:   token,
			}); err == nil {
				t.Fatal("unsafe backend token was accepted")
			}
		})
	}
}

func TestBackendClientDoesNotFollowRedirects(t *testing.T) {
	var redirectedRequests atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		redirectedRequests.Add(1)
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"reached":true}`))
	}))
	defer target.Close()

	source := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer bootstrap-token" {
			t.Errorf("authorization header = %q", request.Header.Get("Authorization"))
		}
		http.Redirect(response, request, target.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()

	client, err := NewBackendClient(BackendClientConfig{
		BaseURL: source.URL,
		Token:   "bootstrap-token",
	})
	if err != nil {
		t.Fatalf("create backend client: %v", err)
	}
	_, err = getBackendJSON[map[string]bool](context.Background(), client, "/redirect")
	if err == nil || !strings.Contains(err.Error(), "HTTP 307") {
		t.Fatalf("redirect error = %v", err)
	}
	if redirectedRequests.Load() != 0 {
		t.Fatalf("redirect target received %d requests", redirectedRequests.Load())
	}
}
