package hostedmeasurement

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/runtimeinstall"
)

func TestLoadRuntimeReleaseManifestReturnsPinnedPrivateInputs(t *testing.T) {
	directory, manifestPath, manifest := writeRuntimeReleaseFixture(t)
	inputs, err := LoadRuntimeReleaseManifest(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if inputs.Artifact.Version != manifest.Version || inputs.Artifact.ArchivePath != filepath.Join(directory, manifest.Archive) {
		t.Fatalf("artifact = %+v", inputs.Artifact)
	}
	wantRemote := runtimeinstall.DefaultLayout().ReleaseRoot + "/setta-release-verify"
	if inputs.RemoteVerifierPath != wantRemote || inputs.VerifierSHA256 != manifest.VerifierSHA256 {
		t.Fatalf("verifier inputs = %+v", inputs)
	}
}

func TestLoadRuntimeReleaseManifestRejectsUnknownDuplicateAndUnsafeFiles(t *testing.T) {
	t.Run("unknown field", func(t *testing.T) {
		_, manifestPath, _ := writeRuntimeReleaseFixture(t)
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			t.Fatal(err)
		}
		data = []byte(strings.TrimSuffix(string(data), "}\n") + ",\"unknown\":true}\n")
		writePrivateTestFile(t, manifestPath, data)
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil {
			t.Fatal("runtime release loader accepted an unknown field")
		}
	})
	t.Run("duplicate field", func(t *testing.T) {
		_, manifestPath, _ := writeRuntimeReleaseFixture(t)
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			t.Fatal(err)
		}
		data = []byte(strings.TrimSuffix(string(data), "}\n") + ",\"version\":\"other\"}\n")
		writePrivateTestFile(t, manifestPath, data)
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil || !strings.Contains(err.Error(), "duplicate") {
			t.Fatalf("duplicate field error = %v", err)
		}
	})
	t.Run("path traversal", func(t *testing.T) {
		_, manifestPath, manifest := writeRuntimeReleaseFixture(t)
		manifest.Archive = "../release.tar.gz"
		writeRuntimeReleaseManifest(t, manifestPath, manifest)
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil {
			t.Fatal("runtime release loader accepted path traversal")
		}
	})
	t.Run("public file", func(t *testing.T) {
		directory, manifestPath, manifest := writeRuntimeReleaseFixture(t)
		if err := os.Chmod(filepath.Join(directory, manifest.Archive), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil {
			t.Fatalf("runtime release loader accepted public %s", manifest.Archive)
		}
	})
	t.Run("verifier symlink", func(t *testing.T) {
		directory, manifestPath, manifest := writeRuntimeReleaseFixture(t)
		verifierPath := filepath.Join(directory, manifest.Verifier)
		if err := os.Remove(verifierPath); err != nil {
			t.Fatal(err)
		}
		target := filepath.Join(directory, "verifier-target")
		writePrivateTestFile(t, target, []byte("verifier"))
		if err := os.Symlink(target, verifierPath); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil {
			t.Fatal("runtime release loader followed a verifier symlink")
		}
	})
}

func TestLoadRuntimeReleaseManifestRejectsWrongTargetAndVerifierDigest(t *testing.T) {
	t.Run("target", func(t *testing.T) {
		_, manifestPath, manifest := writeRuntimeReleaseFixture(t)
		manifest.Arch = "arm64"
		writeRuntimeReleaseManifest(t, manifestPath, manifest)
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil {
			t.Fatal("runtime release loader accepted a non-amd64 target")
		}
	})
	t.Run("digest", func(t *testing.T) {
		_, manifestPath, manifest := writeRuntimeReleaseFixture(t)
		manifest.VerifierSHA256 = strings.Repeat("0", 64)
		writeRuntimeReleaseManifest(t, manifestPath, manifest)
		if _, err := LoadRuntimeReleaseManifest(manifestPath); err == nil {
			t.Fatal("runtime release loader accepted a mismatched verifier digest")
		}
	})
}

func writeRuntimeReleaseFixture(t *testing.T) (string, string, RuntimeReleaseManifest) {
	t.Helper()
	directory := t.TempDir()
	if err := os.Chmod(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := RuntimeReleaseManifest{
		SchemaVersion: RuntimeReleaseManifestSchemaVersion,
		Version:       "phase3-candidate-b", OS: "linux", Arch: "amd64",
		Archive: "setta_phase3-candidate-b_linux_amd64.tar.gz", Checksums: "SHA256SUMS",
		Signature: "SHA256SUMS.minisig", PublicKey: "RWQtest-public-key", Verifier: "setta-release-verify",
	}
	for name, data := range map[string][]byte{
		manifest.Archive: {}, manifest.Checksums: []byte("checksums"), manifest.Signature: []byte("signature"),
		manifest.Verifier: []byte("verifier"),
	} {
		writePrivateTestFile(t, filepath.Join(directory, name), data)
	}
	digest := sha256.Sum256([]byte("verifier"))
	manifest.VerifierSHA256 = hex.EncodeToString(digest[:])
	manifestPath := filepath.Join(directory, "runtime-release.json")
	writeRuntimeReleaseManifest(t, manifestPath, manifest)
	return directory, manifestPath, manifest
}

func writeRuntimeReleaseManifest(t *testing.T, path string, manifest RuntimeReleaseManifest) {
	t.Helper()
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	writePrivateTestFile(t, path, append(data, '\n'))
}

func writePrivateTestFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
}
