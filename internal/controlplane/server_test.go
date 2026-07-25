package controlplane

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestControlPlaneServerRoutesRotatedSecretsAndRejectsBeforeDial(t *testing.T) {
	ctx := context.Background()
	var innerAuthorization atomic.Value
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		innerAuthorization.Store(request.Header.Get("Authorization"))
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()
	dialer := &testPrivateDialer{target: strings.TrimPrefix(upstream.URL, "http://")}
	store, secrets, runtimeName, grant := seededControlPlane(t, ctx)
	defer store.Close()
	var measurements bytes.Buffer
	observer, err := NewJSONLinesObserver(&measurements)
	if err != nil {
		t.Fatalf("NewJSONLinesObserver: %v", err)
	}
	server := startTestServer(t, store, secrets, dialer, observer, 4)
	defer shutdownTestServer(t, server)
	health, err := http.Get(fmt.Sprintf("http://%s/healthz", server.Addr()))
	if err != nil {
		t.Fatalf("health request: %v", err)
	}
	if health.StatusCode != http.StatusNoContent {
		t.Fatalf("health status = %d", health.StatusCode)
	}
	_ = health.Body.Close()

	response := gatewayRequest(t, server, grant.Token, "/workspace-session")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("gateway status = %d", response.StatusCode)
	}
	_ = response.Body.Close()
	if innerAuthorization.Load() != "Bearer runtime-secret-one" {
		t.Fatalf("inner authorization = %q", innerAuthorization.Load())
	}
	if err := secrets.WriteSecret(ctx, "runtime_credential", []byte("runtime-secret-two")); err != nil {
		t.Fatalf("rotate runtime secret: %v", err)
	}
	response = gatewayRequest(t, server, grant.Token, "/workspace-session")
	_ = response.Body.Close()
	if innerAuthorization.Load() != "Bearer runtime-secret-two" {
		t.Fatalf("rotated inner authorization = %q", innerAuthorization.Load())
	}
	dialsBeforeDenial := dialer.calls.Load()
	response = gatewayRequest(t, server, "missing-client-token", "/workspace-session")
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("missing credential status = %d", response.StatusCode)
	}
	_ = response.Body.Close()
	if dialer.calls.Load() != dialsBeforeDenial {
		t.Fatal("unauthorized request opened provider transport")
	}
	if strings.Contains(measurements.String(), grant.Token) ||
		strings.Contains(measurements.String(), "runtime-secret") ||
		strings.Contains(measurements.String(), runtimeName) ||
		strings.Contains(measurements.String(), "/workspace-session") {
		t.Fatalf("gateway measurement retained request content: %s", measurements.String())
	}
}

func TestControlPlaneServerPushRevokesEstablishedSSE(t *testing.T) {
	ctx := context.Background()
	requestCancelled := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/event-stream")
		_, _ = response.Write([]byte("event: ready\ndata: {}\n\n"))
		response.(http.Flusher).Flush()
		<-request.Context().Done()
		close(requestCancelled)
	}))
	defer upstream.Close()
	dialer := &testPrivateDialer{target: strings.TrimPrefix(upstream.URL, "http://")}
	store, secrets, _, grant := seededControlPlane(t, ctx)
	defer store.Close()
	observer, err := NewJSONLinesObserver(&bytes.Buffer{})
	if err != nil {
		t.Fatalf("NewJSONLinesObserver: %v", err)
	}
	server := startTestServer(t, store, secrets, dialer, observer, 4)
	defer shutdownTestServer(t, server)
	response := gatewayRequest(t, server, grant.Token, "/events")
	reader := bufio.NewReader(response.Body)
	for line := ""; line != "\n"; {
		var err error
		line, err = reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read initial SSE event: %v", err)
		}
	}
	if err := store.RevokeDevice(ctx, grant.Device.ID); err != nil {
		t.Fatalf("RevokeDevice: %v", err)
	}
	select {
	case <-requestCancelled:
	case <-time.After(time.Second):
		t.Fatal("revocation did not cancel established provider request")
	}
	_ = response.Body.Close()
}

