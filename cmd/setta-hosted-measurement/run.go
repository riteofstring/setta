package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"time"

	"setta/internal/hostedmeasurement"
	"setta/internal/runtimeinstall"
	"setta/internal/runtimepair"
	"setta/internal/runtimeprovider"
	"setta/internal/sprites"
)

const (
	hostedProviderHTTPTimeout = 30 * time.Second
	hostedHealthAttempts      = 60
	hostedHealthInterval      = 2 * time.Second
)

type provisionFlags struct {
	BuildContext               string
	DockerPath                 string
	FlyctlPath                 string
	FlyInventoryTokenPath      string
	FlyMutationTokenPath       string
	ManifestPath               string
	MinisignPath               string
	RuntimeReleaseManifestPath string
	SpritesTokenPath           string
}

type provisionDependencies struct {
	coordinator hostedmeasurement.RunCoordinator
	publish     hostedmeasurement.FlyImagePublishRequest
}

type runCompleteEvent struct {
	Event string `json:"event"`
	RunID string `json:"run_id"`
}

func runProvision(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	now func() time.Time,
) int {
	flags, err := parseProvisionFlags(args, stderr)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	authorization, err := hostedmeasurement.LoadManifest(flags.ManifestPath, now(), hostedmeasurement.ValidateForStart)
	if err != nil {
		fmt.Fprintf(stderr, "validate hosted measurement authorization: %v\n", err)
		return 1
	}
	dependencies, err := buildProvisionDependencies(ctx, flags, authorization, now)
	if err != nil {
		fmt.Fprintf(stderr, "prepare hosted measurement run: %v\n", err)
		return 1
	}
	cleanupCtx, cancelCleanup := context.WithDeadline(context.Background(), authorization.CleanupDeadline)
	defer cancelCleanup()
	if err := dependencies.coordinator.Run(ctx, cleanupCtx, authorization, dependencies.publish); err != nil {
		fmt.Fprintf(stderr, "hosted measurement run failed: %v\n", err)
		return 1
	}
	event := runCompleteEvent{Event: "hosted_measurement_complete", RunID: authorization.Manifest.RunID}
	if err := json.NewEncoder(stdout).Encode(event); err != nil {
		fmt.Fprintf(stderr, "write hosted measurement result: %v\n", err)
		return 1
	}
	return 0
}

func parseProvisionFlags(args []string, stderr io.Writer) (provisionFlags, error) {
	var config provisionFlags
	flagSet := flag.NewFlagSet("setta-hosted-measurement run", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.BuildContext, "build-context", "", "absolute private checked image build context")
	flagSet.StringVar(&config.DockerPath, "docker", "", "absolute Docker client path")
	flagSet.StringVar(&config.FlyctlPath, "flyctl", "", "absolute flyctl path")
	flagSet.StringVar(&config.FlyInventoryTokenPath, "fly-inventory-token-file", "", "private Fly inventory token file")
	flagSet.StringVar(&config.FlyMutationTokenPath, "fly-mutation-token-file", "", "private Fly mutation token file")
	flagSet.StringVar(&config.ManifestPath, "manifest", "", "absolute private authorization manifest path")
	flagSet.StringVar(&config.MinisignPath, "minisign", "", "absolute Minisign client path")
	flagSet.StringVar(&config.RuntimeReleaseManifestPath, "runtime-release-manifest", "", "absolute private runtime release manifest")
	flagSet.StringVar(&config.SpritesTokenPath, "sprites-token-file", "", "private Sprites token file")
	if err := flagSet.Parse(args); err != nil {
		return provisionFlags{}, err
	}
	if flagSet.NArg() != 0 {
		return provisionFlags{}, errors.New("setta-hosted-measurement run does not accept positional arguments")
	}
	for label, value := range map[string]string{
		"--build-context": config.BuildContext, "--docker": config.DockerPath,
		"--fly-inventory-token-file": config.FlyInventoryTokenPath,
		"--fly-mutation-token-file":  config.FlyMutationTokenPath, "--flyctl": config.FlyctlPath,
		"--manifest": config.ManifestPath, "--minisign": config.MinisignPath,
		"--runtime-release-manifest": config.RuntimeReleaseManifestPath,
		"--sprites-token-file":       config.SpritesTokenPath,
	} {
		if value == "" || !filepath.IsAbs(value) {
			return provisionFlags{}, fmt.Errorf("%s must be an absolute path", label)
		}
	}
	return config, nil
}

