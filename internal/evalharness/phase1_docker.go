package evalharness

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"setta/internal/agent"
	"setta/internal/evalharness/providerbridge"
	"setta/internal/evalharness/tokenusage"
	"setta/internal/evalharness/toolpolicy"
	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/evalharness/volumecopy"
	"setta/internal/httpapi"
	"setta/internal/jsonio"
	settaruntime "setta/internal/runtime"
)

const (
	phase1WorkspaceRoot         = "/workspace"
	phase1BaselineRoot          = "/baseline"
	phase1VerificationRoot      = "/verification"
	phase1AppDataRoot           = "/app-data"
	phase1TokenUsagePath        = phase1AppDataRoot + "/eval-token-usage.jsonl"
	phase1BackendPort           = "4310"
	phase1ContainerTmpfsBytes   = 128 * 1024 * 1024
	phase1WorkspaceDiskBytes    = 64 * 1024 * 1024
	phase1VerificationDiskBytes = 64 * 1024 * 1024
	phase1AgentMemoryBytes      = 4 * 1024 * 1024 * 1024
	phase1BackendMemoryBytes    = 2 * 1024 * 1024 * 1024
	phase1VerifierMemoryBytes   = 2 * 1024 * 1024 * 1024
	phase1VolumeHolderMemory    = 32 * 1024 * 1024
	phase1AgentPIDs             = 256
	phase1BackendPIDs           = 256
	phase1VerifierPIDs          = 256
	phase1VolumeHolderPIDs      = 16
	phase1BackendReadyTimeout   = 30 * time.Second
	phase1BackendLogLineBytes   = 64 * 1024
	phase1ContainerStopTime     = 15
)

type phase1DockerResources struct {
	client       phase0DockerClient
	suffix       string
	images       *phase1Images
	fixture      phase1FixturePreparation
	provider     *phase1ProviderBroker
	controlRelay *execServerControlRelay

	agentNetwork       string
	controllerNetwork  string
	appDataVolume      string
	baselineVolume     string
	verificationVolume string
	workspaceVolume    string
	volumeHolder       string
	verificationHolder string
	agentContainer     string
	backendContainer   string
	copyContainer      string
	tokenContainer     string
	verifierContainer  string

	networks          map[string]bool
	volumes           map[string]bool
	containers        map[string]bool
	controllerStopped bool
}

func newPhase1DockerResources(
	client phase0DockerClient,
	suffix string,
	images *phase1Images,
	fixture phase1FixturePreparation,
) *phase1DockerResources {
	base := "setta-eval-phase1-" + suffix
	return &phase1DockerResources{
		client:             client,
		suffix:             suffix,
		images:             images,
		fixture:            fixture,
		agentNetwork:       base + "-agent-network",
		controllerNetwork:  base + "-controller-network",
		appDataVolume:      base + "-app-data",
		baselineVolume:     base + "-baseline",
		verificationVolume: base + "-verification",
		workspaceVolume:    base + "-workspace",
		volumeHolder:       base + "-workspace-holder",
		verificationHolder: base + "-verification-holder",
		agentContainer:     base + "-agent",
		backendContainer:   base + "-backend",
		copyContainer:      base + "-copy",
		tokenContainer:     base + "-token-evidence",
		verifierContainer:  base + "-verifier",
		networks:           map[string]bool{},
		volumes:            map[string]bool{},
		containers:         map[string]bool{},
	}
}

func (resources *phase1DockerResources) start(
	ctx context.Context,
	codexCommand string,
	hardTotalTokens int64,
	abortScenario func(),
) (*BackendClient, error) {
	if err := resources.createIsolationResources(ctx); err != nil {
		return nil, err
	}
	if err := resources.seedVolumes(ctx); err != nil {
		return nil, err
	}
	controlEndpoint, err := resources.startAgent(ctx, abortScenario)
	if err != nil {
		return nil, err
	}
	provider, err := startPhase1ProviderBroker(
		ctx,
		codexCommand,
		controlEndpoint.URL,
		hardTotalTokens,
		abortScenario,
	)
	if err != nil {
		return nil, err
	}
	resources.provider = provider
	if err := provider.verifyChatGPTAuth(ctx); err != nil {
		return nil, err
	}
	return resources.startBackend(ctx)
}

