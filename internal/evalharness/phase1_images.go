package evalharness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	phase1ImagePlatform             = "linux/arm64"
	phase1ContainerUID              = 65532
	phase1ContainerGID              = 65532
	phase1ToolchainProbeMemoryBytes = 512 * 1024 * 1024
	phase1ToolchainProbePIDs        = 64
)

type phase1ImageConfig struct {
	repoRoot         string
	codexLinuxBundle string
	codexCommand     string
	toolchainImageID string
}

type phase1Images struct {
	client                  phase0DockerClient
	suffix                  string
	toolchainTag            string
	agentTag                string
	backendTag              string
	verifierTag             string
	agentID                 string
	backendID               string
	verifierID              string
	toolchainProbeContainer string

	toolchainTagged       bool
	agentBuilt            bool
	backendBuilt          bool
	verifierBuilt         bool
	toolchainProbeCreated bool
}

type phase1BuildContexts struct {
	root     string
	agent    string
	backend  string
	verifier string
	node     string
	pnpm     string
}

type phase1FixturePackage struct {
	PackageManager string `json:"packageManager"`
	Engines        struct {
		Node string `json:"node"`
		PNPM string `json:"pnpm"`
	} `json:"engines"`
}

type phase1ToolchainEvidence struct {
	Node string `json:"node"`
	PNPM string `json:"pnpm"`
	Git  string `json:"git"`
}

func preparePhase1Images(
	ctx context.Context,
	client phase0DockerClient,
	suffix string,
	config phase1ImageConfig,
) (*phase1Images, error) {
	if !validPhase1ImageID(config.toolchainImageID) {
		return nil, errors.New("Phase 1 toolchain image must be an exact local sha256 image id")
	}
	if err := inspectPhase1Image(ctx, client, config.toolchainImageID); err != nil {
		return nil, fmt.Errorf("inspect Phase 1 toolchain image: %w", err)
	}
	images := newPhase1Images(client, suffix)
	contexts, err := preparePhase1BuildContexts(ctx, config)
	if err != nil {
		return nil, err
	}
	if err := images.build(ctx, config.toolchainImageID, contexts); err != nil {
		return nil, errors.Join(err, cleanupPhase1ImagePreparation(images, contexts.root))
	}
	if err := removePhase1BuildContexts(contexts.root); err != nil {
		return nil, errors.Join(err, cleanupPhase1ImagePreparation(images, ""))
	}
	return images, nil
}

func cleanupPhase1ImagePreparation(images *phase1Images, buildRoot string) error {
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	defer cancel()
	return errors.Join(images.cleanup(cleanupContext), removePhase1BuildContexts(buildRoot))
}

func removePhase1BuildContexts(root string) error {
	if root == "" {
		return nil
	}
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("remove Phase 1 build contexts: %w", err)
	}
	if _, err := os.Stat(root); !errors.Is(err, os.ErrNotExist) {
		return errors.New("Phase 1 build contexts remain after cleanup")
	}
	return nil
}

func newPhase1Images(client phase0DockerClient, suffix string) *phase1Images {
	base := "setta-eval-phase1-" + suffix
	return &phase1Images{
		client:                  client,
		suffix:                  suffix,
		toolchainTag:            base + ":toolchain",
		agentTag:                base + ":agent",
		backendTag:              base + ":backend",
		verifierTag:             base + ":verifier",
		toolchainProbeContainer: base + "-toolchain-probe",
	}
}

