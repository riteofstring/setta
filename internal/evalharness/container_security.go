package evalharness

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

type ContainerSecurityConfig struct {
	RepoRoot         string
	RecordingsRoot   string
	CodexLinuxBundle string
	DockerCommand    string
	CodexCommand     string
	PNPMCommand      string
}

type ContainerSecurityOutput struct {
	Report    ContainerSecurityReport
	Artifacts ContainerSecurityArtifactPaths
}

type normalizedContainerSecurityConfig struct {
	repoRoot         string
	recordingsRoot   string
	codexLinuxBundle string
	dockerCommand    string
	codexCommand     string
	pnpmCommand      string
	phase0Codex      Phase0CodexEvidence
}

type containerSecurityImages struct {
	phase0             *phase0DockerResources
	phase0BuildContext string
	phase0ID           string
	phase1             *phase1Images
}

// RunContainerSecurityScan builds the exact eval images, exports them through
// Docker's trusted CLI, and scans only those archives with the pinned scanner.
// The scanner never receives the Docker socket, repository, home directory, or
// credentials. Its one networked database-update turn sees only an empty cache.
func RunContainerSecurityScan(
	ctx context.Context,
	config ContainerSecurityConfig,
) (ContainerSecurityOutput, error) {
	if ctx == nil {
		return ContainerSecurityOutput{}, errors.New("container security context is required")
	}
	normalized, repository, err := normalizeContainerSecurityRun(ctx, config)
	if err != nil {
		return ContainerSecurityOutput{}, err
	}
	pin, err := loadContainerSecurityPolicy(normalized.repoRoot)
	if err != nil {
		return ContainerSecurityOutput{}, err
	}
	toolchain, err := loadPhase1ToolchainPin(normalized.repoRoot)
	if err != nil {
		return ContainerSecurityOutput{}, err
	}
	client := phase0DockerClient{
		command:  normalized.dockerCommand,
		repoRoot: normalized.repoRoot,
	}
	if _, err := inspectPhase0Docker(ctx, client); err != nil {
		return ContainerSecurityOutput{}, fmt.Errorf("container security Docker preflight: %w", err)
	}
	runtime, err := newContainerSecurityRuntime(client, pin)
	if err != nil {
		return ContainerSecurityOutput{}, err
	}
	if err := runtime.validateScanner(ctx); err != nil {
		return ContainerSecurityOutput{}, errors.Join(err, runtime.cleanup())
	}
	if err := verifyContainerSecurityScannerProvenance(ctx, client, pin); err != nil {
		return ContainerSecurityOutput{}, errors.Join(err, runtime.cleanup())
	}
	startedAt := time.Now().UTC()
	database, err := runtime.updateDatabase(ctx)
	if err != nil {
		return ContainerSecurityOutput{}, errors.Join(err, runtime.cleanup())
	}
	images, err := prepareContainerSecurityImages(ctx, normalized, client)
	if err != nil {
		return ContainerSecurityOutput{}, errors.Join(err, runtime.cleanup())
	}
	targets := containerSecurityTargets(images, pin, toolchain)
	scans, scanErr := scanContainerSecurityTargets(ctx, runtime, targets)
	postScanDatabase, databaseErr := inspectContainerSecurityDatabase(
		runtime.cache,
		pin.Database,
		time.Now().UTC(),
		false,
	)
	if databaseErr == nil && postScanDatabase != database {
		databaseErr = errors.New("Trivy vulnerability database changed during offline image scans")
	}
	cleanupErr := cleanupContainerSecurityResources(images, runtime)
	if err := errors.Join(scanErr, databaseErr, cleanupErr); err != nil {
		return ContainerSecurityOutput{}, err
	}
	report, raw := buildContainerSecurityReport(
		repository.Commit,
		startedAt,
		time.Now().UTC(),
		pin,
		database,
		scans,
	)
	artifacts, err := writeContainerSecurityArtifacts(
		normalized.recordingsRoot,
		containerSecurityArtifactSet{report: report, raw: raw},
	)
	if err != nil {
		return ContainerSecurityOutput{}, err
	}
	return ContainerSecurityOutput{Report: report, Artifacts: artifacts}, nil
}