func (resources *phase1DockerResources) createIsolationResources(ctx context.Context) error {
	networks := []struct {
		name     string
		internal bool
	}{
		{name: resources.agentNetwork, internal: true},
		{name: resources.controllerNetwork, internal: false},
	}
	for _, network := range networks {
		args := []string{
			"network", "create",
			"--driver", "bridge",
			"--label", "com.setta.eval.phase=1",
			"--label", "com.setta.eval.run=" + resources.suffix,
		}
		if network.internal {
			args = append(args, "--internal")
		}
		args = append(args, network.name)
		resources.networks[network.name] = true
		if _, err := resources.client.run(ctx, args...); err != nil {
			return fmt.Errorf("create Phase 1 Docker network %s: %w", network.name, err)
		}
	}
	for _, volume := range []struct {
		name      string
		diskBytes int64
	}{
		{name: resources.appDataVolume},
		{name: resources.baselineVolume},
		{name: resources.verificationVolume, diskBytes: phase1VerificationDiskBytes},
		{name: resources.workspaceVolume, diskBytes: phase1WorkspaceDiskBytes},
	} {
		args := []string{
			"volume", "create",
			"--label", "com.setta.eval.phase=1",
			"--label", "com.setta.eval.run=" + resources.suffix,
		}
		if volume.diskBytes > 0 {
			args = append(args, phase1BoundedVolumeDriverOptions(volume.diskBytes)...)
		}
		args = append(args, volume.name)
		resources.volumes[volume.name] = true
		if _, err := resources.client.run(ctx, args...); err != nil {
			return fmt.Errorf("create Phase 1 Docker volume %s: %w", volume.name, err)
		}
	}
	if err := resources.validateBoundedVolume(
		ctx,
		resources.workspaceVolume,
		"workspace",
		phase1WorkspaceDiskBytes,
	); err != nil {
		return err
	}
	if err := resources.validateBoundedVolume(
		ctx,
		resources.verificationVolume,
		"verification",
		phase1VerificationDiskBytes,
	); err != nil {
		return err
	}
	return resources.startBoundedVolumeHolders(ctx)
}

func phase1WorkspaceVolumeDriverOptions() []string {
	return phase1BoundedVolumeDriverOptions(phase1WorkspaceDiskBytes)
}

func phase1BoundedVolumeDriverOptions(diskBytes int64) []string {
	return []string{
		"--driver", "local",
		"--opt", "type=tmpfs",
		"--opt", "device=tmpfs",
		"--opt", "o=" + phase1BoundedVolumeMountOptions(diskBytes),
	}
}

func phase1BoundedVolumeMountOptions(diskBytes int64) string {
	return fmt.Sprintf(
		"size=%d,uid=%d,gid=%d,mode=0755",
		diskBytes,
		phase1ContainerUID,
		phase1ContainerGID,
	)
}

type phase1DockerVolume struct {
	Driver  string            `json:"Driver"`
	Options map[string]string `json:"Options"`
}

func (resources *phase1DockerResources) validateBoundedVolume(
	ctx context.Context,
	volume string,
	label string,
	diskBytes int64,
) error {
	result, err := resources.client.run(ctx, "volume", "inspect", volume)
	if err != nil {
		return fmt.Errorf("inspect Phase 1 bounded %s volume: %w", label, err)
	}
	var volumes []phase1DockerVolume
	if err := json.Unmarshal([]byte(result.stdout), &volumes); err != nil {
		return fmt.Errorf("decode Phase 1 bounded %s volume: %w", label, err)
	}
	wantOptions := map[string]string{
		"type":   "tmpfs",
		"device": "tmpfs",
		"o":      phase1BoundedVolumeMountOptions(diskBytes),
	}
	if len(volumes) != 1 || volumes[0].Driver != "local" ||
		len(volumes[0].Options) != len(wantOptions) {
		return fmt.Errorf("Phase 1 %s volume did not retain its local tmpfs disk ceiling", label)
	}
	for name, value := range wantOptions {
		if volumes[0].Options[name] != value {
			return fmt.Errorf(
				"Phase 1 %s volume option %s is %q, want %q",
				label,
				name,
				volumes[0].Options[name],
				value,
			)
		}
	}
	return nil
}

