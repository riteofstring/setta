package localweb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestHandlerKeepsAPIRoutesOutOfSPAFallback(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "index.html"), "index")
	writeTestFile(t, filepath.Join(root, "app.js"), "script")
	assets, err := OpenAssets(root)
	if err != nil {
		t.Fatalf("OpenAssets() error = %v", err)
	}
	handler, err := assets.Handler(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		http.NotFound(response, request)
	}))
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	for _, test := range []struct {
		path string
		code int
		body string
	}{
		{path: "/", code: http.StatusOK, body: "index"},
		{path: "/app.js", code: http.StatusOK, body: "script"},
		{path: "/route", code: http.StatusOK, body: "index"},
		{path: "/missing.js", code: http.StatusNotFound},
		{path: "/api/v1/missing", code: http.StatusNotFound},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
		if response.Code != test.code || test.body != "" && response.Body.String() != test.body {
			t.Fatalf("GET %s = %d %q", test.path, response.Code, response.Body.String())
		}
	}
}

func TestOpenAssetsRejectsSymlinkAnywhereInTree(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "index.html"), "index")
	outside := filepath.Join(t.TempDir(), "outside.js")
	writeTestFile(t, outside, "outside")
	if err := os.Symlink(outside, filepath.Join(root, "linked.js")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	if _, err := OpenAssets(root); err == nil {
		t.Fatal("OpenAssets() error = nil, want symlink rejection")
	}
}

func TestSecureHandlerRejectsUnexpectedHostBeforeAPI(t *testing.T) {
	listener, err := Listen(0)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer listener.Close()
	called := false
	handler, err := SecureHandler(listener, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	if err != nil {
		t.Fatalf("SecureHandler() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "http://attacker.invalid/api/v1/project", nil)
	request.Host = "attacker.invalid"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || called {
		t.Fatalf("response = %d, called = %v", response.Code, called)
	}
}

func TestOriginAllowsOnlyListenerAndLocalhostAlias(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4100/api/v1/runtime", nil)
	request.Header.Set("Origin", "http://localhost:4100")
	if !OriginAllowed(request, "http://127.0.0.1:4100") {
		t.Fatal("OriginAllowed(localhost alias) = false")
	}
	request.Header.Set("Origin", "http://localhost:4101")
	if OriginAllowed(request, "http://127.0.0.1:4100") {
		t.Fatal("OriginAllowed(other port) = true")
	}
}

func TestServeStopsWithContext(t *testing.T) {
	listener, err := Listen(0)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := Serve(ctx, listener, http.NotFoundHandler()); err != nil {
		t.Fatalf("Serve() error = %v", err)
	}
}

func writeTestFile(t *testing.T, path string, value string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
