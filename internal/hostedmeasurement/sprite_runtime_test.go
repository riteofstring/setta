package hostedmeasurement

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimepair"
	"setta/internal/runtimeprovider"
)

func TestSpriteRuntimePreparerRunsDurableSignedInstallInOrder(t *testing.T) {
	authorization, _ := loadTestAuthorization(t)
	stages := []string{}
	observation := runtimeprovider.RuntimeObservation{Name: "setta-u-0123456789abcdef0123456789abcdef", Placement: "yyz"}
	release := RuntimeReleaseInputs{
		Artifact:          runtimeinstall.ReleaseArtifact{Version: "phase3"},
		LocalVerifierPath: "/private/setta-release-verify", RemoteVerifierPath: "/var/lib/setta/runtime-install/releases/setta-release-verify",
		VerifierSHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	}
	preparer := SpriteRuntimePreparer{
		Provisioner: &fakeHostedSpriteProvisioner{stages: &stages, observation: observation},
		Verifier:    &fakeHostedVerifierInstaller{stages: &stages},
		Installer: &fakeHostedRuntimeInstaller{stages: &stages, result: runtimeinstall.InstallResult{
			RuntimeName: observation.Name, Installed: runtimeinstall.InstalledRelease{Version: release.Artifact.Version},
			Health: runtimeinstall.HealthCheck{OK: true},
		}},
		Release: release, HealthAttempts: 60, HealthInterval: 2 * time.Second,
	}
	prepared, err := preparer.Prepare(context.Background(), authorization)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stages, []string{"provision", "verifier", "install"}) || prepared.Observation.Placement != "yyz" {
		t.Fatalf("stages = %v, prepared = %+v", stages, prepared)
	}
	verifierRequest := preparer.Verifier.(*fakeHostedVerifierInstaller).request
	installRequest := preparer.Installer.(*fakeHostedRuntimeInstaller).request
	if verifierRequest.RuntimeName != observation.Name || verifierRequest.SHA256 != release.VerifierSHA256 {
		t.Fatalf("verifier request = %+v", verifierRequest)
	}
	if installRequest.RuntimeName != observation.Name || installRequest.Desired.Version != release.Artifact.Version ||
		installRequest.HealthAttempts != 60 || installRequest.HealthInterval != 2*time.Second ||
		installRequest.StoragePolicy == nil ||
		installRequest.StoragePolicy.MinimumFreeMiB != authorization.Manifest.MinimumDiskFreeMiB {
		t.Fatalf("install request = %+v", installRequest)
	}
}

func TestSpriteRuntimePreparerStopsAtFailedStageAndRejectsUnhealthyResult(t *testing.T) {
	authorization, _ := loadTestAuthorization(t)
	observation := runtimeprovider.RuntimeObservation{Name: "setta-u-0123456789abcdef0123456789abcdef"}
	t.Run("verifier failure", func(t *testing.T) {
		stages := []string{}
		verifierErr := errors.New("injected verifier failure")
		preparer := SpriteRuntimePreparer{
			Provisioner: &fakeHostedSpriteProvisioner{stages: &stages, observation: observation},
			Verifier:    &fakeHostedVerifierInstaller{stages: &stages, err: verifierErr},
			Installer:   &fakeHostedRuntimeInstaller{stages: &stages},
		}
		if _, err := preparer.Prepare(context.Background(), authorization); !errors.Is(err, verifierErr) {
			t.Fatalf("Prepare error = %v", err)
		}
		if !reflect.DeepEqual(stages, []string{"provision", "verifier"}) {
			t.Fatalf("stages = %v", stages)
		}
	})
	t.Run("unhealthy result", func(t *testing.T) {
		stages := []string{}
		preparer := SpriteRuntimePreparer{
			Provisioner: &fakeHostedSpriteProvisioner{stages: &stages, observation: observation},
			Verifier:    &fakeHostedVerifierInstaller{stages: &stages},
			Installer: &fakeHostedRuntimeInstaller{stages: &stages, result: runtimeinstall.InstallResult{
				RuntimeName: observation.Name, Installed: runtimeinstall.InstalledRelease{Version: ""},
			}},
		}
		if _, err := preparer.Prepare(context.Background(), authorization); err == nil {
			t.Fatal("Prepare accepted an unhealthy install result")
		}
	})
}

