package hostedmeasurement

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"setta/internal/runtimeinstall"
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
		installRequest.HealthAttempts != 60 || installRequest.HealthInterval != 2*time.Second {
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

func (fake *fakeHostedRuntimeInstaller) Install(_ context.Context, request runtimeinstall.InstallRequest) (runtimeinstall.InstallResult, error) {
	*fake.stages = append(*fake.stages, "install")
	fake.request = request
	return fake.result, fake.err
}
