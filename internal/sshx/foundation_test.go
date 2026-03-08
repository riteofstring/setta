package sshx

import (
	"encoding/base64"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestParseSSHArgsHandlesQuotedArguments(t *testing.T) {
	t.Parallel()

	// Keep shell-style quoting behavior aligned with the Python ssh launch path.
	args, err := ParseSSHArgs(`-p 2222 -o StrictHostKeyChecking=no -J 'bastion host'`)
	if err != nil {
		t.Fatalf("parse ssh args: %v", err)
	}
	want := []string{"-p", "2222", "-o", "StrictHostKeyChecking=no", "-J", "bastion host"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("unexpected ssh args:\n got: %#v\nwant: %#v", args, want)
	}
}

func TestParseSSHArgsRejectsUnclosedQuote(t *testing.T) {
	t.Parallel()

	_, err := ParseSSHArgs(`-o "StrictHostKeyChecking=no`)
	requireSSHErrorCode(t, err, "InvalidSshArgs")
}

func TestParseSSHArgsHandlesEscapedSpacesAndQuotedProxyCommand(t *testing.T) {
	t.Parallel()

	args, err := ParseSSHArgs(`-i ~/.ssh/id_ed25519 -o UserKnownHostsFile=/tmp/known\ hosts -o ProxyCommand='ssh -W %h:%p jump'`)
	if err != nil {
		t.Fatalf("parse escaped ssh args: %v", err)
	}
	want := []string{
		"-i",
		"~/.ssh/id_ed25519",
		"-o",
		"UserKnownHostsFile=/tmp/known hosts",
		"-o",
		"ProxyCommand=ssh -W %h:%p jump",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("unexpected escaped ssh args:\n got: %#v\nwant: %#v", args, want)
	}
}

func TestParseSSHArgsConcatenatesQuotedAndUnquotedFragments(t *testing.T) {
	t.Parallel()

	args, err := ParseSSHArgs(`-o ProxyCommand=prefix"quoted value"suffix`)
	if err != nil {
		t.Fatalf("parse concatenated quoted args: %v", err)
	}
	want := []string{"-o", "ProxyCommand=prefixquoted valuesuffix"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("unexpected concatenated ssh args:\n got: %#v\nwant: %#v", args, want)
	}
}

func TestParseSSHArgsRejectsDanglingEscape(t *testing.T) {
	t.Parallel()

	_, err := ParseSSHArgs(`-o UserKnownHostsFile=/tmp/known\`)
	requireSSHErrorCode(t, err, "InvalidSshArgs")
}

func TestApplyControlSocketArgsAddsDefaultsWhenMissing(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		// Windows intentionally skips OpenSSH control socket defaults.
		got := ApplyControlSocketArgs([]string{"-p", "2222"})
		want := []string{"-p", "2222"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("unexpected windows ssh args:\n got: %#v\nwant: %#v", got, want)
		}
		return
	}

	got := ApplyControlSocketArgs([]string{"-p", "2222"})
	want := []string{
		"-o", "ControlMaster=auto",
		"-o", "ControlPersist=5m",
		"-o", "ControlPath=/tmp/setta-ctl-%C",
		"-p", "2222",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected control socket args:\n got: %#v\nwant: %#v", got, want)
	}
}

func TestApplyControlSocketArgsLeavesExplicitOptionsUntouched(t *testing.T) {
	t.Parallel()

	// Existing control socket options must win over injected defaults.
	input := []string{"-o", "ControlPersist=1m", "-p", "2222"}
	got := ApplyControlSocketArgs(input)
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("expected explicit control socket args to be preserved:\n got: %#v\nwant: %#v", got, input)
	}
}

func TestParseJSONPayloadExtractsObjectPayload(t *testing.T) {
	t.Parallel()

	payloadLine := JSONPayloadPrefix + base64.StdEncoding.EncodeToString([]byte(`{"sessions":[]}`))
	payload, err := ParseJSONPayload("noise\n" + payloadLine + "\n")
	if err != nil {
		t.Fatalf("parse json payload: %v", err)
	}
	if sessions, ok := payload["sessions"].([]any); !ok || len(sessions) != 0 {
		t.Fatalf("expected empty sessions list, got %#v", payload["sessions"])
	}
}

func TestParseJSONPayloadRejectsInvalidUTF8(t *testing.T) {
	t.Parallel()

	invalid := JSONPayloadPrefix + base64.StdEncoding.EncodeToString([]byte{0xff, 0xfe})
	_, err := ParseJSONPayload(invalid)
	requireSSHErrorCode(t, err, "RemoteJsonPayload")
	if err.Error() != "Failed to decode remote Setta JSON payload (utf-8)." {
		t.Fatalf("unexpected error message: %q", err.Error())
	}
}

func TestParseRemoteSessionListRoundTripsValidPayload(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2025, time.January, 1, 2, 3, 4, 5, time.UTC)
	sessions, err := ParseRemoteSessionList(map[string]any{
		"sessions": []any{
			map[string]any{
				"id":                     "session-1",
				"workspacePath":          "/tmp/workspace",
				"workspacePathCanonical": "/private/tmp/workspace",
				"host":                   "127.0.0.1",
				"port":                   float64(61234),
				"pid":                    float64(4321),
				"startedAt":              startedAt.Format(time.RFC3339Nano),
				"serverMode":             "ide",
			},
		},
	})
	if err != nil {
		t.Fatalf("parse session list: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected one session, got %#v", sessions)
	}
	if sessions[0].StartedAt != startedAt {
		t.Fatalf("unexpected startedAt: got %s want %s", sessions[0].StartedAt, startedAt)
	}
}

func TestParseRemoteSessionListRejectsInvalidServerMode(t *testing.T) {
	t.Parallel()

	_, err := ParseRemoteSessionList(map[string]any{
		"sessions": []any{
			map[string]any{
				"id":                     "session-1",
				"workspacePath":          "/tmp/workspace",
				"workspacePathCanonical": "/tmp/workspace",
				"host":                   "127.0.0.1",
				"port":                   float64(61234),
				"pid":                    float64(4321),
				"startedAt":              "2025-01-01T00:00:00Z",
				"serverMode":             "share",
			},
		},
	})
	requireSSHErrorCode(t, err, "RemoteSessionList")
}

func TestParseRemoteConnectInfoValidatesLauncherOriginProof(t *testing.T) {
	t.Parallel()

	basePayload := map[string]any{
		"bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
		"settaFilesLocation":   "LOCAL",
		"launcherOrigin":       "http://127.0.0.1:3000",
		"launcherOriginProof":  "proof",
	}

	info, err := ParseRemoteConnectInfo(basePayload, "http://127.0.0.1:3000")
	if err != nil {
		t.Fatalf("parse remote connect info: %v", err)
	}
	if info.SettaFilesLocation != "local" {
		t.Fatalf("expected normalized settaFilesLocation, got %q", info.SettaFilesLocation)
	}

	missingProof := clonePayload(basePayload)
	delete(missingProof, "launcherOriginProof")
	_, err = ParseRemoteConnectInfo(missingProof, "http://127.0.0.1:3000")
	requireSSHErrorCode(t, err, "RemoteConnectInfo")
	if !strings.Contains(err.Error(), "launcherOriginProof") {
		t.Fatalf("expected launcherOriginProof error, got %q", err.Error())
	}

	mismatchedOrigin := clonePayload(basePayload)
	mismatchedOrigin["launcherOrigin"] = "http://127.0.0.1:4000"
	_, err = ParseRemoteConnectInfo(mismatchedOrigin, "http://127.0.0.1:3000")
	requireSSHErrorCode(t, err, "RemoteConnectInfo")
	if !strings.Contains(err.Error(), "did not match requested launcher origin") {
		t.Fatalf("expected launcher origin mismatch error, got %q", err.Error())
	}
}

func TestNormalizeSettaFilesLocationCanonicalizesCase(t *testing.T) {
	t.Parallel()

	location, err := NormalizeSettaFilesLocation("  GLOBAL ")
	if err != nil {
		t.Fatalf("normalize location: %v", err)
	}
	if location != "global" {
		t.Fatalf("expected normalized location, got %q", location)
	}

	_, err = NormalizeSettaFilesLocation("workspace-local")
	requireSSHErrorCode(t, err, "InvalidSettaFilesLocation")
}

func TestResolveRemoteLogsDirPrefersResolvedRoots(t *testing.T) {
	t.Parallel()

	// Runtime roots should win when present, including relative roots resolved from the workspace.
	logsDir, err := ResolveRemoteLogsDir("/srv/workspace", "", "", "runtime")
	if err != nil {
		t.Fatalf("resolve logs dir from runtime root: %v", err)
	}
	if logsDir != "/srv/workspace/runtime/logs" {
		t.Fatalf("unexpected runtime-root logs dir: %q", logsDir)
	}

	// A resolved setta_files root should be the next fallback.
	logsDir, err = ResolveRemoteLogsDir("/srv/workspace", "", "/var/lib/setta", "")
	if err != nil {
		t.Fatalf("resolve logs dir from setta files root: %v", err)
	}
	if logsDir != "/var/lib/setta/runtime/logs" {
		t.Fatalf("unexpected setta-files-root logs dir: %q", logsDir)
	}
}

func TestResolveRemoteLogsDirFallsBackByLocation(t *testing.T) {
	t.Parallel()

	logsDir, err := ResolveRemoteLogsDir("/srv/workspace", "global", "", "")
	if err != nil {
		t.Fatalf("resolve logs dir for global state: %v", err)
	}
	if logsDir != "/tmp" {
		t.Fatalf("expected /tmp for global remote state, got %q", logsDir)
	}

	logsDir, err = ResolveRemoteLogsDir("/srv/workspace", "local", "", "")
	if err != nil {
		t.Fatalf("resolve logs dir for local state: %v", err)
	}
	if logsDir != "/srv/workspace/setta_files/runtime/logs" {
		t.Fatalf("unexpected local-state logs dir: %q", logsDir)
	}

	logsDir, err = ResolveRemoteLogsDir("/srv/workspace", "", "~/setta_files", "")
	if err != nil {
		t.Fatalf("resolve logs dir for tilde root: %v", err)
	}
	if logsDir != "/tmp" {
		t.Fatalf("expected /tmp for tilde root, got %q", logsDir)
	}
}

func TestResolveRemoteLogsDirRejectsInvalidLocation(t *testing.T) {
	t.Parallel()

	_, err := ResolveRemoteLogsDir("/srv/workspace", "workspace-local", "", "")
	requireSSHErrorCode(t, err, "InvalidSettaFilesLocation")
}

func TestComputeTunnelKeyHashAndTunnelIDAreDeterministic(t *testing.T) {
	t.Parallel()

	first := ComputeTunnelKeyHash("user@example", []string{"-p", "2222"}, "127.0.0.1", 61234)
	second := ComputeTunnelKeyHash("user@example", []string{"-p", "2222"}, "127.0.0.1", 61234)
	if first != second {
		t.Fatalf("expected stable tunnel key hash, got %q and %q", first, second)
	}

	changed := ComputeTunnelKeyHash("user@example", []string{"-p", "2222"}, "127.0.0.1", 61235)
	if changed == first {
		t.Fatalf("expected different remote endpoint to change key hash, got %q", changed)
	}

	tunnelID := TunnelIDForKeyHash(first)
	if len(tunnelID) != 20 {
		t.Fatalf("expected 20-char tunnel id, got %q", tunnelID)
	}
	if !strings.HasPrefix(first, tunnelID) {
		t.Fatalf("expected tunnel id to be a hash prefix, hash=%q tunnelID=%q", first, tunnelID)
	}
}

func TestBuildSSHTunnelArgsFormatsIPv6Loopback(t *testing.T) {
	t.Parallel()

	// SSH forwards must normalize wildcard hosts to a local loopback bind target.
	got := BuildSSHTunnelArgs(
		"user@example",
		[]string{"-p", "2222"},
		"::",
		62000,
		61234,
		[]string{"ssh", "-o", "BatchMode=yes"},
	)
	want := []string{
		"ssh", "-o", "BatchMode=yes",
		"-p", "2222",
		"-N",
		"-L",
		"62000:[::1]:61234",
		"-o",
		"ExitOnForwardFailure=yes",
		"user@example",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected tunnel args:\n got: %#v\nwant: %#v", got, want)
	}
}

func clonePayload(input map[string]any) map[string]any {
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func requireSSHErrorCode(t *testing.T, err error, want string) {
	t.Helper()

	if err == nil {
		t.Fatalf("expected error code %q, got nil", want)
	}
	typed, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected *sshx.Error, got %T: %v", err, err)
	}
	if typed.Code != want {
		t.Fatalf("unexpected error code: got %q want %q (err=%v)", typed.Code, want, err)
	}
}
