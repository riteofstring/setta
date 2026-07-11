package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRemoteAddRunsSSHBootstrapAndWritesRedactedTranscript(t *testing.T) {
	fixture := runSuccessfulRemoteAdd(t)
	assertRemoteAddSSHInvocation(t, fixture)
	assertRemoteAddResult(t, fixture)
	assertRemoteAddTranscript(t, fixture)
}

type remoteAddSuccessFixture struct {
	BootstrapScript string
	SSHArgs         []string
	SSHName         string
	Stdout          string
	TranscriptPath  string
}

func runSuccessfulRemoteAdd(t *testing.T) remoteAddSuccessFixture {
	t.Helper()
	transcriptPath := filepath.Join(t.TempDir(), "transcript.json")
	authKeyPath := filepath.Join(t.TempDir(), "tailscale-auth-key")
	if err := os.WriteFile(authKeyPath, []byte("tskey-auth-secret\n"), 0o600); err != nil {
		t.Fatalf("write auth key: %v", err)
	}
	var sshName string
	var sshArgs []string
	var bootstrapScript string
	deps := testDeps()
	deps.lookPath = func(name string) (string, error) {
		if name != "ssh" {
			return "", fmt.Errorf("unexpected look path %s", name)
		}
		return "/usr/bin/ssh", nil
	}
	deps.commandStdinRunner = func(_ context.Context, name string, args []string, stdin io.Reader) ([]byte, error) {
		sshName = name
		sshArgs = append([]string(nil), args...)
		payload, err := io.ReadAll(stdin)
		if err != nil {
			t.Fatalf("read bootstrap stdin: %v", err)
		}
		bootstrapScript = string(payload)
		pairingToken := shellAssignmentValue(t, bootstrapScript, "ssh_pairing_token")
		return []byte(
			"setta cloud-init bootstrap: installing tailscale with tskey-auth-secret\n" +
				`{"ok":true,"pairingUrl":"setta://pair?rt=0123456789abcdef0123456789abcdef&tok=` + pairingToken + `&url=http%3A%2F%2F100.64.0.12%3A7345"}` + "\n",
		), nil
	}
	var stdout strings.Builder
	deps.stdout = &stdout

	code := runWithDeps([]string{
		"remote", "add",
		"ssh://ubuntu@example.com:2222",
		"--json",
		"--tailscale-auth-key-file", authKeyPath,
		"--setta-version", "v1.2.3",
		"--release-base-url", "https://downloads.example.test/setta/v1.2.3",
		"--installer-sha256", strings.Repeat("a", 64),
		"--minisign-public-key", "RWQtestminisignpublickey",
		"--transcript-path", transcriptPath,
		"--ssh-option", "UserKnownHostsFile=/tmp/setta_known_hosts",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	return remoteAddSuccessFixture{
		BootstrapScript: bootstrapScript,
		SSHArgs:         sshArgs,
		SSHName:         sshName,
		Stdout:          stdout.String(),
		TranscriptPath:  transcriptPath,
	}
}

func assertRemoteAddSSHInvocation(t *testing.T, fixture remoteAddSuccessFixture) {
	t.Helper()
	if fixture.SSHName != "ssh" {
		t.Fatalf("ssh command = %q, want ssh", fixture.SSHName)
	}
	wantArgs := []string{
		"-T",
		"-o", "BatchMode=yes",
		"-p", "2222",
		"-o", "UserKnownHostsFile=/tmp/setta_known_hosts",
		"ubuntu@example.com",
		remoteBootstrapPrivilegeCommand,
	}
	if !reflect.DeepEqual(fixture.SSHArgs, wantArgs) {
		t.Fatalf("ssh args = %#v, want %#v", fixture.SSHArgs, wantArgs)
	}
	if !strings.Contains(fixture.BootstrapScript, "tailscale up --auth-key \"$tailscale_auth_key\" --hostname \"$runtime_name\"") ||
		!strings.Contains(fixture.BootstrapScript, "setta pair --json --app-data-dir \"$service_app_data_dir\" --existing-token \"$ssh_pairing_token\"") ||
		!strings.Contains(fixture.BootstrapScript, "setta service configure-tailscale-serve") {
		t.Fatalf("bootstrap script missing SSH install contract:\n%s", fixture.BootstrapScript)
	}
}

func assertRemoteAddResult(t *testing.T, fixture remoteAddSuccessFixture) {
	t.Helper()
	var result remoteAddResult
	if err := json.Unmarshal([]byte(fixture.Stdout), &result); err != nil {
		t.Fatalf("parse remote add JSON: %v\n%s", err, fixture.Stdout)
	}
	pairingToken := shellAssignmentValue(t, fixture.BootstrapScript, "ssh_pairing_token")
	if !result.OK || result.Transport != "tailscale" || result.Target != "ssh://ubuntu@example.com:2222" {
		t.Fatalf("remote add result = %+v", result)
	}
	if !strings.Contains(result.PairingURL, "tok="+pairingToken) {
		t.Fatalf("pairing URL = %s, want generated token", result.PairingURL)
	}
}

func assertRemoteAddTranscript(t *testing.T, fixture remoteAddSuccessFixture) {
	t.Helper()
	transcript, err := os.ReadFile(fixture.TranscriptPath)
	if err != nil {
		t.Fatalf("read transcript: %v", err)
	}
	pairingToken := shellAssignmentValue(t, fixture.BootstrapScript, "ssh_pairing_token")
	if strings.Contains(string(transcript), "tskey-auth-secret") || strings.Contains(string(transcript), pairingToken) {
		t.Fatalf("transcript leaked a setup secret:\n%s", transcript)
	}
	if !strings.Contains(string(transcript), "__SETTA_REDACTED__") ||
		!strings.Contains(string(transcript), "__SETTA_REDACTED_PAIRING_TOKEN__") {
		t.Fatalf("transcript did not include redacted setup evidence:\n%s", transcript)
	}
}

func TestRemoteAddWritesTranscriptOnSSHFailure(t *testing.T) {
	transcriptPath := filepath.Join(t.TempDir(), "transcript.json")
	deps := testDeps()
	deps.lookPath = func(name string) (string, error) {
		return "/usr/bin/" + name, nil
	}
	deps.commandStdinRunner = func(context.Context, string, []string, io.Reader) ([]byte, error) {
		return []byte("permission denied for tskey-auth-secret\n"), errors.New("exit status 255")
	}

	var stderr strings.Builder
	deps.stderr = &stderr
	code := runWithDeps([]string{
		"remote", "add",
		"ssh://ubuntu@example.com",
		"--tailscale-auth-key", "tskey-auth-secret",
		"--setta-version", "v1.2.3",
		"--release-base-url", "https://downloads.example.test/setta/v1.2.3",
		"--installer-sha256", strings.Repeat("a", 64),
		"--minisign-public-key", "RWQtestminisignpublickey",
		"--transcript-path", transcriptPath,
	}, deps)
	if code == 0 {
		t.Fatal("exit code = 0, want failure")
	}
	if !strings.Contains(stderr.String(), "transcript: "+transcriptPath) {
		t.Fatalf("stderr = %q, want transcript path", stderr.String())
	}
	transcript, err := os.ReadFile(transcriptPath)
	if err != nil {
		t.Fatalf("read transcript: %v", err)
	}
	if strings.Contains(string(transcript), "tskey-auth-secret") {
		t.Fatalf("failure transcript leaked auth key:\n%s", transcript)
	}
	if !strings.Contains(string(transcript), `"status": "failed"`) {
		t.Fatalf("failure transcript missing status:\n%s", transcript)
	}
}

func TestRemoteAddRejectsNonSSHSecretsAndDevRelease(t *testing.T) {
	tests := map[string][]string{
		"password in URL": {"remote", "add", "ssh://ubuntu:secret@example.com"},
		"path in URL":     {"remote", "add", "ssh://ubuntu@example.com/tmp"},
		"dev release": []string{
			"remote", "add", "ssh://ubuntu@example.com",
			"--tailscale-auth-key", "tskey-auth-secret",
			"--installer-sha256", strings.Repeat("a", 64),
			"--minisign-public-key", "RWQtestminisignpublickey",
		},
	}
	for name, args := range tests {
		t.Run(name, func(t *testing.T) {
			deps := testDeps()
			code := runWithDeps(args, deps)
			if code == 0 {
				t.Fatalf("exit code = 0, want failure")
			}
		})
	}
}

func shellAssignmentValue(t *testing.T, script string, name string) string {
	t.Helper()
	prefix := name + "='"
	start := strings.Index(script, prefix)
	if start < 0 {
		t.Fatalf("script missing assignment %s", name)
	}
	start += len(prefix)
	end := strings.Index(script[start:], "'\n")
	if end < 0 {
		t.Fatalf("assignment %s was not single-line quoted", name)
	}
	return script[start : start+end]
}