func buildProvisionDependencies(
	ctx context.Context,
	flags provisionFlags,
	authorization hostedmeasurement.Authorization,
	now func() time.Time,
) (provisionDependencies, error) {
	mutationToken, inventoryToken, spriteToken, err := readProvisionCredentials(flags, authorization)
	if err != nil {
		return provisionDependencies{}, err
	}
	defer clear(mutationToken)
	defer clear(inventoryToken)
	defer clear(spriteToken)
	commands, err := buildProvisionCommandRunners(flags)
	if err != nil {
		return provisionDependencies{}, err
	}
	release, verifier, err := verifyProvisionRelease(ctx, flags, commands.minisign)
	if err != nil {
		return provisionDependencies{}, err
	}
	publish := hostedmeasurement.FlyImagePublishRequest{
		Authorization: authorization, BuildContext: flags.BuildContext,
		DockerConfig: filepath.Join(authorization.StateDirectory, "docker-config"),
		Dockerfile:   filepath.Join(flags.BuildContext, "Dockerfile"),
		MetadataPath: filepath.Join(authorization.StateDirectory, "image-metadata.json"),
	}
	if err := hostedmeasurement.ValidateImagePublishInputs(publish); err != nil {
		return provisionDependencies{}, err
	}
	state, err := hostedmeasurement.OpenStateStore(authorization.StateDirectory, authorization, now())
	if err != nil {
		return provisionDependencies{}, err
	}
	return composeProvisionDependencies(
		authorization, state, release, verifier, commands, mutationToken, inventoryToken, spriteToken, publish, now,
	)
}

type provisionCommandRunners struct {
	docker   *hostedmeasurement.ExecFlyCommandRunner
	flyctl   *hostedmeasurement.ExecFlyCommandRunner
	minisign *hostedmeasurement.ExecFlyCommandRunner
}

func buildProvisionCommandRunners(flags provisionFlags) (provisionCommandRunners, error) {
	docker, err := hostedmeasurement.NewExecFlyCommandRunner(flags.DockerPath)
	if err != nil {
		return provisionCommandRunners{}, err
	}
	flyctl, err := hostedmeasurement.NewExecFlyCommandRunner(flags.FlyctlPath)
	if err != nil {
		return provisionCommandRunners{}, err
	}
	minisign, err := hostedmeasurement.NewExecFlyCommandRunner(flags.MinisignPath)
	if err != nil {
		return provisionCommandRunners{}, err
	}
	return provisionCommandRunners{docker: docker, flyctl: flyctl, minisign: minisign}, nil
}

func readProvisionCredentials(
	flags provisionFlags,
	authorization hostedmeasurement.Authorization,
) ([]byte, []byte, []byte, error) {
	mutationToken, err := hostedmeasurement.ReadPrivateCredentialFile(flags.FlyMutationTokenPath, authorization)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("read Fly mutation credential: %w", err)
	}
	inventoryToken, err := hostedmeasurement.ReadPrivateCredentialFile(flags.FlyInventoryTokenPath, authorization)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("read Fly inventory credential: %w", err)
	}
	spriteToken, err := hostedmeasurement.ReadPrivateCredentialFile(flags.SpritesTokenPath, authorization)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("read Sprites credential: %w", err)
	}
	if bytes.Equal(mutationToken, inventoryToken) || bytes.Equal(mutationToken, spriteToken) || bytes.Equal(inventoryToken, spriteToken) {
		return nil, nil, nil, errors.New("hosted measurement requires three distinct provider credentials")
	}
	return mutationToken, inventoryToken, spriteToken, nil
}

func verifyProvisionRelease(
	ctx context.Context,
	flags provisionFlags,
	minisign *hostedmeasurement.ExecFlyCommandRunner,
) (hostedmeasurement.RuntimeReleaseInputs, runtimeinstall.MinisignVerifier, error) {
	release, err := hostedmeasurement.LoadRuntimeReleaseManifest(flags.RuntimeReleaseManifestPath)
	if err != nil {
		return hostedmeasurement.RuntimeReleaseInputs{}, runtimeinstall.MinisignVerifier{}, err
	}
	verifier := runtimeinstall.MinisignVerifier{Command: minisign.BinaryPath()}
	if err := runtimeinstall.VerifyReleaseArtifact(ctx, release.Artifact, verifier); err != nil {
		return hostedmeasurement.RuntimeReleaseInputs{}, runtimeinstall.MinisignVerifier{}, err
	}
	return release, verifier, nil
}

