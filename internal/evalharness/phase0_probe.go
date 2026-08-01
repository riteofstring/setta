package evalharness

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type phase0Preparation struct {
	repository Phase0RepoEvidence
	docker     Phase0DockerEvidence
	build      phase0PreparedBuild
}

const phase0CleanupTimeout = 30 * time.Second

type phase0Execution struct {
	config               phase0ProbeConfig
	preparation          phase0Preparation
	resources            *phase0DockerResources
	canaryDir            string
	canaryPath           string
	codexRuntime         *phase0CodexRuntime
	hostAppServerStopped bool
}

// RunPhase0SandboxProbe proves the supported Codex remote-execution boundary.
// It returns PASS evidence only after the model turns and teardown both succeed.
func RunPhase0SandboxProbe(
	ctx context.Context,
	config Phase0SandboxProbeConfig,
) (Phase0SandboxEvidence, error) {
	normalized, err := normalizePhase0Config(config)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	suffix, err := phase0RandomHex(6)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	preparation, err := preparePhase0Execution(ctx, normalized)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	execution := &phase0Execution{
		config:      normalized,
		preparation: preparation,
		resources: newPhase0DockerResources(
			phase0DockerClient{command: normalized.dockerCommand, repoRoot: normalized.repoRoot},
			suffix,
		),
	}
	evidence, runErr := execution.run(ctx)
	teardown, cleanupErr := execution.cleanup()
	if runErr != nil {
		return Phase0SandboxEvidence{}, errors.Join(runErr, cleanupErr)
	}
	if cleanupErr != nil {
		return Phase0SandboxEvidence{}, cleanupErr
	}
	evidence.Teardown = teardown
	if err := ValidatePhase0SandboxEvidence(evidence); err != nil {
		return Phase0SandboxEvidence{}, fmt.Errorf("validate Phase 0 PASS evidence: %w", err)
	}
	return evidence, nil
}

func preparePhase0Execution(
	ctx context.Context,
	config phase0ProbeConfig,
) (phase0Preparation, error) {
	repository, err := inspectPhase0Repository(ctx, config.repoRoot)
	if err != nil {
		return phase0Preparation{}, err
	}
	dockerClient := phase0DockerClient{command: config.dockerCommand, repoRoot: config.repoRoot}
	dockerEvidence, err := inspectPhase0Docker(ctx, dockerClient)
	if err != nil {
		return phase0Preparation{}, err
	}
	build, err := preparePhase0BuildContext(ctx, config)
	if err != nil {
		return phase0Preparation{}, err
	}
	return phase0Preparation{
		repository: repository,
		docker:     dockerEvidence,
		build:      build,
	}, nil
}

func (execution *phase0Execution) run(ctx context.Context) (Phase0SandboxEvidence, error) {
	imageID, boundary, err := execution.probeBoundary(ctx)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	turns, err := execution.probeCodex(
		ctx,
		execution.resources.controlRelay.endpointValue().URL,
	)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	return Phase0SandboxEvidence{
		SchemaVersion: phase0SchemaVersion,
		Outcome:       phase0OutcomePass,
		ProbedAt:      time.Now().UTC(),
		Topology:      phase0TopologyEvidence(),
		Repository:    execution.preparation.repository,
		Docker:        execution.preparation.docker,
		Codex: Phase0CodexEvidence{
			HostVersion:     execution.preparation.build.hostVersion,
			BundleVersion:   execution.preparation.build.manifest.Version,
			BundleTarget:    execution.preparation.build.manifest.Target,
			Model:           execution.config.model,
			ReasoningEffort: execution.config.reasoningEffort,
			FileSHA256:      execution.preparation.build.fileSHA256,
			ImageID:         imageID,
		},
		Boundary: boundary,
		Turns:    turns,
	}, nil
}

func (execution *phase0Execution) probeBoundary(
	ctx context.Context,
) (string, Phase0BoundaryEvidence, error) {
	imageID, err := execution.resources.buildImage(ctx, execution.preparation.build)
	if err != nil {
		return "", Phase0BoundaryEvidence{}, err
	}
	boundary, err := execution.resources.start(ctx)
	if err != nil {
		return "", Phase0BoundaryEvidence{}, err
	}
	execution.canaryDir, execution.canaryPath, err = createPhase0HostCanary()
	if err != nil {
		return "", Phase0BoundaryEvidence{}, err
	}
	fakeListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", Phase0BoundaryEvidence{}, fmt.Errorf("start Phase 0 fake host endpoint: %w", err)
	}
	defer fakeListener.Close()
	_, fakePort, err := net.SplitHostPort(fakeListener.Addr().String())
	if err != nil {
		return "", Phase0BoundaryEvidence{}, fmt.Errorf("parse Phase 0 fake host endpoint: %w", err)
	}
	helper, err := execution.resources.runBoundaryHelper(ctx, execution.canaryPath, fakePort)
	if err != nil {
		return "", Phase0BoundaryEvidence{}, err
	}
	boundary.WorkspaceVolumeWritable = helper.WorkspaceWrite
	boundary.RootWriteDenied = helper.RootWriteDenied
	boundary.HostCanaryVisible = helper.HostCanaryVisible
	boundary.FakeHostEndpointBlocked = helper.FakeEndpointBlocked
	boundary.BoundaryHelperEnvironmentNames = sortedUnique(helper.Environment.EnvironmentNames)
	boundary.ShellEnvironmentPolicyInherit = phase0ShellEnvironmentInherit
	boundary.ShellEnvironmentPolicySetNames = phase0ShellEnvironmentSetNames()
	return imageID, boundary, nil
}