func normalizeContainerSecurityRun(
	ctx context.Context,
	config ContainerSecurityConfig,
) (normalizedContainerSecurityConfig, Phase0RepoEvidence, error) {
	repoRoot, err := resolvePhase1RepoRoot(config.RepoRoot)
	if err != nil {
		return normalizedContainerSecurityConfig{}, Phase0RepoEvidence{}, err
	}
	if err := requireCommittedPhase0Pass(ctx, repoRoot); err != nil {
		return normalizedContainerSecurityConfig{}, Phase0RepoEvidence{}, err
	}
	repository, err := inspectPhase0Repository(ctx, repoRoot)
	if err != nil {
		return normalizedContainerSecurityConfig{}, Phase0RepoEvidence{}, err
	}
	phase0Evidence, err := readCommittedPhase0PassEvidence(ctx, repoRoot)
	if err != nil {
		return normalizedContainerSecurityConfig{}, Phase0RepoEvidence{}, err
	}
	bundle, err := normalizeEvaluationBundle(config.CodexLinuxBundle)
	if err != nil {
		return normalizedContainerSecurityConfig{}, Phase0RepoEvidence{}, err
	}
	recordingsRoot := strings.TrimSpace(config.RecordingsRoot)
	if recordingsRoot == "" {
		recordingsRoot = filepath.Join(repoRoot, ".recordings", "setta-container-security")
	}
	recordingsRoot, err = cleanAbsolutePhase1Path("container security recordings root", recordingsRoot)
	if err != nil {
		return normalizedContainerSecurityConfig{}, Phase0RepoEvidence{}, err
	}
	return normalizedContainerSecurityConfig{
		repoRoot:         repoRoot,
		recordingsRoot:   recordingsRoot,
		codexLinuxBundle: bundle,
		dockerCommand:    evaluationCommand(config.DockerCommand, "docker"),
		codexCommand:     evaluationCommand(config.CodexCommand, "codex"),
		pnpmCommand:      evaluationCommand(config.PNPMCommand, "pnpm"),
		phase0Codex:      phase0Evidence.Codex,
	}, repository, nil
}

func prepareContainerSecurityImages(
	ctx context.Context,
	config normalizedContainerSecurityConfig,
	client phase0DockerClient,
) (*containerSecurityImages, error) {
	suffix, err := phase0RandomHex(6)
	if err != nil {
		return nil, err
	}
	images := &containerSecurityImages{
		phase0: newPhase0DockerResources(client, suffix),
	}
	phase0Build, err := preparePhase0BuildContext(ctx, phase0ProbeConfig{
		repoRoot:         config.repoRoot,
		codexLinuxBundle: config.codexLinuxBundle,
		dockerCommand:    config.dockerCommand,
		codexCommand:     config.codexCommand,
	})
	if err != nil {
		return nil, err
	}
	images.phase0BuildContext = phase0Build.contextDir
	images.phase0ID, err = images.phase0.buildImage(ctx, phase0Build)
	if err != nil {
		return nil, errors.Join(err, images.cleanup())
	}
	if err := images.removeBuildContext(); err != nil {
		return nil, errors.Join(err, images.cleanup())
	}
	images.phase1, err = preparePhase1Images(ctx, client, suffix, phase1ImageConfig{
		repoRoot:         config.repoRoot,
		codexLinuxBundle: config.codexLinuxBundle,
		codexCommand:     config.codexCommand,
		pnpmCommand:      config.pnpmCommand,
		phase0Codex:      config.phase0Codex,
	})
	if err != nil {
		return nil, errors.Join(err, images.cleanup())
	}
	return images, nil
}

func containerSecurityTargets(
	images *containerSecurityImages,
	pin containerSecurityPolicyPin,
	toolchain phase1ToolchainPin,
) []containerSecurityImageTarget {
	return []containerSecurityImageTarget{
		{name: "agent", reference: images.phase1.agentTag, imageID: images.phase1.agentID},
		{name: "backend", reference: images.phase1.backendTag, imageID: images.phase1.backendID},
		{name: "phase0", reference: images.phase0.imageTag, imageID: images.phase0ID},
		{name: "scanner", reference: pin.Scanner.Image, imageID: pin.Scanner.ImageID},
		{name: "toolchain", reference: toolchain.BaseImage, imageID: toolchain.BaseImageID},
		{name: "verifier", reference: images.phase1.verifierTag, imageID: images.phase1.verifierID},
	}
}

