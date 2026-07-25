package sprites

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimeprovider"
)

const liveRuntimeInstallVersion = "phase2-test"

func TestLiveRuntimeInstallLoop(t *testing.T) {
	if os.Getenv("SETTA_LIVE_SPRITES") != "1" {
		t.Skip("set SETTA_LIVE_SPRITES=1 to authorize destructive, billable Sprites runtime install validation")
	}
	if os.Getenv("SETTA_LIVE_RUNTIME_INSTALL_LOOP") != "1" {
		t.Skip("set SETTA_LIVE_RUNTIME_INSTALL_LOOP=1 to run the Phase 2 runtime install loop harness")
	}
	token := os.Getenv("SPRITE_TOKEN")
	if token == "" {
		t.Fatal("SPRITE_TOKEN is required after live Sprites validation is authorized")
	}
	runID := os.Getenv("SETTA_SPRITES_LIVE_RUN_ID")
	if runID == "" {
		t.Fatal("SETTA_SPRITES_LIVE_RUN_ID is required after live Sprites validation is authorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), liveTestTimeout)
	defer cancel()
	inputs := buildLiveRuntimeInstallInputs(t, ctx)

	identity, err := runtimeprovider.NewManagedIdentity("phase2-runtime-install-loop:" + runID)
	if err != nil {
		t.Fatalf("derive managed identity: %v", err)
	}
	adapter, err := NewAdapter(token)
	if err != nil {
		t.Fatalf("NewAdapter: %v", err)
	}
	registerLiveRuntimeInstallCleanup(t, adapter, identity.Name)

	observation := createLiveRuntime(t, ctx, adapter, identity, "phase2 runtime install loop")
	assertRuntimeInstallIdentity(t, observation, identity)
	uploadLiveReleaseVerifier(t, ctx, adapter, identity.Name, inputs)

	loop := runtimeinstall.Loop{
		Provider:           adapter,
		Verifier:           runtimeinstall.MinisignVerifier{},
		RemoteVerifierPath: inputs.remoteVerifierPath,
	}
	result, err := loop.Install(ctx, runtimeinstall.InstallRequest{
		RuntimeName:    identity.Name,
		Desired:        inputs.artifact,
		HealthAttempts: 60,
		HealthInterval: 2 * time.Second,
	})
	if err != nil {
		t.Fatalf("runtime install loop: %v", err)
	}
	if !result.Health.OK {
		t.Fatalf("runtime install loop health = %#v", result.Health)
	}
	t.Logf("installed Setta runtime %s on Sprite %s", result.Installed.Version, identity.Name)
}

type liveRuntimeInstallInputs struct {
	artifact           runtimeinstall.ReleaseArtifact
	localVerifierPath  string
	remoteVerifierPath string
	verifierSHA256     string
}

func buildLiveRuntimeInstallInputs(t *testing.T, ctx context.Context) liveRuntimeInstallInputs {
	t.Helper()
	minisign, err := exec.LookPath("minisign")
	if err != nil {
		t.Fatal("local minisign is required to generate and verify the throwaway live release signature")
	}
	repoRoot := liveRuntimeInstallRepoRoot(t)
	tempDir := t.TempDir()
	artifactName := fmt.Sprintf("setta_%s_linux_amd64", liveRuntimeInstallVersion)
	artifactDir := filepath.Join(tempDir, artifactName)
	if err := os.Mkdir(artifactDir, 0o755); err != nil {
		t.Fatalf("create live release artifact directory: %v", err)
	}
	binaryPath := filepath.Join(artifactDir, "setta")
	runLiveReleaseCommand(t, ctx, repoRoot, []string{
		"CGO_ENABLED=0",
		"GOOS=linux",
		"GOARCH=amd64",
	}, filepath.Join(repoRoot, "scripts", "go.sh"),
		"build",
		"-buildvcs=false",
		"-trimpath",
		"-ldflags", "-s -w -buildid= -X main.version="+liveRuntimeInstallVersion,
		"-o", binaryPath,
		"./cmd/setta",
	)
	if err := os.Chmod(binaryPath, 0o755); err != nil {
		t.Fatalf("make live release binary executable: %v", err)
	}

	archivePath := filepath.Join(tempDir, artifactName+".tar.gz")
	runLiveReleaseCommand(t, ctx, repoRoot, nil,
		"python3",
		filepath.Join(repoRoot, "scripts", "release", "make-tar-gz.py"),
		archivePath,
		artifactDir,
	)
	archiveSHA256 := liveReleaseFileSHA256(t, archivePath)
	binarySHA256 := liveReleaseFileSHA256(t, binaryPath)
	checksumsPath := filepath.Join(tempDir, "SHA256SUMS")
	checksums := fmt.Sprintf(
		"%s  %s.tar.gz\n%s  %s/setta\n",
		archiveSHA256,
		artifactName,
		binarySHA256,
		artifactName,
	)
	if err := os.WriteFile(checksumsPath, []byte(checksums), 0o644); err != nil {
		t.Fatalf("write live release checksums: %v", err)
	}

	publicKeyPath := filepath.Join(tempDir, "phase2-test.pub")
	secretKeyPath := filepath.Join(tempDir, "phase2-test.key")
	runLiveReleaseCommand(t, ctx, repoRoot, nil,
		minisign, "-G", "-W", "-p", publicKeyPath, "-s", secretKeyPath,
	)
	signaturePath := checksumsPath + ".minisig"
	runLiveReleaseCommand(t, ctx, repoRoot, nil,
		minisign, "-S", "-l", "-m", checksumsPath, "-s", secretKeyPath, "-x", signaturePath,
	)
	publicKey := readLiveMinisignPublicKey(t, publicKeyPath)
	runLiveReleaseCommand(t, ctx, repoRoot, nil,
		minisign, "-Vm", checksumsPath, "-P", publicKey, "-x", signaturePath,
	)

	artifact := runtimeinstall.ReleaseArtifact{
		Version:       liveRuntimeInstallVersion,
		OS:            "linux",
		Arch:          "amd64",
		ArchivePath:   archivePath,
		ChecksumsPath: checksumsPath,
		SignaturePath: signaturePath,
		PublicKey:     publicKey,
	}
	localVerifierPath := filepath.Join(tempDir, "setta-release-verify")
	runLiveReleaseCommand(t, ctx, repoRoot, []string{
		"CGO_ENABLED=0",
		"GOOS=linux",
		"GOARCH=amd64",
	}, filepath.Join(repoRoot, "scripts", "go.sh"),
		"build",
		"-buildvcs=false",
		"-trimpath",
		"-ldflags", "-s -w -buildid=",
		"-o", localVerifierPath,
		"./cmd/setta-release-verify",
	)
	return liveRuntimeInstallInputs{
		artifact:           artifact,
		localVerifierPath:  localVerifierPath,
		remoteVerifierPath: runtimeinstall.DefaultLayout().ReleaseRoot + "/setta-release-verify",
		verifierSHA256:     liveReleaseFileSHA256(t, localVerifierPath),
	}
}

func uploadLiveReleaseVerifier(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	runtimeName string,
	inputs liveRuntimeInstallInputs,
) {
	t.Helper()
	// The verifier is built and hashed locally, uploaded over the authenticated
	// management channel used by the install loop, and kept non-executable until
	// the Sprite's sha256sum reproduces the recorded digest.
	mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/install",
		Arguments: []string{
			"-d", "-m", "0755", "-o", "root", "-g", "root",
			runtimeinstall.DefaultLayout().ReleaseRoot,
		},
	})
	uploadFile(t, ctx, adapter, runtimeName, inputs.localVerifierPath, inputs.remoteVerifierPath, false)
	digest := mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/sha256sum",
		Arguments:   []string{inputs.remoteVerifierPath},
	})
	fields := strings.Fields(string(digest.Stdout))
	if len(fields) != 2 || fields[0] != inputs.verifierSHA256 || fields[1] != inputs.remoteVerifierPath {
		t.Fatalf(
			"uploaded release verifier digest = %q, want %s  %s",
			strings.TrimSpace(string(digest.Stdout)),
			inputs.verifierSHA256,
			inputs.remoteVerifierPath,
		)
	}
	mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/bin/chown",
		Arguments:   []string{"root:root", inputs.remoteVerifierPath},
	})
	mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/bin/chmod",
		Arguments:   []string{"0755", inputs.remoteVerifierPath},
	})
	t.Logf("uploaded release verifier sha256=%s", inputs.verifierSHA256)
}

