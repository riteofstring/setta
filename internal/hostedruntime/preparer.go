// Package hostedruntime composes provider-neutral signed installation,
// health verification, private pairing, and safe workspace preparation for a
// Setta-managed hosted runtime.
package hostedruntime

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimepair"
	"setta/internal/runtimeprovider"
)

const HostedTestWorkspacePath = "/var/lib/setta/Hosted test workspace"

type ReleaseInputs struct {
	Artifact           runtimeinstall.ReleaseArtifact
	LocalVerifierPath  string
	RemoteVerifierPath string
	VerifierSHA256     string
}

type Phase string

const (
	PhaseInstalling Phase = "installing"
	PhasePairing    Phase = "pairing"
)

type Request struct {
	ClientDisplayName string
	MinimumFreeMiB    int
	ReportProgress    func(Phase) error
	RuntimeName       string
}

type Result struct {
	Install runtimeinstall.InstallResult
	Pairing runtimepair.Result
}

type Preparer struct {
	HealthAttempts int
	HealthInterval time.Duration
	Installer      runtimeinstall.Loop
	Layout         runtimeinstall.Layout
	Pairer         runtimepair.Pairer
	Provider       runtimeprovider.Provider
	Release        ReleaseInputs
	Verifier       runtimeinstall.VerifierInstaller
}

func (preparer Preparer) Prepare(ctx context.Context, request Request) (Result, error) {
	layout, err := preparer.validatedLayout(request)
	if err != nil {
		return Result{}, err
	}
	if err := reportProgress(request, PhaseInstalling); err != nil {
		return Result{}, err
	}
	installed, err := preparer.install(ctx, request, layout)
	if err != nil {
		return Result{}, err
	}
	if err := ensureHostedTestWorkspace(ctx, preparer.Provider, request.RuntimeName); err != nil {
		return Result{}, err
	}
	if err := reportProgress(request, PhasePairing); err != nil {
		return Result{}, err
	}
	paired, err := preparer.pair(ctx, request, layout, installed)
	if err != nil {
		return Result{}, err
	}
	return Result{Install: installed, Pairing: paired}, nil
}

func (preparer Preparer) validatedLayout(
	request Request,
) (runtimeinstall.Layout, error) {
	if preparer.Provider == nil {
		return runtimeinstall.Layout{}, errors.New("hosted runtime preparer requires a provider")
	}
	if request.RuntimeName == "" || request.ClientDisplayName == "" ||
		request.MinimumFreeMiB == 0 {
		return runtimeinstall.Layout{}, errors.New(
			"hosted runtime preparation request is incomplete",
		)
	}
	if preparer.Layout.RuntimeStateDir == "" {
		return runtimeinstall.DefaultLayout(), nil
	}
	return preparer.Layout, nil
}

func reportProgress(request Request, phase Phase) error {
	if request.ReportProgress == nil {
		return nil
	}
	return request.ReportProgress(phase)
}

func (preparer Preparer) install(
	ctx context.Context,
	request Request,
	layout runtimeinstall.Layout,
) (runtimeinstall.InstallResult, error) {
	if err := preparer.Verifier.Ensure(ctx, runtimeinstall.VerifierInstallRequest{
		RuntimeName: request.RuntimeName,
		LocalPath:   preparer.Release.LocalVerifierPath,
		RemotePath:  preparer.Release.RemoteVerifierPath,
		SHA256:      preparer.Release.VerifierSHA256,
		Layout:      layout,
	}); err != nil {
		return runtimeinstall.InstallResult{}, fmt.Errorf(
			"install signed runtime verifier: %w",
			err,
		)
	}
	installed, err := preparer.Installer.Install(ctx, runtimeinstall.InstallRequest{
		RuntimeName: request.RuntimeName,
		Desired:     preparer.Release.Artifact,
		Layout:      layout,
		StoragePolicy: &runtimeinstall.StoragePolicy{
			MinimumFreeMiB: request.MinimumFreeMiB,
		},
		HealthAttempts: preparer.HealthAttempts,
		HealthInterval: preparer.HealthInterval,
	})
	if err != nil {
		return runtimeinstall.InstallResult{}, fmt.Errorf(
			"install signed runtime release: %w",
			err,
		)
	}
	if !installed.Health.OK ||
		installed.Installed.Version != preparer.Release.Artifact.Version {
		return runtimeinstall.InstallResult{}, errors.New(
			"installed runtime did not prove the desired healthy release",
		)
	}
	return installed, nil
}

func (preparer Preparer) pair(
	ctx context.Context,
	request Request,
	layout runtimeinstall.Layout,
	installed runtimeinstall.InstallResult,
) (runtimepair.Result, error) {
	paired, err := preparer.Pairer.Pair(ctx, runtimepair.Request{
		RuntimeName:       request.RuntimeName,
		RuntimeBinaryPath: installed.Installed.BinaryPath,
		RuntimeStateDir:   layout.RuntimeStateDir,
		ClientDisplayName: request.ClientDisplayName,
	})
	if err != nil {
		return runtimepair.Result{}, fmt.Errorf("pair hosted runtime privately: %w", err)
	}
	return paired, nil
}

func ensureHostedTestWorkspace(
	ctx context.Context,
	provider runtimeprovider.Provider,
	runtimeName string,
) error {
	result, err := provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/bin/mkdir",
		Arguments:   []string{"-p", HostedTestWorkspacePath},
	})
	if err != nil {
		return fmt.Errorf("create hosted test workspace: %w", err)
	}
	if result.ExitCode != 0 {
		return errors.New("create hosted test workspace returned a non-zero exit")
	}
	return nil
}