func (images *phase1Images) build(
	ctx context.Context,
	toolchainImageID string,
	contexts phase1BuildContexts,
) error {
	if _, err := images.client.run(ctx, "image", "tag", toolchainImageID, images.toolchainTag); err != nil {
		return fmt.Errorf("tag exact Phase 1 toolchain image: %w", err)
	}
	images.toolchainTagged = true
	builds := []struct {
		label   string
		tag     string
		context string
		base    bool
		built   *bool
		id      *string
	}{
		{label: "agent", tag: images.agentTag, context: contexts.agent, base: true, built: &images.agentBuilt, id: &images.agentID},
		{label: "backend", tag: images.backendTag, context: contexts.backend, built: &images.backendBuilt, id: &images.backendID},
		{label: "verifier", tag: images.verifierTag, context: contexts.verifier, base: true, built: &images.verifierBuilt, id: &images.verifierID},
	}
	for _, build := range builds {
		args := []string{
			"build",
			"--network", "none",
			"--platform", phase1ImagePlatform,
			"--pull=false",
			"--label", "com.setta.eval.phase=1",
			"--label", "com.setta.eval.role=" + build.label,
			"--label", "com.setta.eval.run=" + images.suffix,
			"--tag", build.tag,
		}
		if build.base {
			args = append(args, "--build-arg", "TOOLCHAIN_IMAGE="+images.toolchainTag)
		}
		args = append(args, build.context)
		if _, err := images.client.run(ctx, args...); err != nil {
			return fmt.Errorf("build Phase 1 %s image: %w", build.label, err)
		}
		*build.built = true
		imageID, err := inspectPhase1TaggedImage(ctx, images.client, build.tag)
		if err != nil {
			return fmt.Errorf("inspect Phase 1 %s image: %w", build.label, err)
		}
		*build.id = imageID
	}
	if err := images.validateToolchain(ctx, contexts.node, contexts.pnpm); err != nil {
		return err
	}
	return nil
}

func (images *phase1Images) validateToolchain(
	ctx context.Context,
	wantNode string,
	wantPNPM string,
) error {
	if _, err := images.client.run(
		ctx,
		"container", "create",
		"--name", images.toolchainProbeContainer,
		"--pull", "never",
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--read-only",
		"--tmpfs", phase1Tmpfs(),
		"--user", fmt.Sprintf("%d:%d", phase1ContainerUID, phase1ContainerGID),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(phase1ToolchainProbePIDs),
		"--memory", strconv.FormatInt(phase1ToolchainProbeMemoryBytes, 10),
		"--cpus", "1",
		"--label", "com.setta.eval.phase=1",
		"--label", "com.setta.eval.role=toolchain-probe",
		"--label", "com.setta.eval.run="+images.suffix,
		"--entrypoint", "/usr/local/bin/setta-eval-sandbox-helper",
		images.agentID,
		"phase1-toolchain",
	); err != nil {
		return fmt.Errorf("create Phase 1 toolchain probe container: %w", err)
	}
	images.toolchainProbeCreated = true
	result, runErr := images.client.run(
		ctx,
		"container", "start", "--attach", images.toolchainProbeContainer,
	)
	removeErr := images.removeToolchainProbe(ctx)
	if err := phase1ToolchainProbeError(runErr, removeErr); err != nil {
		return err
	}
	return validatePhase1ToolchainEvidence(result.stdout, wantNode, wantPNPM)
}

func phase1ToolchainProbeError(runErr error, removeErr error) error {
	var probeErrors []error
	if runErr != nil {
		probeErrors = append(probeErrors, fmt.Errorf("inspect Phase 1 toolchain commands: %w", runErr))
	}
	if removeErr != nil {
		probeErrors = append(probeErrors, removeErr)
	}
	return errors.Join(probeErrors...)
}

func validatePhase1ToolchainEvidence(value string, wantNode string, wantPNPM string) error {
	var evidence phase1ToolchainEvidence
	if err := json.Unmarshal([]byte(value), &evidence); err != nil {
		return fmt.Errorf("decode Phase 1 toolchain evidence: %w", err)
	}
	if evidence.Node != wantNode || evidence.PNPM != wantPNPM || strings.TrimSpace(evidence.Git) == "" {
		return fmt.Errorf(
			"Phase 1 toolchain resolved node/pnpm/git %q/%q/%q, want %q/%q/non-empty",
			evidence.Node,
			evidence.PNPM,
			evidence.Git,
			wantNode,
			wantPNPM,
		)
	}
	return nil
}

func (images *phase1Images) removeToolchainProbe(ctx context.Context) error {
	if images == nil || !images.toolchainProbeCreated {
		return nil
	}
	if _, err := images.client.run(
		ctx,
		"container", "rm", "--force", images.toolchainProbeContainer,
	); err != nil {
		return fmt.Errorf("remove Phase 1 toolchain probe container: %w", err)
	}
	images.toolchainProbeCreated = false
	return nil
}