func (resources *phase1DockerResources) startBoundedVolumeHolders(ctx context.Context) error {
	for _, holder := range []struct {
		container string
		volume    string
		root      string
		label     string
	}{
		{container: resources.volumeHolder, volume: resources.workspaceVolume, root: phase1WorkspaceRoot, label: "workspace"},
		{container: resources.verificationHolder, volume: resources.verificationVolume, root: phase1VerificationRoot, label: "verification"},
	} {
		if err := resources.startBoundedVolumeHolder(
			ctx,
			holder.container,
			holder.volume,
			holder.root,
			holder.label,
		); err != nil {
			return err
		}
	}
	return nil
}

func (resources *phase1DockerResources) startBoundedVolumeHolder(
	ctx context.Context,
	container string,
	volume string,
	root string,
	label string,
) error {
	resources.containers[container] = true
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--pull", "never",
		"--name", container,
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--mount", "type=volume,source="+volume+",destination="+root+",readonly",
		"--read-only",
		"--user", fmt.Sprintf("%d:%d", phase1ContainerUID, phase1ContainerGID),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(phase1VolumeHolderPIDs),
		"--memory", strconv.FormatInt(phase1VolumeHolderMemory, 10),
		"--cpus", "0.25",
		"--label", "com.setta.eval.phase=1",
		"--label", "com.setta.eval.role=volume-holder",
		"--label", "com.setta.eval.run="+resources.suffix,
		"--entrypoint", "/usr/local/bin/setta-eval-sandbox-helper",
		resources.images.verifierID,
		"phase1-hold-volume",
	); err != nil {
		return fmt.Errorf("start Phase 1 bounded %s volume holder: %w", label, err)
	}
	if err := resources.requireContainerRunning(ctx, container); err != nil {
		return fmt.Errorf("validate Phase 1 bounded %s volume holder: %w", label, err)
	}
	return nil
}

func (resources *phase1DockerResources) seedVolumes(ctx context.Context) error {
	seeds := []struct {
		label  string
		image  string
		volume string
		root   string
		source string
	}{
		{label: "app-data", image: resources.images.verifierID, volume: resources.appDataVolume, root: phase1AppDataRoot},
		{label: "baseline", image: resources.images.verifierID, volume: resources.baselineVolume, root: phase1BaselineRoot, source: resources.fixture.baseline},
		{label: "verification", image: resources.images.verifierID, volume: resources.verificationVolume, root: phase1VerificationRoot},
		{label: "workspace", image: resources.images.agentID, volume: resources.workspaceVolume, root: phase1WorkspaceRoot, source: resources.fixture.workspace},
	}
	for _, seed := range seeds {
		if err := resources.seedVolume(ctx, seed.label, seed.image, seed.volume, seed.root, seed.source); err != nil {
			return err
		}
	}
	return nil
}

func (resources *phase1DockerResources) seedVolume(
	ctx context.Context,
	label string,
	image string,
	volume string,
	root string,
	source string,
) error {
	container := "setta-eval-phase1-" + resources.suffix + "-seed-" + label
	args := []string{
		"container", "create",
		"--name", container,
		"--pull", "never",
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--read-only",
		"--user", "0:0",
		"--cap-drop", "ALL",
		"--cap-add", "CHOWN",
		"--cap-add", "DAC_OVERRIDE",
		"--security-opt", "no-new-privileges",
		"--mount", "type=volume,source=" + volume + ",destination=" + root,
	}
	if source != "" {
		args = append(
			args,
			"--mount", "type=bind,source="+source+",destination=/seed,readonly",
		)
	}
	args = append(args, "--entrypoint", "/usr/local/bin/setta-eval-sandbox-helper", image)
	if source == "" {
		args = append(
			args,
			"phase1-prepare-volume",
			"--root", root,
			"--uid", strconv.Itoa(phase1ContainerUID),
			"--gid", strconv.Itoa(phase1ContainerGID),
		)
	} else {
		args = append(
			args,
			"phase1-copy-volume",
			"--source", "/seed",
			"--destination", root,
			"--uid", strconv.Itoa(phase1ContainerUID),
			"--gid", strconv.Itoa(phase1ContainerGID),
		)
	}
	resources.containers[container] = true
	if _, err := resources.client.run(ctx, args...); err != nil {
		return fmt.Errorf("create Phase 1 %s seed container: %w", label, err)
	}
	output, err := resources.client.run(ctx, "container", "start", "--attach", container)
	if err != nil {
		return fmt.Errorf("prepare Phase 1 %s volume: %w", label, err)
	}
	if source != "" {
		var result volumecopy.Result
		if err := jsonio.DecodeSingle(strings.NewReader(output.stdout), &result); err != nil {
			return fmt.Errorf("decode Phase 1 %s seed result: %w", label, err)
		}
		if err := result.Validate(); err != nil {
			return fmt.Errorf("validate Phase 1 %s seed result: %w", label, err)
		}
		if result.Status != volumecopy.StatusCopied {
			return fmt.Errorf("Phase 1 %s fixture is invalid: %s", label, result.Detail)
		}
	}
	if err := resources.removeContainer(ctx, container); err != nil {
		return err
	}
	return nil
}

