package sprites

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimeprovider"
)

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

	artifact := runtimeinstall.ReleaseArtifact{
		Version:       requiredLiveEnv(t, "SETTA_RUNTIME_INSTALL_VERSION"),
		OS:            liveEnvDefault("SETTA_RUNTIME_INSTALL_OS", "linux"),
		Arch:          liveEnvDefault("SETTA_RUNTIME_INSTALL_ARCH", "amd64"),
		ArchivePath:   requiredLiveAbsPath(t, "SETTA_RUNTIME_INSTALL_ARCHIVE"),
		ChecksumsPath: requiredLiveAbsPath(t, "SETTA_RUNTIME_INSTALL_CHECKSUMS"),
		SignaturePath: requiredLiveAbsPath(t, "SETTA_RUNTIME_INSTALL_SIGNATURE"),
		PublicKey:     requiredLiveEnv(t, "SETTA_RUNTIME_INSTALL_PUBLIC_KEY"),
	}

	identity, err := runtimeprovider.NewManagedIdentity("phase2-runtime-install-loop:" + runID)
	if err != nil {
		t.Fatalf("derive managed identity: %v", err)
	}
	adapter, err := NewAdapter(token)
	if err != nil {
		t.Fatalf("NewAdapter: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), liveStepTimeout)
		defer cleanupCancel()
		if cleanupErr := adapter.Destroy(cleanupCtx, identity.Name); cleanupErr != nil {
			t.Errorf("cleanup Sprite %s: %v", identity.Name, cleanupErr)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), liveTestTimeout)
	defer cancel()
	observation := createLiveRuntime(t, ctx, adapter, identity, "phase2 runtime install loop")
	assertRuntimeIdentity(t, observation, identity)

	loop := runtimeinstall.Loop{
		Provider: adapter,
		Verifier: runtimeinstall.MinisignVerifier{},
	}
	result, err := loop.Install(ctx, runtimeinstall.InstallRequest{
		RuntimeName:    identity.Name,
		Desired:        artifact,
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

func requiredLiveEnv(t *testing.T, name string) string {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		t.Fatalf("%s is required after live runtime install validation is authorized", name)
	}
	return value
}

func liveEnvDefault(name string, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func requiredLiveAbsPath(t *testing.T, name string) string {
	t.Helper()
	value := requiredLiveEnv(t, name)
	if filepath.IsAbs(value) {
		return value
	}
	absolute, err := filepath.Abs(value)
	if err != nil {
		t.Fatalf("resolve %s: %v", name, err)
	}
	return absolute
}