func (images *phase1Images) cleanup(ctx context.Context) error {
	if images == nil {
		return nil
	}
	var cleanupErrors []error
	if err := images.removeToolchainProbe(ctx); err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	for _, image := range []struct {
		tag     string
		created *bool
	}{
		{tag: images.verifierTag, created: &images.verifierBuilt},
		{tag: images.backendTag, created: &images.backendBuilt},
		{tag: images.agentTag, created: &images.agentBuilt},
		{tag: images.toolchainTag, created: &images.toolchainTagged},
	} {
		if !*image.created {
			continue
		}
		if _, err := images.client.run(ctx, "image", "rm", image.tag); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 1 image tag %s: %w", image.tag, err))
			continue
		}
		*image.created = false
	}
	return errors.Join(cleanupErrors...)
}

func preparePhase1BuildContexts(
	ctx context.Context,
	config phase1ImageConfig,
) (phase1BuildContexts, error) {
	fixturePackage, err := readPhase1FixturePackage(config.repoRoot)
	if err != nil {
		return phase1BuildContexts{}, err
	}
	if err := validatePhase1CodexBundle(ctx, config); err != nil {
		return phase1BuildContexts{}, err
	}
	root, err := os.MkdirTemp("", "setta-eval-phase1-build-")
	if err != nil {
		return phase1BuildContexts{}, fmt.Errorf("create Phase 1 build contexts: %w", err)
	}
	contexts := phase1BuildContexts{
		root:     root,
		agent:    filepath.Join(root, "agent"),
		backend:  filepath.Join(root, "backend"),
		verifier: filepath.Join(root, "verifier"),
		node:     fixturePackage.Engines.Node,
		pnpm:     fixturePackage.Engines.PNPM,
	}
	for _, directory := range []string{contexts.agent, contexts.backend, contexts.verifier} {
		if err := os.Mkdir(directory, 0o700); err != nil {
			return phase1BuildContexts{}, errors.Join(
				fmt.Errorf("create Phase 1 image context: %w", err),
				removePhase1BuildContexts(root),
			)
		}
	}
	if err := populatePhase1BuildContexts(ctx, config, contexts); err != nil {
		return phase1BuildContexts{}, errors.Join(err, removePhase1BuildContexts(root))
	}
	return contexts, nil
}

func populatePhase1BuildContexts(
	ctx context.Context,
	config phase1ImageConfig,
	contexts phase1BuildContexts,
) error {
	manifest, err := readPhase0BundleManifest(config.codexLinuxBundle)
	if err != nil {
		return err
	}
	copies := []struct {
		source      string
		destination string
	}{
		{source: filepath.Join(config.repoRoot, "evals", "sandbox", "phase1-agent.Dockerfile"), destination: filepath.Join(contexts.agent, "Dockerfile")},
		{source: filepath.Join(config.repoRoot, "evals", "sandbox", "phase1-backend.Dockerfile"), destination: filepath.Join(contexts.backend, "Dockerfile")},
		{source: filepath.Join(config.repoRoot, "evals", "sandbox", "phase1-verifier.Dockerfile"), destination: filepath.Join(contexts.verifier, "Dockerfile")},
		{source: filepath.Join(config.codexLinuxBundle, manifest.Entrypoint), destination: filepath.Join(contexts.agent, "codex")},
		{source: filepath.Join(config.codexLinuxBundle, manifest.PathDir, "rg"), destination: filepath.Join(contexts.agent, "rg")},
		{source: filepath.Join(config.codexLinuxBundle, manifest.ResourcesDir, "zsh", "bin", "zsh"), destination: filepath.Join(contexts.agent, "zsh")},
	}
	for _, copy := range copies {
		if _, err := copyAndHashPhase0File(copy.source, copy.destination); err != nil {
			return fmt.Errorf("prepare Phase 1 image input %s: %w", filepath.Base(copy.destination), err)
		}
	}
	builds := []struct {
		output      string
		packagePath string
	}{
		{output: filepath.Join(contexts.agent, "sandbox-helper"), packagePath: "./cmd/setta-eval-sandbox-helper"},
		{output: filepath.Join(contexts.verifier, "sandbox-helper"), packagePath: "./cmd/setta-eval-sandbox-helper"},
		{output: filepath.Join(contexts.backend, "setta-backend"), packagePath: "./cmd/setta-backend"},
		{output: filepath.Join(contexts.backend, "setta-eval-provider-bridge"), packagePath: "./cmd/setta-eval-provider-bridge"},
		{output: filepath.Join(contexts.verifier, "verifier"), packagePath: "./evals/verifiers/straightforward-task"},
	}
	for _, build := range builds {
		if err := buildPhase1LinuxBinary(ctx, config.repoRoot, build.output, build.packagePath); err != nil {
			return err
		}
	}
	return nil
}