func TestSpriteRuntimeStagePairsOnlyAfterHealthySignedInstall(t *testing.T) {
	authorization, _ := loadTestAuthorization(t)
	stages := []string{}
	observation := runtimeprovider.RuntimeObservation{Name: "setta-u-0123456789abcdef0123456789abcdef"}
	prepared := PreparedSprite{
		Observation: observation,
		Install: runtimeinstall.InstallResult{
			RuntimeName: observation.Name,
			Installed:   runtimeinstall.InstalledRelease{Version: "phase3", BinaryPath: "/releases/phase3/setta"},
			Health:      runtimeinstall.HealthCheck{OK: true},
		},
	}
	runtimePreparer := &fakePreparedSpriteRuntime{stages: &stages, prepared: prepared}
	pairer := &fakeHostedRuntimePairer{stages: &stages, result: runtimepair.Result{
		DeviceID: "device_123", DeviceToken: "inner-runtime-credential",
	}}
	stage := SpriteRuntimeStage{
		Runtime: runtimePreparer, Pairer: pairer, ClientDisplayName: "Hosted measurement gateway",
	}
	runtime, err := stage.Prepare(context.Background(), authorization)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stages, []string{"runtime", "pair"}) || runtime.InnerDeviceID != "device_123" ||
		string(runtime.InnerRuntimeCredential) != "inner-runtime-credential" {
		t.Fatalf("stages = %v, runtime = %+v", stages, runtime)
	}
	if pairer.request.RuntimeName != observation.Name || pairer.request.RuntimeBinaryPath != "/releases/phase3/setta" ||
		pairer.request.RuntimeStateDir != runtimeinstall.DefaultLayout().RuntimeStateDir {
		t.Fatalf("pair request = %+v", pairer.request)
	}
}

func TestSpriteRuntimeStageRejectsPairerWithoutCredential(t *testing.T) {
	authorization, _ := loadTestAuthorization(t)
	stages := []string{}
	stage := SpriteRuntimeStage{
		Runtime: &fakePreparedSpriteRuntime{stages: &stages, prepared: PreparedSprite{
			Observation: runtimeprovider.RuntimeObservation{Name: "setta-u-0123456789abcdef0123456789abcdef"},
			Install:     runtimeinstall.InstallResult{Installed: runtimeinstall.InstalledRelease{BinaryPath: "/runtime/setta"}},
		}},
		Pairer:            &fakeHostedRuntimePairer{stages: &stages, result: runtimepair.Result{DeviceID: "device_123"}},
		ClientDisplayName: "Hosted measurement gateway",
	}
	if _, err := stage.Prepare(context.Background(), authorization); err == nil {
		t.Fatal("hosted runtime stage accepted a missing paired credential")
	}
}

type fakeHostedSpriteProvisioner struct {
	stages      *[]string
	observation runtimeprovider.RuntimeObservation
	err         error
}

func (fake *fakeHostedSpriteProvisioner) Ensure(context.Context, Authorization) (runtimeprovider.RuntimeObservation, error) {
	*fake.stages = append(*fake.stages, "provision")
	return fake.observation, fake.err
}

type fakeHostedVerifierInstaller struct {
	stages  *[]string
	request runtimeinstall.VerifierInstallRequest
	err     error
}

func (fake *fakeHostedVerifierInstaller) Ensure(_ context.Context, request runtimeinstall.VerifierInstallRequest) error {
	*fake.stages = append(*fake.stages, "verifier")
	fake.request = request
	return fake.err
}

type fakeHostedRuntimeInstaller struct {
	stages  *[]string
	request runtimeinstall.InstallRequest
	result  runtimeinstall.InstallResult
	err     error
}

type fakePreparedSpriteRuntime struct {
	stages   *[]string
	prepared PreparedSprite
	err      error
}

func (fake *fakePreparedSpriteRuntime) Prepare(context.Context, Authorization) (PreparedSprite, error) {
	*fake.stages = append(*fake.stages, "runtime")
	return fake.prepared, fake.err
}

type fakeHostedRuntimePairer struct {
	stages  *[]string
	request runtimepair.Request
	result  runtimepair.Result
	err     error
}

func (fake *fakeHostedRuntimePairer) Pair(_ context.Context, request runtimepair.Request) (runtimepair.Result, error) {
	*fake.stages = append(*fake.stages, "pair")
	fake.request = request
	return fake.result, fake.err
}

func (fake *fakeHostedRuntimeInstaller) Install(_ context.Context, request runtimeinstall.InstallRequest) (runtimeinstall.InstallResult, error) {
	*fake.stages = append(*fake.stages, "install")
	fake.request = request
	return fake.result, fake.err
}
