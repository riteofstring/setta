package controlplane

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

func TestTypedHostedAccessClientStreamsReadyOnPhoneThroughPrivateBoundary(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	defer store.Close()
	socketPath := filepath.Join(directory, "admin.sock")
	server, err := StartAdminServer(AdminServerConfig{SocketPath: socketPath, Store: store})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)
	credential, err := NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	intent := testHostedAccessIntent()
	intent.Client.DeviceID = credential.DeviceID
	progress := ensureHostedAccessFromTypedClient(t, client, intent)
	requirePreparingHostedAccess(t, progress)

	stream := openHostedAccessTestStream(t, client, intent.IdempotencyKey, "")
	defer stream.Close()
	first := readHostedAccessTestEvent(t, stream)
	requirePreparingHostedAccess(t, first)

	runtimeName := testRuntimeName(t, "typed-client-ready")
	assignTestRuntime(t, store, "typed-client-runtime", intent.UserID, runtimeName, "typed_client_secret")
	created, err := store.EnsureDeviceGrant(ctx, EnsureDeviceGrantRequest{
		Credential:  credential,
		UserID:      intent.UserID,
		RuntimeName: runtimeName,
		DisplayName: "Typed client phone",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CompleteHostedAccessIntent(ctx, intent.IdempotencyKey, created); err != nil {
		t.Fatal(err)
	}
	syncing := readHostedAccessTestEvent(t, stream)
	if syncing.Cursor != "2" || syncing.State != HostedAccessProgressSyncingProject {
		t.Fatalf("syncing event = %+v", syncing)
	}
	ready := readHostedAccessTestEvent(t, stream)
	requireReadyHostedAccess(t, ready, credential.DeviceID)
	if _, err := readHostedAccessEvent(stream); !errors.Is(err, io.EOF) {
		t.Fatalf("completed progress stream read error = %v, want EOF", err)
	}

	replayed := openHostedAccessTestStream(t, client, intent.IdempotencyKey, "2")
	defer replayed.Close()
	requireReadyHostedAccess(t, readHostedAccessTestEvent(t, replayed), credential.DeviceID)
}

func ensureHostedAccessFromTypedClient(
	t *testing.T,
	client *http.Client,
	intent EnsureHostedAccessIntent,
) HostedAccessProgress {
	t.Helper()
	data, err := json.Marshal(intent)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Post("http://unix/v1/hosted-access/ensure", "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var progress HostedAccessProgress
	decoder := json.NewDecoder(response.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&progress); err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("hosted access ensure response = %d %+v, %v", response.StatusCode, progress, err)
	}
	return progress
}

func openHostedAccessTestStream(
	t *testing.T,
	client *http.Client,
	intentID string,
	cursor string,
) *hostedAccessTestStream {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "http://unix/v1/hosted-access/events?intentId="+intentID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cursor != "" {
		request.Header.Set("Last-Event-ID", cursor)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "text/event-stream" {
		_ = response.Body.Close()
		t.Fatalf("hosted access stream response = %d %q", response.StatusCode, response.Header.Get("Content-Type"))
	}
	return &hostedAccessTestStream{body: response.Body, reader: bufio.NewReader(response.Body)}
}

type hostedAccessTestStream struct {
	body   io.ReadCloser
	reader *bufio.Reader
}

func (stream *hostedAccessTestStream) Close() error {
	return stream.body.Close()
}

func readHostedAccessTestEvent(t *testing.T, stream *hostedAccessTestStream) HostedAccessProgress {
	t.Helper()
	progress, err := readHostedAccessEvent(stream)
	if err != nil {
		t.Fatal(err)
	}
	return progress
}

func readHostedAccessEvent(stream *hostedAccessTestStream) (HostedAccessProgress, error) {
	var payload []byte
	for {
		line, err := stream.reader.ReadBytes('\n')
		if err != nil {
			return HostedAccessProgress{}, err
		}
		if bytes.HasPrefix(line, []byte("data: ")) {
			payload = bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data: ")))
		}
		if bytes.Equal(line, []byte("\n")) && payload != nil {
			var progress HostedAccessProgress
			if err := json.Unmarshal(payload, &progress); err != nil {
				return HostedAccessProgress{}, fmt.Errorf("decode hosted access event: %w", err)
			}
			return progress, nil
		}
	}
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