func scanContainerSecurityTargets(
	ctx context.Context,
	runtime *containerSecurityRuntime,
	targets []containerSecurityImageTarget,
) ([]containerSecurityImageScan, error) {
	scans := make([]containerSecurityImageScan, 0, len(targets))
	for _, target := range targets {
		scan, err := runtime.scanImage(ctx, target)
		if err != nil {
			return nil, err
		}
		scans = append(scans, scan)
	}
	return scans, nil
}

func cleanupContainerSecurityResources(
	images *containerSecurityImages,
	runtime *containerSecurityRuntime,
) error {
	return errors.Join(images.cleanup(), runtime.cleanup())
}

func (images *containerSecurityImages) removeBuildContext() error {
	if images == nil || images.phase0BuildContext == "" {
		return nil
	}
	root := images.phase0BuildContext
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("remove container security Phase 0 build context: %w", err)
	}
	if _, err := os.Stat(root); !errors.Is(err, os.ErrNotExist) {
		return errors.New("container security Phase 0 build context remains after cleanup")
	}
	images.phase0BuildContext = ""
	return nil
}

func (images *containerSecurityImages) cleanup() error {
	if images == nil {
		return nil
	}
	var cleanupErrors []error
	if images.phase1 != nil {
		cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
		cleanupErrors = append(cleanupErrors, images.phase1.cleanup(cleanupContext))
		cancel()
		images.phase1 = nil
	}
	if images.phase0 != nil {
		_, err := images.phase0.cleanup()
		cleanupErrors = append(cleanupErrors, err)
		images.phase0 = nil
	}
	cleanupErrors = append(cleanupErrors, images.removeBuildContext())
	return errors.Join(cleanupErrors...)
}

func buildContainerSecurityReport(
	commit string,
	startedAt time.Time,
	finishedAt time.Time,
	pin containerSecurityPolicyPin,
	database ContainerSecurityDatabaseEvidence,
	scans []containerSecurityImageScan,
) (ContainerSecurityReport, map[string][]byte) {
	images := make([]ContainerSecurityImageResult, 0, len(scans))
	findings := make([]ContainerSecurityFinding, 0)
	raw := make(map[string][]byte, len(scans)*2)
	for _, scan := range scans {
		images = append(images, scan.result)
		findings = append(findings, scan.findings...)
		for name, content := range scan.raw {
			raw[name] = append([]byte{}, content...)
		}
	}
	slices.SortFunc(images, func(left ContainerSecurityImageResult, right ContainerSecurityImageResult) int {
		return strings.Compare(left.Name, right.Name)
	})
	sortContainerSecurityFindings(findings)
	status := containerSecurityStatusPass
	if len(findings) > 0 {
		status = containerSecurityStatusFail
	}
	return ContainerSecurityReport{
		SchemaVersion: containerSecurityReportSchemaVersion,
		Status:        status,
		SettaCommit:   commit,
		StartedAt:     startedAt,
		FinishedAt:    finishedAt,
		Scanner: ContainerSecurityScannerEvidence{
			Name:                          pin.Scanner.Name,
			Version:                       pin.Scanner.Version,
			Image:                         pin.Scanner.Image,
			ImageID:                       pin.Scanner.ImageID,
			Platform:                      pin.Platform,
			PlatformManifestDigest:        pin.Scanner.PlatformManifestDigest,
			AttestationManifestDigest:     pin.Scanner.AttestationManifestDigest,
			SBOMAttestationDigest:         pin.Scanner.SBOMAttestationDigest,
			ProvenanceAttestationDigest:   pin.Scanner.ProvenanceAttestationDigest,
			ReleasePublishedAt:            pin.Scanner.Release.PublishedAt,
			ReleaseURL:                    pin.Scanner.Release.URL,
			ReleaseSBOMURL:                pin.Scanner.Release.SBOMURL,
			ReleaseSBOMSHA256:             pin.Scanner.Release.SBOMSHA256,
			ChecksumsSigstoreBundleURL:    pin.Scanner.Release.ChecksumsSigstoreBundleURL,
			ChecksumsSigstoreBundleSHA256: pin.Scanner.Release.ChecksumsSigstoreBundleSHA256,
		},
		Database: database,
		Images:   images,
		Findings: findings,
	}, raw
}