func (execution *phase0Execution) probeCodex(
	ctx context.Context,
	execServerURL string,
) (Phase0TurnEvidence, error) {
	execution.codexRuntime = newPhase0CodexRuntime(execution.config, execServerURL)
	if err := execution.codexRuntime.verifyChatGPTAuthAndModel(ctx); err != nil {
		return Phase0TurnEvidence{}, err
	}
	if err := execution.codexRuntime.waitForRemoteEnvironment(ctx); err != nil {
		return Phase0TurnEvidence{}, err
	}
	turns, err := execution.codexRuntime.runModelTurns(ctx, execution.resources)
	if err != nil {
		return Phase0TurnEvidence{}, err
	}
	if relayErr := execution.resources.controlRelay.beginHealthyShutdown(); relayErr != nil {
		return Phase0TurnEvidence{}, fmt.Errorf("Phase 0 Agent control relay failed: %w", relayErr)
	}
	if err := runPhase0Cleanup(execution.codexRuntime.shutdown); err != nil {
		return Phase0TurnEvidence{}, fmt.Errorf("stop Phase 0 host app-server: %w", err)
	}
	execution.codexRuntime = nil
	execution.hostAppServerStopped = true
	return turns, nil
}

func (execution *phase0Execution) cleanup() (Phase0TeardownEvidence, error) {
	var cleanupErrors []error
	if execution.codexRuntime != nil {
		if execution.resources.controlRelay != nil {
			execution.resources.controlRelay.beginShutdown()
		}
		if err := runPhase0Cleanup(execution.codexRuntime.shutdown); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("stop Phase 0 host app-server: %w", err))
		} else {
			execution.hostAppServerStopped = true
		}
		execution.codexRuntime = nil
	}
	teardown, err := execution.resources.cleanup()
	if err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	if err := execution.removeTemporaryFiles(); err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	teardown.HostAppServerStopped = execution.hostAppServerStopped
	teardown.HostCanaryRemoved = execution.canaryPath != "" && phase0PathAbsent(execution.canaryPath)
	return teardown, errors.Join(cleanupErrors...)
}

func runPhase0Cleanup(operation func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), phase0CleanupTimeout)
	defer cancel()
	return operation(ctx)
}

func (execution *phase0Execution) removeTemporaryFiles() error {
	var cleanupErrors []error
	if execution.canaryDir != "" {
		if err := os.RemoveAll(execution.canaryDir); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 0 host canary: %w", err))
		}
	}
	if execution.preparation.build.contextDir != "" {
		if err := os.RemoveAll(execution.preparation.build.contextDir); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 0 build context: %w", err))
		}
	}
	return errors.Join(cleanupErrors...)
}

func phase0TopologyEvidence() Phase0TopologyEvidence {
	return Phase0TopologyEvidence{
		Name:               "host-app-server/container-exec-server",
		HostOwnership:      "Setta probe, authenticated Codex app-server, model network, and evidence",
		ContainerOwnership: "Codex exec-server, AI-controlled filesystem and process tools, and disposable workspace",
		AuthenticationBoundary: "ChatGPT authentication remains in the host app-server; " +
			"no credential is mounted, forwarded, or copied into the container",
		ControlPath: "capability-authenticated host-loopback WebSocket relay to Docker-managed " +
			"stdin/stdout for the container exec-server stdio transport; no Agent port is published",
	}
}

func inspectPhase0Repository(ctx context.Context, repoRoot string) (Phase0RepoEvidence, error) {
	commitResult, err := runPhase0Command(ctx, repoRoot, nil, "git", "rev-parse", "HEAD")
	if err != nil {
		return Phase0RepoEvidence{}, fmt.Errorf("read Phase 0 repository commit: %w", err)
	}
	commit := strings.TrimSpace(commitResult.stdout)
	if len(commit) != 40 {
		return Phase0RepoEvidence{}, fmt.Errorf("Phase 0 repository returned invalid commit %q", commit)
	}
	statusResult, err := runPhase0Command(
		ctx,
		repoRoot,
		nil,
		"git",
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	)
	if err != nil {
		return Phase0RepoEvidence{}, fmt.Errorf("inspect Phase 0 repository state: %w", err)
	}
	if strings.TrimSpace(statusResult.stdout) != "" {
		return Phase0RepoEvidence{}, errors.New("Phase 0 probe requires a clean committed worktree")
	}
	return Phase0RepoEvidence{Commit: commit, Clean: true}, nil
}

func createPhase0HostCanary() (string, string, error) {
	directory, err := os.MkdirTemp("", "setta-eval-phase0-host-canary-")
	if err != nil {
		return "", "", fmt.Errorf("create Phase 0 host canary directory: %w", err)
	}
	value, err := phase0RandomHex(32)
	if err != nil {
		_ = os.RemoveAll(directory)
		return "", "", err
	}
	path := filepath.Join(directory, "host-only-canary")
	if err := os.WriteFile(path, []byte(value+"\n"), 0o600); err != nil {
		_ = os.RemoveAll(directory)
		return "", "", fmt.Errorf("write Phase 0 host canary: %w", err)
	}
	return directory, path, nil
}

func phase0RandomHex(bytes int) (string, error) {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("create Phase 0 random identifier: %w", err)
	}
	return hex.EncodeToString(value), nil
}

func phase0PathAbsent(path string) bool {
	_, err := os.Stat(path)
	return errors.Is(err, os.ErrNotExist)
}
