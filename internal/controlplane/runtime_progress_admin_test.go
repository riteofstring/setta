package controlplane

import (
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAdminRuntimeProgressSSEReplaysAndResumesWithoutProviderFields(t *testing.T) {
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "admin-progress", "user-admin-progress")
	if _, err := store.RequestRuntimeWake(t.Context(), "admin-progress-operation", runtimeName); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RecordRuntimeHealth(t.Context(), RecordRuntimeHealthRequest{
		RuntimeName:     runtimeName,
		HealthState:     RuntimeHealthHealthy,
		ObservedRelease: "test-release",
	}); err != nil {
		t.Fatal(err)
	}
	socketPath := filepath.Join(directory, "admin.sock")
	server, err := StartAdminServer(AdminServerConfig{
		Observer:   newAdminTestObserver(t, io.Discard),
		SocketPath: socketPath,
		Store:      store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)
	payload := readRuntimeProgressStream(t, client, "")
	for _, required := range []string{
		"event: runtime_progress",
		`"state":"wake_requested"`,
		`"state":"healthy"`,
		`"kind":"wake_runtime"`,
	} {
		if !strings.Contains(payload, required) {
			t.Fatalf("runtime progress stream omitted %q: %s", required, payload)
		}
	}
	for _, forbidden := range []string{runtimeName, "user-admin-progress", "provider", "sprite"} {
		if strings.Contains(strings.ToLower(payload), strings.ToLower(forbidden)) {
			t.Fatalf("runtime progress stream exposed %q: %s", forbidden, payload)
		}
	}
	resumed := readRuntimeProgressStream(t, client, "1")
	if strings.Contains(resumed, `"state":"wake_requested"`) ||
		!strings.Contains(resumed, `"state":"healthy"`) {
		t.Fatalf("resumed runtime progress = %s", resumed)
	}
	if terminalResume := readRuntimeProgressStream(t, client, "2"); terminalResume != "" {
		t.Fatalf("terminal runtime progress resume = %s, want EOF", terminalResume)
	}
}

func readRuntimeProgressStream(
	t *testing.T,
	client *http.Client,
	cursor string,
) string {
	t.Helper()
	request, err := http.NewRequest(
		http.MethodGet,
		"http://unix/v1/runtime-progress/events?operationId=admin-progress-operation",
		nil,
	)
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
	defer response.Body.Close()
	payload, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK ||
		response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("runtime progress response = %d %q %s", response.StatusCode, response.Header.Get("Content-Type"), payload)
	}
	return string(payload)
}