func composeProvisionDependencies(
	authorization hostedmeasurement.Authorization,
	state *hostedmeasurement.StateStore,
	release hostedmeasurement.RuntimeReleaseInputs,
	verifier runtimeinstall.MinisignVerifier,
	commands provisionCommandRunners,
	mutationToken []byte,
	inventoryToken []byte,
	spriteToken []byte,
	publish hostedmeasurement.FlyImagePublishRequest,
	now func() time.Time,
) (provisionDependencies, error) {
	fly, err := hostedmeasurement.NewFlyMachinesClient(hostedmeasurement.FlyMachinesClientConfig{
		BaseURL: hostedmeasurement.DefaultFlyMachinesAPI, HTTPClient: &http.Client{Timeout: hostedProviderHTTPTimeout},
		MutationToken: mutationToken, InventoryToken: inventoryToken,
	})
	if err != nil {
		return provisionDependencies{}, err
	}
	spriteAdapter, err := sprites.NewAdapter(string(spriteToken))
	if err != nil {
		return provisionDependencies{}, err
	}
	secretStager, err := hostedmeasurement.NewFlySecretStager(commands.flyctl, mutationToken)
	if err != nil {
		return provisionDependencies{}, err
	}
	publicIP, err := hostedmeasurement.NewFlyPublicIPPreparer(commands.flyctl, inventoryToken, mutationToken)
	if err != nil {
		return provisionDependencies{}, err
	}
	appPreparer, err := hostedmeasurement.NewCompositeFlyAppPreparer(secretStager, publicIP, spriteToken)
	if err != nil {
		return provisionDependencies{}, err
	}
	identity, err := runtimeprovider.NewManagedIdentity("hosted-measurement:" + authorization.Manifest.RunID)
	if err != nil {
		return provisionDependencies{}, err
	}
	spriteCleanup, err := hostedmeasurement.NewSpritesCleanupClient(
		spriteToken, authorization.Manifest.SpritesOrganization, identity.Name,
	)
	if err != nil {
		return provisionDependencies{}, err
	}
	return assembledProvisionDependencies(
		authorization, state, release, verifier, commands, mutationToken,
		fly, spriteAdapter, spriteCleanup, appPreparer, publish, now,
	), nil
}

func assembledProvisionDependencies(
	authorization hostedmeasurement.Authorization,
	state *hostedmeasurement.StateStore,
	release hostedmeasurement.RuntimeReleaseInputs,
	verifier runtimeinstall.MinisignVerifier,
	commands provisionCommandRunners,
	mutationToken []byte,
	fly *hostedmeasurement.FlyMachinesClient,
	spriteAdapter *sprites.Adapter,
	spriteCleanup *hostedmeasurement.SpritesCleanupClient,
	appPreparer *hostedmeasurement.CompositeFlyAppPreparer,
	publish hostedmeasurement.FlyImagePublishRequest,
	now func() time.Time,
) provisionDependencies {
	layout := runtimeinstall.DefaultLayout()
	provisioner := hostedmeasurement.Provisioner{Fly: fly, Preparer: appPreparer, Now: now, State: state}
	runtimePreparer := hostedmeasurement.SpriteRuntimePreparer{
		HealthAttempts: hostedHealthAttempts, HealthInterval: hostedHealthInterval,
		Installer: runtimeinstall.Loop{
			Provider: spriteAdapter, Verifier: verifier, RemoteVerifierPath: release.RemoteVerifierPath,
		},
		Layout:      layout,
		Provisioner: hostedmeasurement.SpriteProvisioner{Now: now, Provider: spriteAdapter, State: state},
		Release:     release,
		Verifier:    runtimeinstall.VerifierInstaller{Executor: spriteAdapter},
	}
	runtimeStage := hostedmeasurement.SpriteRuntimeStage{
		ClientDisplayName: "hosted-control-plane-" + authorization.Manifest.RunID,
		Layout:            layout, Pairer: runtimepair.Pairer{Provider: spriteAdapter}, Runtime: runtimePreparer,
	}
	cleanup := hostedmeasurement.CleanupCoordinator{
		Credentials: hostedmeasurement.HostedClientCredentialCleaner{Fly: fly, State: state},
		Fly:         fly, Sprites: spriteCleanup, Now: now, Wait: waitForCleanupInventory, State: state,
	}
	access := hostedmeasurement.CandidateBWorkload{Provider: spriteAdapter}
	lifecycle := hostedmeasurement.CandidateBLifecycleWorkload{Fly: fly, State: state}
	coordinator := hostedmeasurement.RunCoordinator{
		Bootstrap: hostedmeasurement.ControlPlaneBootstrapper{Fly: fly, Now: now, State: state},
		Cleanup:   cleanup,
		Image: hostedmeasurement.FlyImagePublisher{
			Docker: commands.docker, Fly: commands.flyctl,
			MutationToken: string(mutationToken),
		},
		Now: now, Provisioner: provisioner, Runtime: runtimeStage, State: state,
		Workload: hostedmeasurement.CandidateBHostedSuite{Access: access, Lifecycle: lifecycle},
	}
	return provisionDependencies{coordinator: coordinator, publish: publish}
}