func registerLiveRuntimeInstallCleanup(t *testing.T, adapter *Adapter, runtimeName string) {
	t.Helper()
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), liveStepTimeout)
		defer cleanupCancel()
		if err := adapter.Destroy(cleanupCtx, runtimeName); err != nil {
			t.Errorf("cleanup Sprite %s: %v", runtimeName, err)
			return
		}
		_, found, err := adapter.Inspect(cleanupCtx, runtimeName)
		if err != nil {
			t.Errorf("verify cleanup Sprite %s: %v", runtimeName, err)
			return
		}
		if found {
			t.Errorf("verify cleanup Sprite %s: still present after destroy", runtimeName)
		}
	})
}

func liveRuntimeInstallRepoRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate live runtime install harness")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}

func runLiveReleaseCommand(
	t *testing.T,
	ctx context.Context,
	directory string,
	environment []string,
	path string,
	arguments ...string,
) {
	t.Helper()
	command := exec.CommandContext(ctx, path, arguments...)
	command.Dir = directory
	command.Env = append(os.Environ(), environment...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run %s: %v: %s", path, err, strings.TrimSpace(string(output)))
	}
}

func liveReleaseFileSHA256(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s for SHA256: %v", path, err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func readLiveMinisignPublicKey(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read throwaway minisign public key: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 || !strings.HasPrefix(lines[0], "untrusted comment: ") || strings.TrimSpace(lines[1]) == "" {
		t.Fatalf("unexpected throwaway minisign public key file %q", strings.TrimSpace(string(data)))
	}
	return strings.TrimSpace(lines[1])
}

func assertRuntimeInstallIdentity(
	t *testing.T,
	observation runtimeprovider.RuntimeObservation,
	identity runtimeprovider.ManagedIdentity,
) {
	t.Helper()
	if observation.Name != identity.Name || !sameRuntimeInstallStrings(observation.Labels, identity.Labels) {
		t.Fatalf("runtime identity = %#v, want %#v", observation, identity)
	}
}

func sameRuntimeInstallStrings(left []string, right []string) bool {
	left = slices.Clone(left)
	right = slices.Clone(right)
	slices.Sort(left)
	slices.Sort(right)
	return slices.Equal(left, right)
}
