package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
)

func TestAdminServerMutatesLiveAuthorizationAndPushInvalidation(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, first := seededControlPlane(t, ctx)
	defer store.Close()
	socketPath := filepath.Join(filepath.Dir(store.Path()), "admin.sock")
	server, err := StartAdminServer(AdminServerConfig{SocketPath: socketPath, Store: store})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)

	firstAuthorization, err := store.AuthorizeClient(ctx, first.Token)
	if err != nil || firstAuthorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("first authorization = %+v, %v", firstAuthorization, err)
	}
	secondCredential, err := NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	adminTestRequest(t, client, "/v1/devices/ensure", AdminEnsureDeviceRequest{
		Credential: secondCredential, DisplayName: "Hosted lifecycle replacement", GrantTTL: time.Hour,
		RuntimeName: runtimeName, UserID: "user-server",
	}, "device_ensured")
	adminTestRequest(t, client, "/v1/devices/revoke", AdminRevokeDeviceRequest{DeviceID: first.Device.ID}, "device_revoked")
	requireClosed(t, firstAuthorization.Invalidated, "administrative device revocation")
	requireAuthorizationOutcome(t, store, first.Token, runtimeaccess.AuthorizationRevoked)

	secondAuthorization, err := store.AuthorizeClient(ctx, secondCredential.Token)
	if err != nil || secondAuthorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("second authorization = %+v, %v", secondAuthorization, err)
	}
	adminTestRequest(t, client, "/v1/users/status", AdminSetUserStatusRequest{
		Status: UserStatusSuspended, UserID: "user-server",
	}, "user_status_set")
	requireClosed(t, secondAuthorization.Invalidated, "administrative user suspension")
	requireAuthorizationOutcome(t, store, secondCredential.Token, runtimeaccess.AuthorizationSuspended)
	adminTestRequest(t, client, "/v1/users/status", AdminSetUserStatusRequest{
		Status: UserStatusActive, UserID: "user-server",
	}, "user_status_set")
	requireAuthorizationOutcome(t, store, secondCredential.Token, runtimeaccess.AuthorizationAllowed)
}

func adminTestClient(socketPath string) *http.Client {
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
	}}
	return &http.Client{Transport: transport, Timeout: time.Second}
}

func adminTestRequest(t *testing.T, client *http.Client, path string, payload any, wantEvent string) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Post("http://unix"+path, "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var event AdminEvent
	if err := json.NewDecoder(response.Body).Decode(&event); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || event.Event != wantEvent {
		t.Fatalf("admin response = %d %+v", response.StatusCode, event)
	}
}

func shutdownAdminTestServer(t *testing.T, server *AdminServer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if err := server.Wait(); err != nil {
		t.Fatal(err)
	}
}
