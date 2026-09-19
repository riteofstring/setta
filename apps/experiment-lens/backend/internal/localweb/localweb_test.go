package localweb

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestOriginAllowedRequiresExactLoopbackSession(t *testing.T) {
	for _, origin := range []string{"http://127.0.0.1:43123", "http://localhost:43123"} {
		request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:43123/api", nil)
		request.Header.Set("Origin", origin)
		if !OriginAllowed(request, "http://127.0.0.1:43123") {
			t.Fatalf("expected origin %s to be allowed", origin)
		}
	}
	for _, origin := range []string{"", "http://127.0.0.1:43124", "https://127.0.0.1:43123", "http://example.test:43123"} {
		request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:43123/api", nil)
		request.Header.Set("Origin", origin)
		if OriginAllowed(request, "http://127.0.0.1:43123") {
			t.Fatalf("expected origin %s to be rejected", origin)
		}
	}
}

func TestAssetsServeRegularFilesAndRejectSymlinkTrees(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<main>lens</main>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "app.js"), []byte("export {};"), 0o644); err != nil {
		t.Fatal(err)
	}
	assets, err := OpenAssets(root)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := assets.Handler(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusNoContent)
	}))
	if err != nil {
		t.Fatal(err)
	}
	for path, status := range map[string]int{"/app.js": http.StatusOK, "/workspace/view": http.StatusOK, "/api/ping": http.StatusNoContent, "/../secret": http.StatusNotFound} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://localhost"+path, nil))
		if response.Code != status {
			t.Fatalf("unexpected %s status %d", path, response.Code)
		}
	}
	target := filepath.Join(t.TempDir(), "target.js")
	if err := os.WriteFile(target, []byte("target"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(root, "linked.js")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := OpenAssets(root); err == nil {
		t.Fatal("expected symlink asset tree to be rejected")
	}
}

func TestSecureHandlerRejectsUnexpectedHost(t *testing.T) {
	listener, err := Listen(0)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	handler, err := SecureHandler(listener, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusNoContent)
	}))
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "http://evil.test/", nil)
	request.Host = "evil.test"
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("unexpected host response %d", response.Code)
	}
}