func buildPhase1LinuxBinary(
	ctx context.Context,
	repoRoot string,
	output string,
	packagePath string,
) error {
	environment := append(
		append([]string{}, os.Environ()...),
		"CGO_ENABLED=0",
		"GOARCH=arm64",
		"GOOS=linux",
	)
	if _, err := runPhase0Command(
		ctx,
		repoRoot,
		environment,
		filepath.Join(repoRoot, "scripts", "go.sh"),
		"build",
		"-trimpath",
		"-o",
		output,
		packagePath,
	); err != nil {
		return fmt.Errorf("build Phase 1 image binary %s: %w", packagePath, err)
	}
	return nil
}

func validatePhase1CodexBundle(ctx context.Context, config phase1ImageConfig) error {
	manifest, err := readPhase0BundleManifest(config.codexLinuxBundle)
	if err != nil {
		return err
	}
	if err := validatePhase0BundleManifest(manifest); err != nil {
		return err
	}
	hostVersion, err := readPhase0HostCodexVersion(ctx, phase0ProbeConfig{
		repoRoot:     config.repoRoot,
		codexCommand: config.codexCommand,
	})
	if err != nil {
		return err
	}
	if hostVersion != manifest.Version {
		return fmt.Errorf("host Codex %s does not match Linux bundle %s", hostVersion, manifest.Version)
	}
	return nil
}

func readPhase1FixturePackage(repoRoot string) (phase1FixturePackage, error) {
	path := filepath.Join(repoRoot, "evals", "fixtures", "typescript-service", "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return phase1FixturePackage{}, fmt.Errorf("read Phase 1 fixture package: %w", err)
	}
	var fixturePackage phase1FixturePackage
	if err := json.Unmarshal(data, &fixturePackage); err != nil {
		return phase1FixturePackage{}, fmt.Errorf("decode Phase 1 fixture package: %w", err)
	}
	if strings.TrimSpace(fixturePackage.Engines.Node) == "" ||
		strings.TrimSpace(fixturePackage.Engines.PNPM) == "" ||
		fixturePackage.PackageManager != "pnpm@"+fixturePackage.Engines.PNPM {
		return phase1FixturePackage{}, errors.New("Phase 1 fixture package has inconsistent Node or pnpm pins")
	}
	return fixturePackage, nil
}

func inspectPhase1TaggedImage(
	ctx context.Context,
	client phase0DockerClient,
	tag string,
) (string, error) {
	result, err := client.run(ctx, "image", "inspect", tag)
	if err != nil {
		return "", err
	}
	var images []phase0DockerImage
	if err := json.Unmarshal([]byte(result.stdout), &images); err != nil {
		return "", err
	}
	if len(images) != 1 || !validPhase1ImageID(images[0].ID) {
		return "", fmt.Errorf("image inspection returned %d invalid entries", len(images))
	}
	if images[0].OS != "linux" || !phase0ARM64(images[0].Architecture) {
		return "", fmt.Errorf("image is %s/%s, want linux/arm64", images[0].OS, images[0].Architecture)
	}
	return images[0].ID, nil
}

func inspectPhase1Image(
	ctx context.Context,
	client phase0DockerClient,
	imageID string,
) error {
	actual, err := inspectPhase1TaggedImage(ctx, client, imageID)
	if err != nil {
		return err
	}
	if actual != imageID {
		return fmt.Errorf("image resolved to %s, want exact id %s", actual, imageID)
	}
	return nil
}

func validPhase1ImageID(value string) bool {
	if !strings.HasPrefix(value, "sha256:") || len(value) != len("sha256:")+64 {
		return false
	}
	for _, character := range strings.TrimPrefix(value, "sha256:") {
		if character >= '0' && character <= '9' || character >= 'a' && character <= 'f' {
			continue
		}
		return false
	}
	return true
}
