package localweb

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSecureHandlerAcceptsOnlyBoundLoopbackAuthorities(t *testing.T) {
	t.Parallel()
	listener, err := Listen(0)
	if err != nil {
		t.Fatalf("Listen() = %v", err)
	}
	defer listener.Close()
	handler, err := SecureHandler(listener, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(http.StatusNoContent) }))
	if err != nil {
		t.Fatalf("SecureHandler() = %v", err)
	}
	_, port, _ := net.SplitHostPort(listener.Addr().String())
	for host, expected := range map[string]int{"127.0.0.1:" + port: http.StatusNoContent, "localhost:" + port: http.StatusNoContent, "example.com:" + port: http.StatusForbidden} {
		request := httptest.NewRequest(http.MethodGet, "http://"+host+"/", nil)
		request.Host = host
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != expected {
			t.Fatalf("host %q status = %d, want %d", host, response.Code, expected)
		}
	}
}

func TestOpenAssetsRejectsSymlinks(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("index"), 0o600); err != nil {
		t.Fatalf("write index = %v", err)
	}
	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatalf("write outside = %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "asset.js")); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}
	if _, err := OpenAssets(root); err == nil {
		t.Fatal("OpenAssets() accepted a symbolic link")
	}
}
