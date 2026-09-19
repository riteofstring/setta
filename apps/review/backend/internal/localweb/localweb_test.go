package localweb

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestHandlerServesAssetsAndKeepsAPIRoutesOutOfSPAFallback(t *testing.T) {
	assets := openTestAssets(t)
	apiCalls := 0
	handler, err := assets.Handler(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		apiCalls++
		http.NotFound(response, request)
	}))
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	for _, test := range []struct {
		path        string
		code        int
		body        string
		contentType string
		apiCalls    int
	}{
		{path: "/", code: http.StatusOK, body: "index", contentType: "text/html; charset=utf-8"},
		{path: "/assets/app.js", code: http.StatusOK, body: "script", contentType: "text/javascript; charset=utf-8"},
		{path: "/review/request", code: http.StatusOK, body: "index", contentType: "text/html; charset=utf-8"},
		{path: "/assets", code: http.StatusNotFound},
		{path: "/missing.js", code: http.StatusNotFound},
		{path: "/api", code: http.StatusNotFound, apiCalls: 1},
		{path: "/api/v1/missing", code: http.StatusNotFound, apiCalls: 1},
	} {
		before := apiCalls
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
		if response.Code != test.code || test.body != "" && response.Body.String() != test.body {
			t.Fatalf("GET %s = %d %q", test.path, response.Code, response.Body.String())
		}
		if test.contentType != "" && response.Header().Get("Content-Type") != test.contentType {
			t.Fatalf("GET %s Content-Type = %q", test.path, response.Header().Get("Content-Type"))
		}
		if apiCalls-before != test.apiCalls {
			t.Fatalf("GET %s API calls = %d", test.path, apiCalls-before)
		}
	}
}

func TestHandlerRejectsUnsafeAndAmbiguousAssetPaths(t *testing.T) {
	assets := openTestAssets(t)
	handler, err := assets.Handler(http.NotFoundHandler())
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	for _, rawPath := range []string{
		"/../outside.txt",
		"/%2e%2e/outside.txt",
		"/./assets/app.js",
		"/assets//app.js",
		"/assets%5capp.js",
		"/assets/%00app.js",
	} {
		requestURL, err := url.ParseRequestURI(rawPath)
		if err != nil {
			t.Fatalf("ParseRequestURI(%q) error = %v", rawPath, err)
		}
		if relative, err := staticRelativePath(requestURL); err == nil {
			t.Fatalf("staticRelativePath(%q) = %q, nil", rawPath, relative)
		}
		request := &http.Request{Method: http.MethodGet, URL: requestURL, Header: make(http.Header)}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("GET %q = %d, want 404", rawPath, response.Code)
		}
	}
}

func TestHandlerRestrictsMethodsAndSupportsHead(t *testing.T) {
	assets := openTestAssets(t)
	handler, err := assets.Handler(http.NotFoundHandler())
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	head := httptest.NewRecorder()
	handler.ServeHTTP(head, httptest.NewRequest(http.MethodHead, "/assets/app.js", nil))
	if head.Code != http.StatusOK || head.Body.Len() != 0 {
		t.Fatalf("HEAD asset = %d %q", head.Code, head.Body.String())
	}
	post := httptest.NewRecorder()
	handler.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/assets/app.js", strings.NewReader("data")))
	if post.Code != http.StatusMethodNotAllowed || post.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("POST asset = %d Allow %q", post.Code, post.Header().Get("Allow"))
	}
}

func TestOpenAssetsRejectsInvalidRootsAndSymlinks(t *testing.T) {
	for _, root := range []string{"", " relative ", string([]byte{'b', 'a', 'd', 0, 'p', 'a', 't', 'h'})} {
		if _, err := OpenAssets(root); err == nil {
			t.Fatalf("OpenAssets(%q) error = nil", root)
		}
	}
	missingIndex := t.TempDir()
	if _, err := OpenAssets(missingIndex); err == nil {
		t.Fatal("OpenAssets(root without index) error = nil")
	}
	if runtime.GOOS == "windows" {
		return
	}
	for _, directoryLink := range []bool{false, true} {
		root := t.TempDir()
		writeTestFile(t, filepath.Join(root, "index.html"), "index")
		outside := filepath.Join(t.TempDir(), "outside.js")
		if directoryLink {
			outside = t.TempDir()
			writeTestFile(t, filepath.Join(outside, "app.js"), "outside")
		}
		if err := os.Symlink(outside, filepath.Join(root, "linked")); err != nil {
			t.Fatalf("Symlink() error = %v", err)
		}
		if _, err := OpenAssets(root); err == nil {
			t.Fatalf("OpenAssets(root with directoryLink=%v) error = nil", directoryLink)
		}
	}
}

