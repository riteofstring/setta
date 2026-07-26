package sprites

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
	"setta/internal/unixsockettest"
)

func TestWorkloadLeaseLifecycleOverManagementSocket(t *testing.T) {
	startedAt := time.Date(2026, 7, 13, 19, 0, 0, 0, time.UTC)
	expiresAt := startedAt.Add(30 * time.Second)
	requests := make(chan string, 4)

	client := newTestWorkloadLeaseClient(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Host != managementVirtualHost {
			t.Errorf("Host = %q, want %q", request.Host, managementVirtualHost)
		}
		requests <- request.Method + " " + request.URL.Path

		switch request.Method + " " + request.URL.Path {
		case "POST /v1/tasks":
			assertLeaseMutation(t, request, workloadLeaseMutation{Name: "setta-agent", Expire: 30})
			writeLeaseResponse(t, writer, http.StatusCreated, "setta-agent", startedAt, expiresAt)
		case "PUT /v1/tasks/setta-agent":
			assertLeaseMutation(t, request, workloadLeaseMutation{Expire: 45})
			writeLeaseResponse(t, writer, http.StatusOK, "setta-agent", startedAt, startedAt.Add(45*time.Second))
		case "GET /v1/tasks/setta-agent":
			writeLeaseResponse(t, writer, http.StatusOK, "setta-agent", startedAt, startedAt.Add(45*time.Second))
		case "DELETE /v1/tasks/setta-agent":
			writer.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(writer, request)
		}
	}))

	ctx := context.Background()
	lease, err := client.Acquire(ctx, runtimeprovider.WorkloadLeaseRequest{Name: "setta-agent", TTL: 30 * time.Second})
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	if lease.Name != "setta-agent" || !lease.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("Acquire lease = %#v", lease)
	}

	lease, err = client.Renew(ctx, "setta-agent", 45*time.Second)
	if err != nil {
		t.Fatalf("Renew: %v", err)
	}
	if !lease.ExpiresAt.Equal(startedAt.Add(45 * time.Second)) {
		t.Fatalf("Renew expiration = %v", lease.ExpiresAt)
	}

	lease, found, err := client.Inspect(ctx, "setta-agent")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if !found || lease.Name != "setta-agent" {
		t.Fatalf("Inspect = %#v, %t", lease, found)
	}

	if err := client.Release(ctx, "setta-agent"); err != nil {
		t.Fatalf("Release: %v", err)
	}

	close(requests)
	want := []string{
		"POST /v1/tasks",
		"PUT /v1/tasks/setta-agent",
		"GET /v1/tasks/setta-agent",
		"DELETE /v1/tasks/setta-agent",
	}
	var got []string
	for request := range requests {
		got = append(got, request)
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("requests = %v, want %v", got, want)
	}
}

func TestWorkloadLeaseInspectMissingAndReleaseMissing(t *testing.T) {
	client := newTestWorkloadLeaseClient(t, http.NotFoundHandler())

	lease, found, err := client.Inspect(context.Background(), "missing")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if found || lease != (runtimeprovider.WorkloadLease{}) {
		t.Fatalf("Inspect = %#v, %t", lease, found)
	}
	if err := client.Release(context.Background(), "missing"); err != nil {
		t.Fatalf("Release missing: %v", err)
	}
}

func TestWorkloadLeaseRejectsInvalidInputsBeforeDial(t *testing.T) {
	client, err := NewWorkloadLeaseClientForSocket("/missing/socket")
	if err != nil {
		t.Fatalf("NewWorkloadLeaseClientForSocket: %v", err)
	}

	tests := map[string]runtimeprovider.WorkloadLeaseRequest{
		"uppercase name": {Name: "Agent", TTL: time.Minute},
		"path name":      {Name: "agent/other", TTL: time.Minute},
		"subsecond ttl":  {Name: "agent", TTL: 1500 * time.Millisecond},
		"zero ttl":       {Name: "agent"},
		"long ttl":       {Name: "agent", TTL: time.Hour + time.Second},
	}
	for name, request := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := client.Acquire(context.Background(), request)
			if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
				t.Fatalf("Acquire error = %v, want ErrInvalidContract", err)
			}
		})
	}
}

func TestWorkloadLeaseReturnsTypedStatusErrorWithoutResponseBody(t *testing.T) {
	client := newTestWorkloadLeaseClient(t, http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusForbidden)
		_, _ = writer.Write([]byte("secret provider response"))
	}))

	_, err := client.Acquire(context.Background(), runtimeprovider.WorkloadLeaseRequest{
		Name: "agent",
		TTL:  time.Minute,
	})
	var leaseErr *WorkloadLeaseError
	if !errors.As(err, &leaseErr) {
		t.Fatalf("Acquire error = %T %v, want WorkloadLeaseError", err, err)
	}
	if leaseErr.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d", leaseErr.StatusCode)
	}
	if got := leaseErr.Error(); got == "" || strings.Contains(got, "secret provider response") {
		t.Fatalf("unsafe error = %q", got)
	}
}

func TestNewWorkloadLeaseClientRejectsUnsafeSocketPath(t *testing.T) {
	for _, path := range []string{"relative.sock", "/tmp/../unsafe.sock"} {
		_, err := NewWorkloadLeaseClientForSocket(path)
		if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
			t.Fatalf("path %q error = %v, want ErrInvalidContract", path, err)
		}
	}
}

func newTestWorkloadLeaseClient(t *testing.T, handler http.Handler) *WorkloadLeaseClient {
	t.Helper()

	socketDir := unixsockettest.TempDir(t, "api.sock")
	socketPath := filepath.Join(socketDir, "api.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("listen Unix socket: %v", err)
	}
	server := &http.Server{Handler: handler}
	go func() {
		if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			t.Errorf("serve Unix socket: %v", serveErr)
		}
	}()
	t.Cleanup(func() {
		if shutdownErr := server.Shutdown(context.Background()); shutdownErr != nil {
			t.Errorf("shutdown Unix server: %v", shutdownErr)
		}
	})

	client, err := NewWorkloadLeaseClientForSocket(socketPath)
	if err != nil {
		t.Fatalf("NewWorkloadLeaseClientForSocket: %v", err)
	}
	return client
}

func assertLeaseMutation(t *testing.T, request *http.Request, want workloadLeaseMutation) {
	t.Helper()
	if request.Header.Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type = %q", request.Header.Get("Content-Type"))
	}
	var got workloadLeaseMutation
	if err := json.NewDecoder(request.Body).Decode(&got); err != nil {
		t.Fatalf("decode mutation: %v", err)
	}
	if got != want {
		t.Fatalf("mutation = %#v, want %#v", got, want)
	}
}

func writeLeaseResponse(
	t *testing.T,
	writer http.ResponseWriter,
	status int,
	name string,
	startedAt time.Time,
	expiresAt time.Time,
) {
	t.Helper()
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(workloadLeaseResponse{
		Name:      name,
		StartedAt: startedAt,
		ExpiresAt: expiresAt,
	}); err != nil {
		t.Fatalf("encode lease: %v", err)
	}
}
