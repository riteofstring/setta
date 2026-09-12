package webapp

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestHandlerServesTheProductionSPAAndKeepsAPIRoutesExact(t *testing.T) {
	assets := newAssetsForTest(t)
	apiCalls := 0
	api := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		apiCalls++
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"api":true}`)
	})
	handler, err := assets.Handler(api)
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}

	for _, test := range []struct {
		name            string
		method          string
		target          string
		wantStatus      int
		wantBody        string
		wantContentType string
	}{
		{"root index", http.MethodGet, "/", http.StatusOK, "<main>Setta Canvas</main>", "text/html"},
		{"asset", http.MethodGet, "/assets/app.js", http.StatusOK, "console.log('setta')", "text/javascript"},
		{"client route fallback", http.MethodGet, "/editor/scene", http.StatusOK, "<main>Setta Canvas</main>", "text/html"},
		{"missing asset stays missing", http.MethodGet, "/assets/missing.js", http.StatusNotFound, "404 page not found", "text/plain"},
		{"directory has no listing", http.MethodGet, "/assets", http.StatusNotFound, "404 page not found", "text/plain"},
		{"API remains API", http.MethodGet, "/api/v2/project", http.StatusOK, `{"api":true}`, "application/json"},
		{"API typo does not get index", http.MethodGet, "/api/missing", http.StatusOK, `{"api":true}`, "application/json"},
		{"static mutation rejected", http.MethodPost, "/", http.StatusMethodNotAllowed, "Method Not Allowed", "text/plain"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(test.method, test.target, nil))
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %q", response.Code, test.wantStatus, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), test.wantBody) {
				t.Fatalf("body = %q, want %q", response.Body.String(), test.wantBody)
			}
			if !strings.HasPrefix(response.Header().Get("Content-Type"), test.wantContentType) {
				t.Fatalf("content type = %q, want prefix %q", response.Header().Get("Content-Type"), test.wantContentType)
			}
		})
	}
	if apiCalls != 2 {
		t.Fatalf("API calls = %d, want 2", apiCalls)
	}
}

func TestHandlerRejectsTraversalAndSymlinkAssets(t *testing.T) {
	assets := newAssetsForTest(t)
	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(assets.root, "assets", "outside.js")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	handler, err := assets.Handler(http.NotFoundHandler())
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	for _, target := range []string{
		"/../outside.js",
		"/%2e%2e/outside.js",
		"/%5coutside.js",
		"/assets/outside.js",
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s status = %d, want 404; body = %q", target, response.Code, response.Body.String())
		}
	}
}

func TestOpenRequiresAProductionIndexAndHandlerRequiresAPI(t *testing.T) {
	root := t.TempDir()
	if _, err := Open(root); err == nil {
		t.Fatal("Open() succeeded without index.html")
	}
	assets := newAssetsForTest(t)
	if _, err := assets.Handler(nil); !errors.Is(err, ErrAPIHandlerRequired) {
		t.Fatalf("Handler(nil) error = %v, want API handler requirement", err)
	}
}

func TestServePublishesReadinessOnceThenStopsOnContextCancellation(t *testing.T) {
	listener, err := listenLoopbackForTest()
	if err != nil {
		t.Fatalf("listen loopback: %v", err)
	}
	origin, err := LoopbackURL(listener)
	if err != nil {
		_ = listener.Close()
		t.Fatalf("LoopbackURL() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var readyCalls atomic.Int32
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, listener, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(response, "ready")
		}), func() error {
			readyCalls.Add(1)
			client := &http.Client{Timeout: time.Second}
			response, requestErr := client.Get(origin + "/")
			if requestErr != nil {
				return requestErr
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusOK {
				return errors.New("server was not accepting requests at readiness")
			}
			return nil
		})
	}()

	deadline := time.After(2 * time.Second)
	for readyCalls.Load() != 1 {
		select {
		case err := <-done:
			t.Fatalf("Serve() returned before readiness: %v", err)
		case <-deadline:
			t.Fatal("readiness callback was not called")
		case <-time.After(time.Millisecond):
		}
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Serve() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve() did not stop after cancellation")
	}
	if readyCalls.Load() != 1 {
		t.Fatalf("readiness callback count = %d, want 1", readyCalls.Load())
	}
}

func TestServeRejectsDNSRebindingHostBeforeEveryApplicationHandler(t *testing.T) {
	listener, err := listenLoopbackForTest()
	if err != nil {
		t.Fatalf("listen loopback: %v", err)
	}
	origin, err := LoopbackURL(listener)
	if err != nil {
		_ = listener.Close()
		t.Fatalf("LoopbackURL() error = %v", err)
	}
	address := listener.Addr().(*net.TCPAddr)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var applicationCalls atomic.Int32
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, listener, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
			applicationCalls.Add(1)
			_, _ = io.WriteString(response, "private-project-state")
		}), func() error {
			client := &http.Client{Timeout: time.Second}
			for _, trustedHost := range []string{
				fmt.Sprintf("127.0.0.1:%d", address.Port),
				fmt.Sprintf("localhost:%d", address.Port),
			} {
				trusted, requestErr := http.NewRequest(http.MethodGet, origin+"/api/v2/project", nil)
				if requestErr != nil {
					return requestErr
				}
				trusted.Host = trustedHost
				response, requestErr := client.Do(trusted)
				if requestErr != nil {
					return requestErr
				}
				_ = response.Body.Close()
				if response.StatusCode != http.StatusOK {
					return fmt.Errorf("trusted host %q status = %d", trustedHost, response.StatusCode)
				}
			}

			rebound, requestErr := http.NewRequest(http.MethodGet, origin+"/api/v2/project", nil)
			if requestErr != nil {
				return requestErr
			}
			rebound.Host = fmt.Sprintf("canvas.attacker.example:%d", address.Port)
			response, requestErr := client.Do(rebound)
			if requestErr != nil {
				return requestErr
			}
			body, readErr := io.ReadAll(response.Body)
			_ = response.Body.Close()
			if readErr != nil {
				return readErr
			}
			if response.StatusCode != http.StatusMisdirectedRequest {
				return fmt.Errorf("rebound host status = %d", response.StatusCode)
			}
			if strings.Contains(string(body), "private-project-state") {
				return errors.New("rebound host reached the application handler")
			}
			if response.Header.Get("Cache-Control") != "no-store" {
				return fmt.Errorf("rebound cache policy = %q", response.Header.Get("Cache-Control"))
			}
			cancel()
			return nil
		})
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Serve() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve() did not complete the host-authorization probe")
	}
	if applicationCalls.Load() != 2 {
		t.Fatalf("application handler calls = %d, want two trusted requests", applicationCalls.Load())
	}
}

func TestLoopbackURLRejectsMissingListener(t *testing.T) {
	if _, err := LoopbackURL(nil); !errors.Is(err, ErrListenerRequired) {
		t.Fatalf("LoopbackURL(nil) error = %v", err)
	}
}

func newAssetsForTest(t *testing.T) *Assets {
	t.Helper()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "assets"), 0o700); err != nil {
		t.Fatalf("make asset directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!doctype html><main>Setta Canvas</main>"), 0o600); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets", "app.js"), []byte("console.log('setta')"), 0o600); err != nil {
		t.Fatalf("write JavaScript: %v", err)
	}
	assets, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	return assets
}

func listenLoopbackForTest() (net.Listener, error) {
	return net.Listen("tcp4", "127.0.0.1:0")
}
