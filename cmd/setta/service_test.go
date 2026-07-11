package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
)

func TestServiceWaitTailnetRetriesUntilIPv4(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	attempts := 0
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "tailscale" || !reflect.DeepEqual(args, []string{"ip", "-4"}) {
			t.Fatalf("command = %s %v, want tailscale ip -4", name, args)
		}
		attempts += 1
		if attempts == 1 {
			return []byte("not ready\n"), errors.New("exit status 1")
		}
		return []byte("100.64.0.12\n"), nil
	}
	deps.sleep = func(context.Context, time.Duration) error {
		return nil
	}

	code := runWithDeps([]string{
		"service",
		"wait-tailnet",
		"--timeout", "1s",
		"--poll-interval", "1ms",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if attempts != 2 {
		t.Fatalf("attempts = %d, want 2", attempts)
	}
	if got := stdout.String(); got != "100.64.0.12\n" {
		t.Fatalf("stdout = %q, want tailnet IPv4", got)
	}
}

func TestServiceConfigureTailscaleServeRunsAfterTailnetServeState(t *testing.T) {
	appDataDir := t.TempDir()
	writeServiceTestServeState(t, appDataDir, "100.64.0.12:7345")

	var stdout bytes.Buffer
	var commandName string
	var commandArgs []string
	deps := testDeps()
	deps.stdout = &stdout
	deps.httpClient = &http.Client{Transport: serviceRuntimeInfoTransport{}}
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		commandName = name
		commandArgs = append([]string(nil), args...)
		return []byte("available at https://setta-test.tailnet.ts.net\n"), nil
	}

	code := runWithDeps([]string{
		"service",
		"configure-tailscale-serve",
		"--app-data-dir", appDataDir,
		"--timeout", "1s",
		"--poll-interval", "1ms",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if commandName != "tailscale" || !reflect.DeepEqual(commandArgs, []string{"serve", "--bg", "--tls-terminated-tcp=443", "tcp://100.64.0.12:7345"}) {
		t.Fatalf("command = %s %v, want tailscale serve command", commandName, commandArgs)
	}
	if !strings.Contains(stdout.String(), "Configured Tailscale HTTPS for http://100.64.0.12:7345") {
		t.Fatalf("stdout = %q, want configured message", stdout.String())
	}
}

func TestServiceConfigureTailscaleServeRejectsLoopbackServeState(t *testing.T) {
	appDataDir := t.TempDir()
	writeServiceTestServeState(t, appDataDir, "127.0.0.1:7345")

	var stderr bytes.Buffer
	deps := testDeps()
	deps.stderr = &stderr
	deps.sleep = func(context.Context, time.Duration) error {
		t.Fatal("sleep should not be called for a non-tailnet serve-state")
		return nil
	}

	code := runWithDeps([]string{
		"service",
		"configure-tailscale-serve",
		"--app-data-dir", appDataDir,
		"--timeout", "1s",
		"--poll-interval", "1ms",
	}, deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if !strings.Contains(stderr.String(), "not bound to a Tailscale IPv4 address") {
		t.Fatalf("stderr = %q, want tailnet-bound error", stderr.String())
	}
}

type serviceRuntimeInfoTransport struct{}

func (serviceRuntimeInfoTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Scheme == "http" && request.URL.Host == "100.64.0.12:7345" && request.URL.Path == "/runtime/info" {
		return serviceJSONResponse(httpapi.RuntimeInfoResponse{
			RuntimeID:       testRuntimeID,
			DisplayName:     "Test Runtime",
			ProtocolVersion: httpapi.ProtocolVersion,
			FeatureSet:      httpapi.RuntimeFeatureSetIdentity(),
			VAPIDPublicKey:  "test_vapid_key",
		}, http.StatusOK)
	}
	return serviceJSONResponse(map[string]string{"error": "not found"}, http.StatusNotFound)
}

func serviceJSONResponse(value any, status int) (*http.Response, error) {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(value); err != nil {
		return nil, fmt.Errorf("encode response: %w", err)
	}
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(&body),
	}, nil
}

func writeServiceTestServeState(t *testing.T, appDataDir string, addr string) {
	t.Helper()
	state := serveState{
		SchemaVersion:   serveStateSchemaVersion,
		PID:             1234,
		Addr:            addr,
		BaseURL:         "http://" + addr,
		RuntimeID:       testRuntimeID,
		DisplayName:     "Test Runtime",
		ProtocolVersion: httpapi.ProtocolVersion,
		StartedAt:       "2026-07-02T10:00:00Z",
	}
	if err := writeServeState(appDataDir, state); err != nil {
		t.Fatalf("write serve state: %v", err)
	}
}