func (resources *phase1DockerResources) startBackend(
	ctx context.Context,
) (*BackendClient, error) {
	bridgeAddress := resources.provider.controllerAddress()
	if bridgeAddress == "" {
		return nil, errors.New("Phase 1 provider bridge did not expose a controller address")
	}
	resources.containers[resources.backendContainer] = true
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--pull", "never",
		"--name", resources.backendContainer,
		"--platform", phase1ImagePlatform,
		"--network", resources.controllerNetwork,
		"--publish", "127.0.0.1::"+phase1BackendPort+"/tcp",
		"--mount", "type=volume,source="+resources.appDataVolume+",destination="+phase1AppDataRoot,
		"--mount", "type=volume,source="+resources.workspaceVolume+",destination="+phase1WorkspaceRoot,
		"--read-only",
		"--tmpfs", phase1Tmpfs(),
		"--user", fmt.Sprintf("%d:%d", phase1ContainerUID, phase1ContainerGID),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(phase1BackendPIDs),
		"--memory", strconv.FormatInt(phase1BackendMemoryBytes, 10),
		"--cpus", "2",
		"--env", "HOME=/tmp",
		"--env", "LANG=C.UTF-8",
		"--env", "PATH=/usr/local/bin",
		"--env", "SETTA_APP_DATA_DIR="+phase1AppDataRoot,
		"--env", "SETTA_BACKEND_ALLOW_REMOTE=1",
		"--env", "SETTA_BACKEND_HOST=0.0.0.0",
		"--env", "SETTA_BACKEND_PORT="+phase1BackendPort,
		"--env", providerbridge.AddressEnvironment+"="+bridgeAddress,
		"--env", providerbridge.TokenEnvironment+"="+resources.provider.controllerToken(),
		"--env", toolpolicy.RestrictExternalToolsEnvironment+"=1",
		"--env", tokenusage.PathEnvironment+"="+phase1TokenUsagePath,
		"--env", "SETTA_RUNTIME_DISPLAY_NAME=Setta Evaluation",
		"--env", "SETTA_RUNTIME_INFRA_PROVIDER=unknown",
		"--env", "TMPDIR=/tmp",
		"--label", "com.setta.eval.phase=1",
		"--label", "com.setta.eval.run="+resources.suffix,
		resources.images.backendID,
	); err != nil {
		return nil, fmt.Errorf("start Phase 1 production backend container: %w", err)
	}
	ready, err := resources.awaitBackendReady(ctx)
	if err != nil {
		return nil, err
	}
	address, err := resources.publishedAddress(ctx, resources.backendContainer, phase1BackendPort)
	if err != nil {
		return nil, err
	}
	client, err := NewBackendClient(BackendClientConfig{
		BaseURL: "http://" + address,
		Token:   ready.BootstrapToken,
	})
	if err != nil {
		return nil, fmt.Errorf("create Phase 1 production backend client: %w", err)
	}
	return client, nil
}

