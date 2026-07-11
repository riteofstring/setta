package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

func TestProvisionRenderCloudInitEmitsDeterministicPayloadAndMetadata(t *testing.T) {
	result := renderTestCloudInit(t)
	if !result.OK {
		t.Fatal("ok = false, want true")
	}
	assertProvisionCloudInitMetadata(t, result)
	assertProvisionCloudInitContract(t, result)
	assertProvisionCloudInitRedaction(t, result)
}

func renderTestCloudInit(t *testing.T) provisionCloudInitResult {
	t.Helper()
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout

	code := runWithDeps(append([]string{"provision", "render-cloudinit"}, provisionCloudInitArgs()...), deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionCloudInitResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse output JSON: %v\n%s", err, stdout.String())
	}
	return result
}

func assertProvisionCloudInitMetadata(t *testing.T, result provisionCloudInitResult) {
	t.Helper()
	if result.Runtime.RuntimeName != "setta-test-runtime" || result.Runtime.SeedPath != "/var/lib/setta/provisioning-seed.json" {
		t.Fatalf("runtime metadata = %+v", result.Runtime)
	}
	if result.Release.Version != "v1.2.3" || result.Release.InstallerSHA256 != strings.Repeat("a", 64) {
		t.Fatalf("release metadata = %+v", result.Release)
	}
	if result.Disk.FloorGB != 64 || result.Disk.DiskGB != 96 {
		t.Fatalf("disk metadata = %+v", result.Disk)
	}
	if result.CloudInitSHA256 != sha256String(result.CloudInit) {
		t.Fatalf("cloud-init digest = %s, want digest of payload", result.CloudInitSHA256)
	}
}

func assertProvisionCloudInitContract(t *testing.T, result provisionCloudInitResult) {
	t.Helper()
	if !strings.Contains(result.CloudInit, "#cloud-config\n") ||
		!strings.Contains(result.CloudInit, "SETTA_MINISIGN_PUBLIC_KEY=") ||
		!strings.Contains(result.CloudInit, "tailscale up --auth-key \"$tailscale_auth_key\" --hostname \"$runtime_name\"") ||
		!strings.Contains(result.CloudInit, "SETTA_PROVISIONING_SEED_FILE=\"$seed_path\"") ||
		!strings.Contains(result.CloudInit, "setta pair --json --app-data-dir") ||
		!strings.Contains(result.CloudInit, "setta service configure-tailscale-serve") {
		t.Fatalf("cloud-init missing bootstrap contract:\n%s", result.CloudInit)
	}
}

func assertProvisionCloudInitRedaction(t *testing.T, result provisionCloudInitResult) {
	t.Helper()
	if !strings.Contains(result.RedactedCloudInit, "__SETTA_REDACTED_TAILSCALE_AUTH_KEY__") {
		t.Fatalf("redacted cloud-init did not include redaction marker:\n%s", result.RedactedCloudInit)
	}
	for _, secret := range []string{
		"tskey-auth-test-secret",
		strings.Repeat("b", 64),
		"attestation-key-with-'quote'-and-enough-bytes",
	} {
		if strings.Contains(result.RedactedCloudInit, secret) {
			t.Fatalf("redacted cloud-init leaked %q:\n%s", secret, result.RedactedCloudInit)
		}
	}
}

func TestProvisionRenderCloudInitShellQuotesSecretFragments(t *testing.T) {
	options := validProvisionCloudInitOptions()
	result, err := renderProvisionCloudInit(options)
	if err != nil {
		t.Fatalf("render cloud-init: %v", err)
	}
	if !strings.Contains(result.CloudInit, `provision_attestation_key='attestation-key-with-'"'"'quote'"'"'-and-enough-bytes'`) {
		t.Fatalf("attestation key was not shell-quoted safely:\n%s", result.CloudInit)
	}
}

func TestProvisionRenderCloudInitRequiresPinnedReleaseAndInstallerDigest(t *testing.T) {
	tests := map[string][]string{
		"latest version":        {"--setta-version", "latest"},
		"missing installer sha": {"--installer-sha256", ""},
		"missing public key":    {"--minisign-public-key", ""},
		"low disk":              {"--disk-gb", "32"},
	}

	for name, override := range tests {
		t.Run(name, func(t *testing.T) {
			args := append([]string{"provision", "render-cloudinit"}, replaceProvisionArg(provisionCloudInitArgs(), override[0], override[1])...)
			var stderr bytes.Buffer
			deps := testDeps()
			deps.stderr = &stderr
			code := runWithDeps(args, deps)
			if code == 0 {
				t.Fatalf("exit code = 0, want failure")
			}
			if stderr.Len() == 0 {
				t.Fatal("stderr was empty")
			}
		})
	}
}

func provisionCloudInitArgs() []string {
	pairingHash := strings.Repeat("b", 64)
	return []string{
		"--json",
		"--runtime-name", "setta-test-runtime",
		"--tailscale-auth-key", "tskey-auth-test-secret",
		"--pairing-token-hash", pairingHash,
		"--provision-id", "provision_test_012345",
		"--provision-attestation-key", "attestation-key-with-'quote'-and-enough-bytes",
		"--expires-at", "2026-07-07T10:00:00Z",
		"--setta-version", "v1.2.3",
		"--release-base-url", "https://downloads.example.test/setta/v1.2.3",
		"--installer-sha256", strings.Repeat("a", 64),
		"--minisign-public-key", "RWQtestminisignpublickey",
		"--disk-gb", "96",
	}
}

func validProvisionCloudInitOptions() provisionRenderCloudInitOptions {
	args := provisionCloudInitArgs()
	deps := testDeps()
	options, err := provisionRenderCloudInitOptionsFromArgs(args, deps)
	if err != nil {
		panic(err)
	}
	return options
}

func replaceProvisionArg(args []string, name string, value string) []string {
	replaced := append([]string(nil), args...)
	for index := 0; index < len(replaced)-1; index++ {
		if replaced[index] == name {
			replaced[index+1] = value
			return replaced
		}
	}
	return append(replaced, name, value)
}

func sha256String(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