func TestHandlerRejectsAssetReplacedBySymlinkAfterPreflight(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "index.html"), "index")
	assetPath := filepath.Join(root, "app.js")
	writeTestFile(t, assetPath, "inside")
	assets, err := OpenAssets(root)
	if err != nil {
		t.Fatalf("OpenAssets() error = %v", err)
	}
	outside := filepath.Join(t.TempDir(), "outside.js")
	writeTestFile(t, outside, "outside")
	if err := os.Remove(assetPath); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	if err := os.Symlink(outside, assetPath); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	handler, err := assets.Handler(http.NotFoundHandler())
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/app.js", nil))
	if response.Code != http.StatusNotFound || strings.Contains(response.Body.String(), "outside") {
		t.Fatalf("GET replaced asset = %d %q", response.Code, response.Body.String())
	}
}

func TestHandlerRejectsDirectoryReplacedByOutsideSymlinkAfterPreflight(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "index.html"), "index")
	assetDirectory := filepath.Join(root, "assets")
	writeTestFile(t, filepath.Join(assetDirectory, "app.js"), "inside")
	assets, err := OpenAssets(root)
	if err != nil {
		t.Fatalf("OpenAssets() error = %v", err)
	}
	outside := t.TempDir()
	writeTestFile(t, filepath.Join(outside, "app.js"), "outside")
	if err := os.RemoveAll(assetDirectory); err != nil {
		t.Fatalf("RemoveAll() error = %v", err)
	}
	if err := os.Symlink(outside, assetDirectory); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	handler, err := assets.Handler(http.NotFoundHandler())
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if response.Code != http.StatusNotFound || strings.Contains(response.Body.String(), "outside") {
		t.Fatalf("GET asset through replaced directory = %d %q", response.Code, response.Body.String())
	}
}

func TestSecureHandlerAllowsOnlyListenerAuthoritiesAndSetsHeaders(t *testing.T) {
	listener, err := Listen(0)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer listener.Close()
	address := listener.Addr().String()
	_, port, err := net.SplitHostPort(address)
	if err != nil {
		t.Fatalf("SplitHostPort() error = %v", err)
	}
	calls := 0
	handler, err := SecureHandler(listener, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls++
		response.WriteHeader(http.StatusNoContent)
	}))
	if err != nil {
		t.Fatalf("SecureHandler() error = %v", err)
	}
	for _, test := range []struct {
		host   string
		code   int
		called bool
	}{
		{host: address, code: http.StatusNoContent, called: true},
		{host: net.JoinHostPort("localhost", port), code: http.StatusNoContent, called: true},
		{host: strings.ToUpper(net.JoinHostPort("localhost", port)), code: http.StatusNoContent, called: true},
		{host: "attacker.invalid", code: http.StatusForbidden},
		{host: net.JoinHostPort("127.0.0.1", "1"), code: http.StatusForbidden},
		{host: net.JoinHostPort("0.0.0.0", port), code: http.StatusForbidden},
	} {
		before := calls
		request := httptest.NewRequest(http.MethodGet, "http://"+address+"/", nil)
		request.Host = test.host
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != test.code || calls-before != boolInt(test.called) {
			t.Fatalf("Host %q = %d, calls = %d", test.host, response.Code, calls-before)
		}
		for name, expected := range map[string]string{
			"Cache-Control":          "no-store",
			"Referrer-Policy":        "no-referrer",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options":        "DENY",
		} {
			if response.Header().Get(name) != expected {
				t.Fatalf("Host %q %s = %q", test.host, name, response.Header().Get(name))
			}
		}
	}
}