func (resources *phase1DockerResources) readTokenUsageEvidence(
	ctx context.Context,
) ([]agent.TokenUsageObservation, error) {
	resources.containers[resources.tokenContainer] = true
	if _, err := resources.client.run(
		ctx,
		"container", "create",
		"--name", resources.tokenContainer,
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--read-only",
		"--user", fmt.Sprintf("%d:%d", phase1ContainerUID, phase1ContainerGID),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(phase1VolumeHolderPIDs),
		"--memory", strconv.FormatInt(phase1VolumeHolderMemory, 10),
		"--cpus", "0.25",
		"--mount", "type=volume,source="+resources.appDataVolume+",destination="+phase1AppDataRoot+",readonly",
		"--entrypoint", "/usr/local/bin/setta-eval-sandbox-helper",
		resources.images.verifierID,
		"phase1-read-file",
		"--root", phase1AppDataRoot,
		"--path", phase1TokenUsagePath,
		"--max-bytes", strconv.Itoa(tokenusage.MaximumFileBytes),
	); err != nil {
		return nil, fmt.Errorf("create Phase 1 token-evidence reader: %w", err)
	}
	output, err := resources.client.run(ctx, "container", "start", "--attach", resources.tokenContainer)
	if err != nil {
		return nil, fmt.Errorf("read Phase 1 token evidence: %w", err)
	}
	observations, err := tokenusage.DecodeObservations([]byte(output.stdout))
	if err != nil {
		return nil, err
	}
	if err := resources.removeContainer(ctx, resources.tokenContainer); err != nil {
		return nil, err
	}
	return observations, nil
}

func (resources *phase1DockerResources) awaitBackendReady(
	ctx context.Context,
) (settaruntime.ReadyEvent, error) {
	// The detached production backend publishes its one typed readiness event
	// only through container logs. Follow that stream so startup remains
	// push-driven, and stop following before any scenario work begins.
	readyContext, cancel := context.WithTimeout(ctx, phase1BackendReadyTimeout)
	defer cancel()
	followContext, stopFollowing := context.WithCancel(readyContext)
	defer stopFollowing()
	command := exec.CommandContext(
		followContext,
		resources.client.command,
		"container", "logs", "--follow", resources.backendContainer,
	)
	command.Dir = resources.client.repoRoot
	stdout, err := command.StdoutPipe()
	if err != nil {
		return settaruntime.ReadyEvent{}, fmt.Errorf("open Phase 1 backend readiness stream: %w", err)
	}
	diagnostic := newPhase1DiagnosticBuffer(ResultMaximumDiagnosticBytes)
	command.Stderr = diagnostic
	if err := command.Start(); err != nil {
		return settaruntime.ReadyEvent{}, fmt.Errorf(
			"start Phase 1 backend readiness stream: %w: %s",
			err,
			diagnostic.String(),
		)
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), phase1BackendLogLineBytes)
	for scanner.Scan() {
		ready, found, err := decodePhase1BackendReady(scanner.Text())
		if err != nil {
			stopFollowing()
			_ = command.Wait()
			return settaruntime.ReadyEvent{}, err
		}
		if found {
			stopFollowing()
			_ = command.Wait()
			if err := resources.requireContainerRunning(ctx, resources.backendContainer); err != nil {
				return settaruntime.ReadyEvent{}, err
			}
			return ready, nil
		}
	}
	scanErr := scanner.Err()
	stopFollowing()
	waitErr := command.Wait()
	if err := readyContext.Err(); err != nil {
		return settaruntime.ReadyEvent{}, fmt.Errorf("Phase 1 backend readiness: %w", err)
	}
	if scanErr != nil {
		return settaruntime.ReadyEvent{}, fmt.Errorf("read Phase 1 backend readiness stream: %w", scanErr)
	}
	if err := resources.requireContainerRunning(ctx, resources.backendContainer); err != nil {
		return settaruntime.ReadyEvent{}, err
	}
	if waitErr != nil {
		return settaruntime.ReadyEvent{}, fmt.Errorf(
			"follow Phase 1 backend readiness stream: %w: %s",
			waitErr,
			diagnostic.String(),
		)
	}
	return settaruntime.ReadyEvent{}, errors.New("Phase 1 backend readiness stream ended without a ready event")
}