func TestControlPlaneServerEnforcesConcurrentRequestCeiling(t *testing.T) {
	ctx := context.Background()
	started := make(chan struct{})
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		close(started)
		<-release
		response.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()
	dialer := &testPrivateDialer{target: strings.TrimPrefix(upstream.URL, "http://")}
	store, secrets, _, grant := seededControlPlane(t, ctx)
	defer store.Close()
	observer, err := NewJSONLinesObserver(&bytes.Buffer{})
	if err != nil {
		t.Fatalf("NewJSONLinesObserver: %v", err)
	}
	server := startTestServer(t, store, secrets, dialer, observer, 1)
	defer shutdownTestServer(t, server)
	firstDone := make(chan *http.Response, 1)
	go func() { firstDone <- gatewayRequest(t, server, grant.Token, "/hold") }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first request did not reach upstream")
	}
	second := gatewayRequest(t, server, grant.Token, "/capacity")
	if second.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("capacity response status = %d", second.StatusCode)
	}
	_ = second.Body.Close()
	close(release)
	first := <-firstDone
	_ = first.Body.Close()
}

func TestControlPlaneServerRejectsUnboundedBodiesBeforeProviderDial(t *testing.T) {
	ctx := context.Background()
	dialer := &testPrivateDialer{target: "127.0.0.1:1"}
	store, secrets, _, grant := seededControlPlane(t, ctx)
	defer store.Close()
	observer, err := NewJSONLinesObserver(&bytes.Buffer{})
	if err != nil {
		t.Fatalf("NewJSONLinesObserver: %v", err)
	}
	server, err := StartServer(ServerConfig{
		Authorizer:            store,
		Dialer:                dialer,
		ListenAddress:         "127.0.0.1:0",
		MaxConcurrentRequests: 1,
		MaxRequestBytes:       4,
		Observer:              observer,
		Routes:                store,
		RuntimeTarget:         "127.0.0.1:7345",
		Secrets:               secrets,
	})
	if err != nil {
		t.Fatalf("StartServer: %v", err)
	}
	defer shutdownTestServer(t, server)
	request, err := http.NewRequest(http.MethodPost, fmt.Sprintf("http://%s/input", server.Addr()), strings.NewReader("oversized"))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+grant.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("oversized request: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusRequestEntityTooLarge || dialer.calls.Load() != 0 {
		t.Fatalf("oversized request status/dials = %d/%d", response.StatusCode, dialer.calls.Load())
	}
}

func TestControlPlaneServerShutdownRequiresContext(t *testing.T) {
	server := &Server{}
	if err := server.Shutdown(nil); err == nil {
		t.Fatal("Shutdown accepted a nil context")
	}
}

type testPrivateDialer struct {
	target string
	calls  atomic.Int64
}

func (dialer *testPrivateDialer) DialPrivateRuntime(
	ctx context.Context,
	_ string,
	_ string,
	_ string,
) (net.Conn, error) {
	dialer.calls.Add(1)
	return (&net.Dialer{}).DialContext(ctx, "tcp", dialer.target)
}

func seededControlPlane(
	t *testing.T,
	ctx context.Context,
) (*Store, *FileSecretStore, string, CreatedDeviceGrant) {
	t.Helper()
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	secrets, err := OpenFileSecretStore(directory + "/secrets")
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	if err := secrets.WriteSecret(ctx, "runtime_credential", []byte("runtime-secret-one")); err != nil {
		t.Fatalf("WriteSecret: %v", err)
	}
	runtimeName := testRuntimeName(t, "server-integration")
	if _, err := store.UpsertUser(ctx, "user-server"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	assignTestRuntime(t, store, "assign-server", "user-server", runtimeName, "runtime_credential")
	grant, err := store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-server",
		RuntimeName: runtimeName,
		DisplayName: "Server test device",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant: %v", err)
	}
	return store, secrets, runtimeName, grant
}

func startTestServer(
	t *testing.T,
	store *Store,
	secrets SecretStore,
	dialer *testPrivateDialer,
	observer *JSONLinesObserver,
	maximumConcurrent int,
) *Server {
	t.Helper()
	server, err := StartServer(ServerConfig{
		Authorizer:            store,
		Dialer:                dialer,
		ListenAddress:         "127.0.0.1:0",
		MaxConcurrentRequests: maximumConcurrent,
		MaxRequestBytes:       1 << 20,
		Observer:              observer,
		Routes:                store,
		RuntimeTarget:         "127.0.0.1:7345",
		Secrets:               secrets,
	})
	if err != nil {
		t.Fatalf("StartServer: %v", err)
	}
	return server
}

func gatewayRequest(t *testing.T, server *Server, token string, path string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, fmt.Sprintf("http://%s%s", server.Addr(), path), nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("gateway request: %v", err)
	}
	return response
}

func shutdownTestServer(t *testing.T, server *Server) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if err := server.Wait(); err != nil {
		t.Fatalf("Wait: %v", err)
	}
}
