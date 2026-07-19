package hostedmeasurement

import (
	"context"
	"errors"
	"time"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimeprovider"
)

type HostedSpriteProvisioner interface {
	Ensure(context.Context, Authorization) (runtimeprovider.RuntimeObservation, error)
}

type HostedVerifierInstaller interface {
	Ensure(context.Context, runtimeinstall.VerifierInstallRequest) error
}

type HostedRuntimeInstaller interface {
	Install(context.Context, runtimeinstall.InstallRequest) (runtimeinstall.InstallResult, error)
}

type PreparedSprite struct {
	Observation runtimeprovider.RuntimeObservation
	Install     runtimeinstall.InstallResult
}

type SpriteRuntimePreparer struct {
	HealthAttempts int
	HealthInterval time.Duration
	Installer      HostedRuntimeInstaller
	Layout         runtimeinstall.Layout
	Provisioner    HostedSpriteProvisioner
	Release        RuntimeReleaseInputs
	Verifier       HostedVerifierInstaller
}

func (preparer SpriteRuntimePreparer) Prepare(ctx context.Context, authorization Authorization) (PreparedSprite, error) {
	if preparer.Provisioner == nil || preparer.Verifier == nil || preparer.Installer == nil {
		return PreparedSprite{}, errors.New("hosted Sprite runtime preparation requires provisioning, verifier, and install loop")
	}
	observation, err := preparer.Provisioner.Ensure(ctx, authorization)
	if err != nil {
		return PreparedSprite{}, err
	}
	if err := preparer.Verifier.Ensure(ctx, runtimeinstall.VerifierInstallRequest{
		RuntimeName: observation.Name,
		LocalPath:   preparer.Release.LocalVerifierPath,
		RemotePath:  preparer.Release.RemoteVerifierPath,
		SHA256:      preparer.Release.VerifierSHA256,
		Layout:      preparer.Layout,
	}); err != nil {
		return PreparedSprite{}, err
	}
	result, err := preparer.Installer.Install(ctx, runtimeinstall.InstallRequest{
		RuntimeName:    observation.Name,
		Desired:        preparer.Release.Artifact,
		Layout:         preparer.Layout,
		HealthAttempts: preparer.HealthAttempts,
		HealthInterval: preparer.HealthInterval,
	})
	if err != nil {
		return PreparedSprite{}, err
	}
	if result.RuntimeName != observation.Name || result.Installed.Version != preparer.Release.Artifact.Version || !result.Health.OK {
		return PreparedSprite{}, errors.New("hosted Sprite runtime install result differs from the requested healthy release")
	}
	return PreparedSprite{Observation: observation, Install: result}, nil
}