func decodePhase1BackendReady(value string) (settaruntime.ReadyEvent, bool, error) {
	var found *settaruntime.ReadyEvent
	for _, line := range strings.Split(value, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var envelope struct {
			Event string `json:"event"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil || envelope.Event != "ready" {
			continue
		}
		var event settaruntime.ReadyEvent
		if err := jsonio.DecodeSingle(strings.NewReader(line), &event); err != nil {
			return settaruntime.ReadyEvent{}, false, fmt.Errorf("decode Phase 1 backend ready event: %w", err)
		}
		if found != nil {
			return settaruntime.ReadyEvent{}, false, errors.New("Phase 1 backend emitted more than one ready event")
		}
		cloned := event
		found = &cloned
	}
	if found == nil {
		return settaruntime.ReadyEvent{}, false, nil
	}
	if !validPhase1BackendReadyAddress(found.Addr) ||
		found.ProtocolVersion != httpapi.ProtocolVersion ||
		strings.TrimSpace(found.BootstrapToken) == "" {
		return settaruntime.ReadyEvent{}, false, errors.New("Phase 1 backend emitted an invalid ready event")
	}
	return *found, true, nil
}

func validPhase1BackendReadyAddress(value string) bool {
	host, port, err := net.SplitHostPort(value)
	if err != nil || port != phase1BackendPort {
		return false
	}
	address := net.ParseIP(host)
	return address != nil && address.IsUnspecified()
}

func (resources *phase1DockerResources) stopController() error {
	if resources == nil || resources.controllerStopped {
		return nil
	}
	var stopErrors []error
	if err := runPhase1Cleanup(func(ctx context.Context) error {
		return resources.stopContainer(ctx, resources.backendContainer, "backend")
	}); err != nil {
		stopErrors = append(stopErrors, err)
	}
	if resources.provider != nil {
		if resources.controlRelay != nil {
			resources.controlRelay.beginShutdown()
		}
		if err := runPhase1Cleanup(resources.provider.close); err != nil {
			stopErrors = append(stopErrors, err)
		} else {
			resources.provider = nil
		}
	}
	if resources.controlRelay != nil {
		if err := runPhase1Cleanup(resources.controlRelay.close); err != nil {
			stopErrors = append(stopErrors, fmt.Errorf("stop Phase 1 Agent control relay: %w", err))
		} else {
			resources.controlRelay = nil
		}
	}
	if err := runPhase1Cleanup(func(ctx context.Context) error {
		return resources.stopContainer(ctx, resources.agentContainer, "Agent")
	}); err != nil {
		stopErrors = append(stopErrors, err)
	}
	stopErr := errors.Join(stopErrors...)
	if stopErr == nil {
		resources.controllerStopped = true
	}
	return stopErr
}

func (resources *phase1DockerResources) stopContainer(
	ctx context.Context,
	container string,
	label string,
) error {
	if !resources.containers[container] {
		return nil
	}
	if _, err := resources.client.run(
		ctx,
		"container", "stop",
		"--time", strconv.Itoa(phase1ContainerStopTime),
		container,
	); err != nil {
		exists, inspectErr := resources.client.containerExists(ctx, container)
		if inspectErr != nil {
			return errors.Join(
				fmt.Errorf("stop Phase 1 %s container: %w", label, err),
				fmt.Errorf("confirm Phase 1 %s container state: %w", label, inspectErr),
			)
		}
		if exists {
			return fmt.Errorf("stop Phase 1 %s container: %w", label, err)
		}
		delete(resources.containers, container)
	}
	return nil
}

func (resources *phase1DockerResources) verify(
	ctx context.Context,
	verifierID string,
) (evalverifier.Result, error) {
	if !resources.controllerStopped {
		return evalverifier.Result{}, errors.New("Phase 1 controller must stop before hidden verification")
	}
	copyResult, err := resources.copyWorkspaceForVerification(ctx)
	if err != nil {
		return evalverifier.Result{}, err
	}
	if copyResult.Status == volumecopy.StatusInvalidWorkspace {
		return phase1InvalidWorkspaceVerifierResult(verifierID, copyResult.Detail), nil
	}
	resources.containers[resources.verifierContainer] = true
	if _, err := resources.client.run(
		ctx,
		"container", "create",
		"--name", resources.verifierContainer,
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--read-only",
		"--tmpfs", phase1Tmpfs(),
		"--user", fmt.Sprintf("%d:%d", phase1ContainerUID, phase1ContainerGID),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(phase1VerifierPIDs),
		"--memory", strconv.FormatInt(phase1VerifierMemoryBytes, 10),
		"--cpus", "2",
		"--mount", "type=volume,source="+resources.baselineVolume+",destination="+phase1BaselineRoot+",readonly",
		"--mount", "type=volume,source="+resources.verificationVolume+",destination="+phase1WorkspaceRoot,
		"--label", "com.setta.eval.phase=1",
		"--label", "com.setta.eval.run="+resources.suffix,
		resources.images.verifierID,
		"--verifier", verifierID,
		"--baseline", phase1BaselineRoot,
		"--workspace", phase1WorkspaceRoot,
	); err != nil {
		return evalverifier.Result{}, fmt.Errorf("create Phase 1 verifier container: %w", err)
	}
	output, err := resources.client.run(ctx, "container", "start", "--attach", resources.verifierContainer)
	if err != nil {
		return evalverifier.Result{}, fmt.Errorf("run Phase 1 hidden verifier: %w", err)
	}
	var result evalverifier.Result
	if err := jsonio.DecodeSingle(strings.NewReader(output.stdout), &result); err != nil {
		return evalverifier.Result{}, fmt.Errorf("decode Phase 1 hidden verifier result: %w", err)
	}
	if err := result.Validate(); err != nil {
		return evalverifier.Result{}, fmt.Errorf("validate Phase 1 hidden verifier result: %w", err)
	}
	return result, nil
}

func phase1InvalidWorkspaceVerifierResult(verifierID string, detail string) evalverifier.Result {
	return evalverifier.NewResult(
		verifierID,
		[]evalverifier.Check{{
			ID:     "workspace_snapshot",
			Passed: false,
			Detail: evalverifier.BoundedDetail(detail),
		}},
		[]string{},
	)
}

func (resources *phase1DockerResources) copyWorkspaceForVerification(
	ctx context.Context,
) (volumecopy.Result, error) {
	resources.containers[resources.copyContainer] = true
	if _, err := resources.client.run(
		ctx,
		"container", "create",
		"--name", resources.copyContainer,
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--read-only",
		"--user", "0:0",
		"--cap-drop", "ALL",
		"--cap-add", "CHOWN",
		"--cap-add", "DAC_OVERRIDE",
		"--security-opt", "no-new-privileges",
		"--mount", "type=volume,source="+resources.workspaceVolume+",destination="+phase1WorkspaceRoot+",readonly",
		"--mount", "type=volume,source="+resources.verificationVolume+",destination="+phase1VerificationRoot,
		"--entrypoint", "/usr/local/bin/setta-eval-sandbox-helper",
		resources.images.verifierID,
		"phase1-copy-volume",
		"--source", phase1WorkspaceRoot,
		"--destination", phase1VerificationRoot,
		"--uid", strconv.Itoa(phase1ContainerUID),
		"--gid", strconv.Itoa(phase1ContainerGID),
	); err != nil {
		return volumecopy.Result{}, fmt.Errorf("create Phase 1 verification-copy container: %w", err)
	}
	output, err := resources.client.run(ctx, "container", "start", "--attach", resources.copyContainer)
	if err != nil {
		return volumecopy.Result{}, fmt.Errorf("copy Phase 1 final workspace for verification: %w", err)
	}
	var result volumecopy.Result
	if err := jsonio.DecodeSingle(strings.NewReader(output.stdout), &result); err != nil {
		return volumecopy.Result{}, fmt.Errorf("decode Phase 1 volume-copy result: %w", err)
	}
	if err := result.Validate(); err != nil {
		return volumecopy.Result{}, fmt.Errorf("validate Phase 1 volume-copy result: %w", err)
	}
	if err := resources.removeContainer(ctx, resources.copyContainer); err != nil {
		return volumecopy.Result{}, err
	}
	return result, nil
}

func (resources *phase1DockerResources) publishedAddress(
	ctx context.Context,
	container string,
	port string,
) (string, error) {
	result, err := resources.client.run(ctx, "container", "port", container, port+"/tcp")
	if err != nil {
		return "", fmt.Errorf("read Phase 1 published port for %s: %w", container, err)
	}
	lines := strings.Fields(result.stdout)
	if len(lines) != 1 {
		return "", fmt.Errorf("Phase 1 container %s returned %d published addresses", container, len(lines))
	}
	if err := validateNumericLoopbackAddress(lines[0]); err != nil {
		return "", fmt.Errorf("validate Phase 1 published address for %s: %w", container, err)
	}
	return lines[0], nil
}

func (resources *phase1DockerResources) requireContainerRunning(
	ctx context.Context,
	container string,
) error {
	result, err := resources.client.run(
		ctx,
		"container", "inspect",
		"--format", "{{json .State.Running}}",
		container,
	)
	if err != nil {
		return fmt.Errorf("inspect Phase 1 container %s: %w", container, err)
	}
	if strings.TrimSpace(result.stdout) != "true" {
		return fmt.Errorf("Phase 1 container %s exited before readiness", container)
	}
	return nil
}

func (resources *phase1DockerResources) removeContainer(
	ctx context.Context,
	container string,
) error {
	if !resources.containers[container] {
		return nil
	}
	if _, err := resources.client.run(ctx, "container", "rm", "--force", container); err != nil {
		exists, inspectErr := resources.client.containerExists(ctx, container)
		if inspectErr != nil {
			return errors.Join(
				fmt.Errorf("remove Phase 1 container %s: %w", container, err),
				fmt.Errorf("confirm Phase 1 container removal %s: %w", container, inspectErr),
			)
		}
		if exists {
			return fmt.Errorf("remove Phase 1 container %s: %w", container, err)
		}
	}
	delete(resources.containers, container)
	return nil
}

func (resources *phase1DockerResources) cleanupScenario() error {
	if resources == nil {
		return nil
	}
	return errors.Join(
		resources.stopController(),
		resources.cleanupContainers(),
		resources.cleanupVolumes(),
		resources.cleanupNetworks(),
		resources.fixture.cleanup(),
	)
}

func (resources *phase1DockerResources) cleanupContainers() error {
	var cleanupErrors []error
	for container := range resources.containers {
		if err := resources.removeDockerResourceForCleanup(
			"container",
			container,
			[]string{"container", "rm", "--force", container},
			resources.client.containerExists,
		); err != nil {
			cleanupErrors = append(cleanupErrors, err)
			continue
		}
		delete(resources.containers, container)
	}
	return errors.Join(cleanupErrors...)
}

func (resources *phase1DockerResources) cleanupVolumes() error {
	var cleanupErrors []error
	for volume, created := range resources.volumes {
		if !created {
			continue
		}
		if err := resources.removeDockerResourceForCleanup(
			"volume",
			volume,
			[]string{"volume", "rm", volume},
			resources.client.volumeExists,
		); err != nil {
			cleanupErrors = append(cleanupErrors, err)
			continue
		}
		resources.volumes[volume] = false
	}
	return errors.Join(cleanupErrors...)
}

func (resources *phase1DockerResources) cleanupNetworks() error {
	var cleanupErrors []error
	for network, created := range resources.networks {
		if !created {
			continue
		}
		if err := resources.removeDockerResourceForCleanup(
			"network",
			network,
			[]string{"network", "rm", network},
			resources.client.networkExists,
		); err != nil {
			cleanupErrors = append(cleanupErrors, err)
			continue
		}
		resources.networks[network] = false
	}
	return errors.Join(cleanupErrors...)
}

func (resources *phase1DockerResources) removeDockerResourceForCleanup(
	label string,
	name string,
	removeArgs []string,
	exists dockerResourceExistenceCheck,
) error {
	removeErr := runPhase1Cleanup(func(ctx context.Context) error {
		_, err := resources.client.run(ctx, removeArgs...)
		return err
	})
	if removeErr == nil {
		return nil
	}
	var remaining bool
	inspectErr := runPhase1Cleanup(func(ctx context.Context) error {
		var err error
		remaining, err = exists(ctx, name)
		return err
	})
	if inspectErr != nil {
		return errors.Join(
			fmt.Errorf("remove Phase 1 %s %s: %w", label, name, removeErr),
			fmt.Errorf("confirm Phase 1 %s removal %s: %w", label, name, inspectErr),
		)
	}
	if remaining {
		return fmt.Errorf("remove Phase 1 %s %s: %w", label, name, removeErr)
	}
	return nil
}

func phase1Tmpfs() string {
	return fmt.Sprintf(
		"/tmp:rw,noexec,nosuid,nodev,size=%d,mode=1777",
		phase1ContainerTmpfsBytes,
	)
}
