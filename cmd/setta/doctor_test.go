package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/httpapi"
)

func TestDoctorJSONReportsRuntimeMobileAndSourceControlReadiness(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(appDataDir, "runtime"), 0o755); err != nil {
		t.Fatalf("create runtime dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(appDataDir, "runtime", "setup-report.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("write setup report: %v", err)
	}
	state := serveState{
		SchemaVersion:   serveStateSchemaVersion,
		PID:             1234,
		Addr:            "100.64.0.12:7345",
		BaseURL:         "http://100.64.0.12:7345",
		RuntimeID:       testRuntimeID,
		DisplayName:     "setta-test",
		ProtocolVersion: httpapi.ProtocolVersion,
		StartedAt:       "2026-07-02T10:00:00Z",
	}
	if err := writeServeState(appDataDir, state); err != nil {
		t.Fatalf("write serve state: %v", err)
	}

	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.httpClient = &http.Client{Transport: doctorTestTransport{}}
	deps.getenv = func(name string) string {
		if name == "SSH_AUTH_SOCK" {
			return "/tmp/ssh-agent.sock"
		}
		return ""
	}
	deps.lookPath = func(name string) (string, error) {
		if name == "codex" {
			return "/usr/local/bin/codex", nil
		}
		return "", exec.ErrNotFound
	}
	deps.commandRunner = doctorCommandRunner(t, workspaceDir)

	code := runWithDeps([]string{
		"doctor",
		"--json",
		"--app-data-dir", appDataDir,
		"--workspace-dir", workspaceDir,
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var report doctorReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("decode report: %v\n%s", err, stdout.String())
	}
	if !report.OK {
		t.Fatalf("report ok = false, checks = %+v", report.Checks)
	}
	if report.Runtime.BaseURL != "http://100.64.0.12:7345" || !report.Runtime.TailnetBound {
		t.Fatalf("runtime report = %+v", report.Runtime)
	}
	if report.Tailscale.DNSName != "setta-test.tailnet.ts.net" {
		t.Fatalf("tailscale DNS name = %q", report.Tailscale.DNSName)
	}
	if !report.PWA.TLSValid || report.PWA.HTTPStatus != http.StatusOK {
		t.Fatalf("PWA report = %+v", report.PWA)
	}
	if len(report.AgentCLIs) != 1 || report.AgentCLIs[0].Path != "/usr/local/bin/codex" {
		t.Fatalf("agent CLIs = %+v", report.AgentCLIs)
	}
	if report.SourceControl.OriginKind != "github_ssh" || report.SourceControl.GitHubAccepted == nil || !*report.SourceControl.GitHubAccepted {
		t.Fatalf("source-control report = %+v", report.SourceControl)
	}
	requireDoctorCheck(t, report.Checks, "pwa_https", doctorStatusOK)
	requireDoctorCheck(t, report.Checks, "agent_cli_codex", doctorStatusOK)
	requireDoctorCheck(t, report.Checks, "source_control", doctorStatusOK)
}

func TestDoctorJSONKeepsProbeFailuresInReport(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceDir := t.TempDir()
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.commandRunner = func(context.Context, string, ...string) ([]byte, error) {
		return nil, errors.New("command unavailable")
	}
	deps.lookPath = func(string) (string, error) {
		return "", exec.ErrNotFound
	}

	code := runWithDeps([]string{
		"doctor",
		"--json",
		"--app-data-dir", appDataDir,
		"--workspace-dir", workspaceDir,
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var report doctorReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("decode report: %v\n%s", err, stdout.String())
	}
	if report.OK {
		t.Fatalf("report ok = true, want false")
	}
	requireDoctorCheck(t, report.Checks, "runtime", doctorStatusError)
	requireDoctorCheck(t, report.Checks, "tailscale_status", doctorStatusError)
	requireDoctorCheck(t, report.Checks, "agent_cli_codex", doctorStatusError)
}

func doctorCommandRunner(t *testing.T, workspaceDir string) commandRunner {
	t.Helper()
	return func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name == "tailscale" && reflect.DeepEqual(args, []string{"status", "--json"}) {
			return []byte(`{"Self":{"DNSName":"setta-test.tailnet.ts.net.","Online":true,"TailscaleIPs":["100.64.0.12"]}}`), nil
		}
		if name == "tailscale" && reflect.DeepEqual(args, []string{"serve", "status", "--json"}) {
			return []byte(`{"TCP":{"443":{"HTTPS":true}}}`), nil
		}
		if name == "codex" && reflect.DeepEqual(args, []string{"--version"}) {
			return []byte("codex-cli 1.2.3\n"), nil
		}
		if name == "codex" && reflect.DeepEqual(args, []string{"doctor", "--json"}) {
			return []byte(`{"ok":true}`), nil
		}
		if name == "git" && reflect.DeepEqual(args, []string{"-C", workspaceDir, "rev-parse", "--show-toplevel"}) {
			return []byte(workspaceDir + "\n"), nil
		}
		if name == "git" && reflect.DeepEqual(args, []string{"-C", workspaceDir, "remote", "get-url", "origin"}) {
			return []byte("git@github.com:owner/repo.git\n"), nil
		}
		if name == "ssh-add" && reflect.DeepEqual(args, []string{"-l"}) {
			return []byte("256 SHA256:test developer@example.com (ED25519)\n"), nil
		}
		if name == "ssh" && reflect.DeepEqual(args, []string{"-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=yes", "git@github.com"}) {
			return []byte("Hi owner! You've successfully authenticated, but GitHub does not provide shell access.\n"), errors.New("exit status 1")
		}
		t.Fatalf("unexpected command: %s %s", name, strings.Join(args, " "))
		return nil, fmt.Errorf("unexpected command")
	}
}

type doctorTestTransport struct{}

func (doctorTestTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Scheme == "http" && request.URL.Host == "100.64.0.12:7345" && request.URL.Path == "/runtime/info" {
		return doctorJSONResponse(httpapi.RuntimeInfoResponse{
			RuntimeID:              testRuntimeID,
			DisplayName:            "setta-test",
			InfrastructureProvider: httpapi.UnknownRuntimeInfrastructureProvider(),
			BackendName:            httpapi.BackendName,
			BackendVersion:         "test",
			ProtocolVersion:        httpapi.ProtocolVersion,
			FeatureSet:             httpapi.RuntimeFeatureSetIdentity(),
			VAPIDPublicKey:         "vapid_public",
		}, http.StatusOK), nil
	}
	if request.URL.Scheme == "https" && request.URL.Host == "setta-test.tailnet.ts.net" && request.URL.Path == "/manifest.webmanifest" {
		response := doctorJSONResponse(map[string]string{"name": "Setta"}, http.StatusOK)
		response.Header.Set("Content-Type", "application/manifest+json")
		return response, nil
	}
	return doctorJSONResponse(map[string]string{"error": "not found"}, http.StatusNotFound), nil
}

func doctorJSONResponse(value any, status int) *http.Response {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(value); err != nil {
		panic(err)
	}
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(&body),
	}
}

func requireDoctorCheck(t *testing.T, checks []doctorCheck, id string, status string) {
	t.Helper()
	for _, check := range checks {
		if check.ID == id {
			if check.Status != status {
				t.Fatalf("check %s status = %s, want %s: %+v", id, check.Status, status, check)
			}
			return
		}
	}
	t.Fatalf("check %s not found in %+v", id, checks)
}
