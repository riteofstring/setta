package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
)

const testRuntimeID = "0123456789abcdef0123456789abcdef"

func TestServeOptionsDefaultsAndExplicitPort(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
		"--port", "0",
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.AppDataDir != appDataDir {
		t.Fatalf("app data dir = %q, want %q", options.AppDataDir, appDataDir)
	}
	if options.Port != 0 {
		t.Fatalf("port = %d, want 0", options.Port)
	}
	if options.Host != "127.0.0.1" {
		t.Fatalf("host = %q, want loopback", options.Host)
	}
	if options.Tailnet {
		t.Fatal("tailnet = true, want false")
	}
}

func TestServeOptionsTailnetResolvesNumericIPv4(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "tailscale" || !reflect.DeepEqual(args, []string{"ip", "-4"}) {
			t.Fatalf("command = %s %v, want tailscale ip -4", name, args)
		}
		return []byte("100.64.0.12\n"), nil
	}

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
		"--tailnet",
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.Host != "100.64.0.12" {
		t.Fatalf("host = %q, want tailscale IPv4", options.Host)
	}
	if !options.Tailnet {
		t.Fatal("tailnet = false, want true")
	}
}

func TestResolveTailnetIPv4RejectsInvalidCommandResults(t *testing.T) {
	tests := map[string]struct {
		output []byte
		err    error
		want   string
	}{
		"missing cli": {
			err:  &exec.Error{Name: "tailscale", Err: exec.ErrNotFound},
			want: "tailscale CLI not found",
		},
		"command failure": {
			output: []byte("not logged in\n"),
			err:    errors.New("exit status 1"),
			want:   "not logged in",
		},
		"empty output": {
			want: "returned no address",
		},
		"multiple addresses": {
			output: []byte("100.64.0.1\n100.64.0.2\n"),
			want:   "expected exactly one",
		},
		"not ipv4": {
			output: []byte("fd7a:115c:a1e0::1\n"),
			want:   "expected a numeric IPv4 address",
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := resolveTailnetIPv4(context.Background(), func(context.Context, string, ...string) ([]byte, error) {
				return test.output, test.err
			})
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func TestBuildPairingURL(t *testing.T) {
	pairingURL, err := buildPairingURL(testRuntimeID, "token_test", "http://127.0.0.1:7345")
	if err != nil {
		t.Fatalf("build pairing URL: %v", err)
	}
	parsed, err := url.Parse(pairingURL)
	if err != nil {
		t.Fatalf("parse pairing URL: %v", err)
	}
	if parsed.Scheme != "setta" || parsed.Host != "pair" {
		t.Fatalf("pairing URL = %s, want setta://pair", pairingURL)
	}
	query := parsed.Query()
	if query.Get("rt") != testRuntimeID {
		t.Fatalf("rt = %q, want runtime id", query.Get("rt"))
	}
	if query.Get("tok") != "token_test" {
		t.Fatalf("tok = %q, want token", query.Get("tok"))
	}
	if query.Get("url") != "http://127.0.0.1:7345" {
		t.Fatalf("url = %q, want base URL", query.Get("url"))
	}
}

func TestServeStateRoundTrip(t *testing.T) {
	appDataDir := t.TempDir()
	state := serveState{
		SchemaVersion:   serveStateSchemaVersion,
		PID:             1234,
		Addr:            "127.0.0.1:7345",
		BaseURL:         "http://127.0.0.1:7345",
		RuntimeID:       testRuntimeID,
		DisplayName:     "Test Runtime",
		ProtocolVersion: 1,
		StartedAt:       "2026-07-02T10:00:00Z",
	}
	if err := writeServeState(appDataDir, state); err != nil {
		t.Fatalf("write serve state: %v", err)
	}
	read, err := readServeState(appDataDir)
	if err != nil {
		t.Fatalf("read serve state: %v", err)
	}
	if !reflect.DeepEqual(read, state) {
		t.Fatalf("read state = %+v, want %+v", read, state)
	}
}

func TestPairingRevocationIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, deps)
	if err != nil {
		t.Fatalf("start serve: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := instance.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown serve: %v", err)
		}
	})

	pairing, err := pairFromServeState(context.Background(), appDataDir, deps)
	if err != nil {
		t.Fatalf("pair from serve state: %v", err)
	}
	paired := completePairing(t, deps.httpClient, instance.state.BaseURL, pairing.Token)
	if paired.DeviceID == "" || paired.DeviceToken == "" || paired.RuntimeID != instance.state.RuntimeID {
		t.Fatalf("complete pairing response = %+v", paired)
	}

	status := authedStatus(t, deps.httpClient, instance.state.BaseURL+"/appearance/settings", paired.DeviceToken)
	if status != http.StatusOK {
		t.Fatalf("authed status before revoke = %d, want 200", status)
	}
	if _, err := revokeDevice(context.Background(), appDataDir, paired.DeviceID); err != nil {
		t.Fatalf("revoke device: %v", err)
	}
	status = authedStatus(t, deps.httpClient, instance.state.BaseURL+"/appearance/settings", paired.DeviceToken)
	if status != http.StatusUnauthorized {
		t.Fatalf("authed status after revoke = %d, want 401", status)
	}
}

func completePairing(t *testing.T, client *http.Client, baseURL string, token string) httpapi.CompletePairingResponse {
	t.Helper()
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(httpapi.CompletePairingRequest{
		ClientDisplayName: "Integration test client",
		PairingToken:      token,
	}); err != nil {
		t.Fatalf("encode pairing request: %v", err)
	}
	response, err := client.Post(baseURL+"/pairing/complete", "application/json", &body)
	if err != nil {
		t.Fatalf("complete pairing request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("complete pairing status = %d body = %s, want 200", response.StatusCode, payload)
	}
	var paired httpapi.CompletePairingResponse
	if err := json.NewDecoder(response.Body).Decode(&paired); err != nil {
		t.Fatalf("decode pairing response: %v", err)
	}
	return paired
}

func authedStatus(t *testing.T, client *http.Client, targetURL string, token string) int {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		t.Fatalf("create authed request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("authed request: %v", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	return response.StatusCode
}

func testDeps() cliDeps {
	return normalizeDeps(cliDeps{
		commandRunner: func(context.Context, string, ...string) ([]byte, error) {
			return nil, fmt.Errorf("unexpected command")
		},
		getenv: func(string) string {
			return ""
		},
		httpClient: &http.Client{Timeout: 5 * time.Second},
		now: func() time.Time {
			return time.Date(2026, 7, 2, 10, 0, 0, 0, time.UTC)
		},
		pid: func() int {
			return 1234
		},
		renderQR: func(output io.Writer, text string) {
			fmt.Fprintf(output, "[qr %d]\n", len(text))
		},
		stderr: io.Discard,
		stdout: io.Discard,
	})
}