func TestOriginAllowedRequiresExactLoopbackOrigin(t *testing.T) {
	serverURL := "http://127.0.0.1:4100"
	for _, test := range []struct {
		origin  string
		allowed bool
	}{
		{origin: "http://127.0.0.1:4100", allowed: true},
		{origin: "http://localhost:4100", allowed: true},
		{origin: "HTTP://LOCALHOST:4100", allowed: true},
		{origin: ""},
		{origin: "http://127.0.0.1:4101"},
		{origin: "https://127.0.0.1:4100"},
		{origin: "http://0.0.0.0:4100"},
		{origin: "http://[::1]:4100"},
		{origin: "http://user@127.0.0.1:4100"},
		{origin: "http://127.0.0.1:4100/path"},
		{origin: "http://127.0.0.1:4100?query"},
		{origin: "http://127.0.0.1:4100#fragment"},
	} {
		request := httptest.NewRequest(http.MethodPost, serverURL+"/api/v1/apply", nil)
		request.Header.Set("Origin", test.origin)
		if allowed := OriginAllowed(request, serverURL); allowed != test.allowed {
			t.Fatalf("OriginAllowed(%q) = %v", test.origin, allowed)
		}
	}
	if OriginAllowed(nil, serverURL) {
		t.Fatal("OriginAllowed(nil) = true")
	}
	request := httptest.NewRequest(http.MethodPost, serverURL+"/api/v1/apply", nil)
	request.Header.Set("Origin", "http://attacker.invalid:4100")
	if OriginAllowed(request, "http://attacker.invalid:4100") {
		t.Fatal("OriginAllowed() trusted a non-loopback server URL")
	}
	request.Header.Set("Origin", "https://127.0.0.1:4100")
	if OriginAllowed(request, "https://127.0.0.1:4100") {
		t.Fatal("OriginAllowed() trusted a non-HTTP server URL")
	}
	request.Header.Set("Origin", "http://127.0.0.1:4100")
	if OriginAllowed(request, "http://127.0.0.1:4100/base") {
		t.Fatal("OriginAllowed() trusted a server URL with a path")
	}
}

func TestListenURLAndServeStayOnLoopbackAndStopWithContext(t *testing.T) {
	listener, err := Listen(0)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	serverURL, err := URL(listener)
	if err != nil {
		listener.Close()
		t.Fatalf("URL() error = %v", err)
	}
	if !strings.HasPrefix(serverURL, "http://127.0.0.1:") {
		listener.Close()
		t.Fatalf("URL() = %q", serverURL)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, listener, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			response.WriteHeader(http.StatusNoContent)
		}))
	}()
	response, err := (&http.Client{Timeout: time.Second}).Get(serverURL)
	if err != nil {
		cancel()
		<-done
		t.Fatalf("GET live server error = %v", err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		cancel()
		<-done
		t.Fatalf("GET live server = %d", response.StatusCode)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Serve() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve() did not stop after context cancellation")
	}
}

func TestPublicFunctionsRejectMissingDependencies(t *testing.T) {
	assets := openTestAssets(t)
	if _, err := assets.Handler(nil); err == nil {
		t.Fatal("Handler(nil) error = nil")
	}
	if _, err := (*Assets)(nil).Handler(http.NotFoundHandler()); err == nil {
		t.Fatal("nil Assets.Handler() error = nil")
	}
	if _, err := URL(nil); err == nil {
		t.Fatal("URL(nil) error = nil")
	}
	if _, err := SecureHandler(nil, http.NotFoundHandler()); err == nil {
		t.Fatal("SecureHandler(nil, handler) error = nil")
	}
	listener, err := Listen(0)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer listener.Close()
	if _, err := SecureHandler(listener, nil); err == nil {
		t.Fatal("SecureHandler(listener, nil) error = nil")
	}
	if err := Serve(context.Background(), nil, http.NotFoundHandler()); err == nil {
		t.Fatal("Serve(nil listener) error = nil")
	}
	if err := Serve(nil, listener, http.NotFoundHandler()); err == nil {
		t.Fatal("Serve(nil context) error = nil")
	}
}

func openTestAssets(t *testing.T) *Assets {
	t.Helper()
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "index.html"), "index")
	writeTestFile(t, filepath.Join(root, "assets", "app.js"), "script")
	assets, err := OpenAssets(root)
	if err != nil {
		t.Fatalf("OpenAssets() error = %v", err)
	}
	return assets
}

func writeTestFile(t *testing.T, path string, value string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
