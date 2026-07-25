package hostedmeasurement

import (
	"context"
	"errors"
	"time"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimepair"
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

type HostedRuntime struct {
	Sprite                 PreparedSprite
	InnerDeviceID          string
	InnerRuntimeCredential []byte
}

type HostedRuntimePairer interface {
	Pair(context.Context, runtimepair.Request) (runtimepair.Result, error)
}

type HostedSpriteRuntimePreparer interface {
	Prepare(context.Context, Authorization) (PreparedSprite, error)
}

type SpriteRuntimeStage struct {
	ClientDisplayName string
	Layout            runtimeinstall.Layout
	Pairer            HostedRuntimePairer
	Runtime           HostedSpriteRuntimePreparer
}

func (stage SpriteRuntimeStage) Prepare(ctx context.Context, authorization Authorization) (HostedRuntime, error) {
	if stage.Runtime == nil || stage.Pairer == nil {
		return HostedRuntime{}, errors.New("hosted runtime stage requires signed runtime preparation and private pairing")
	}
	prepared, err := stage.Runtime.Prepare(ctx, authorization)
	if err != nil {
		return HostedRuntime{}, err
	}
	layout := runtimeinstall.DefaultLayout()
	if stage.Layout.RuntimeStateDir != "" {
		layout = stage.Layout
	}
	paired, err := stage.Pairer.Pair(ctx, runtimepair.Request{
		RuntimeName: prepared.Observation.Name, RuntimeBinaryPath: prepared.Install.Installed.BinaryPath,
		RuntimeStateDir: layout.RuntimeStateDir, ClientDisplayName: stage.ClientDisplayName,
	})
	if err != nil {
		return HostedRuntime{}, err
	}
	if !opaqueIDPattern.MatchString(paired.DeviceID) || !validFlyToken([]byte(paired.DeviceToken)) {
		return HostedRuntime{}, errors.New("hosted runtime pairing omitted the inner device identity or credential")
	}
	return HostedRuntime{
		Sprite: prepared, InnerDeviceID: paired.DeviceID,
		InnerRuntimeCredential: []byte(paired.DeviceToken),
	}, nil
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
