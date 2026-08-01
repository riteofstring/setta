package evalharness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"setta/internal/evalharness/providerbridge"
	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/evalharness/volumecopy"
	"setta/internal/httpapi"
	"setta/internal/jsonio"
	settaruntime "setta/internal/runtime"
)

const (
	phase1WorkspaceRoot       = "/workspace"
	phase1BaselineRoot        = "/baseline"
	phase1VerificationRoot    = "/verification"
	phase1AppDataRoot         = "/app-data"
	phase1ExecServerPort      = "4500"
	phase1BackendPort         = "4310"
	phase1ContainerTmpfsBytes = 128 * 1024 * 1024
	phase1WorkspaceDiskBytes  = 64 * 1024 * 1024
	phase1AgentMemoryBytes    = 4 * 1024 * 1024 * 1024
	phase1BackendMemoryBytes  = 2 * 1024 * 1024 * 1024
	phase1VerifierMemoryBytes = 2 * 1024 * 1024 * 1024
	phase1VolumeHolderMemory  = 32 * 1024 * 1024
	phase1AgentPIDs           = 256
	phase1BackendPIDs         = 256
	phase1VerifierPIDs        = 256
	phase1VolumeHolderPIDs    = 8
	phase1BackendReadyTimeout = 30 * time.Second
	phase1ContainerStopTime   = 15
)

type phase1DockerResources struct {
	client   phase0DockerClient
	suffix   string
	images   *phase1Images
	fixture  phase1FixturePreparation
	provider *phase1ProviderBroker

	agentNetwork       string
	controllerNetwork  string
	appDataVolume      string
	baselineVolume     string
	verificationVolume string
	workspaceVolume    string
	volumeHolder       string
	agentContainer     string
	backendContainer   string
	copyContainer      string
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
		agentContainer:     base + "-agent",
		backendContainer:   base + "-backend",
		copyContainer:      base + "-copy",
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
	execServerAddress, err := resources.startAgent(ctx)
	if err != nil {
		return nil, err
	}
	provider, err := startPhase1ProviderBroker(
		ctx,
		codexCommand,
		execServerAddress,
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
		if _, err := resources.client.run(ctx, args...); err != nil {
			return fmt.Errorf("create Phase 1 Docker network %s: %w", network.name, err)
		}
		resources.networks[network.name] = true
	}
	for _, volume := range []struct {
		name        string
		diskBounded bool
	}{
		{name: resources.appDataVolume},
		{name: resources.baselineVolume},
		{name: resources.verificationVolume},
		{name: resources.workspaceVolume, diskBounded: true},
	} {
		args := []string{
			"volume", "create",
			"--label", "com.setta.eval.phase=1",
			"--label", "com.setta.eval.run=" + resources.suffix,
		}
		if volume.diskBounded {
			args = append(args, phase1WorkspaceVolumeDriverOptions()...)
		}
		args = append(args, volume.name)
		if _, err := resources.client.run(ctx, args...); err != nil {
			return fmt.Errorf("create Phase 1 Docker volume %s: %w", volume.name, err)
		}
		resources.volumes[volume.name] = true
	}
	if err := resources.validateWorkspaceVolume(ctx); err != nil {
		return err
	}
	return resources.startWorkspaceVolumeHolder(ctx)
}

func phase1WorkspaceVolumeDriverOptions() []string {
	return []string{
		"--driver", "local",
		"--opt", "type=tmpfs",
		"--opt", "device=tmpfs",
		"--opt", "o=" + phase1WorkspaceVolumeMountOptions(),
	}
}

func phase1WorkspaceVolumeMountOptions() string {
	return fmt.Sprintf(
		"size=%d,uid=%d,gid=%d,mode=0755",
		phase1WorkspaceDiskBytes,
		phase1ContainerUID,
		phase1ContainerGID,
	)
}

type phase1DockerVolume struct {
	Driver  string            `json:"Driver"`
	Options map[string]string `json:"Options"`
}

func (resources *phase1DockerResources) validateWorkspaceVolume(ctx context.Context) error {
	result, err := resources.client.run(ctx, "volume", "inspect", resources.workspaceVolume)
	if err != nil {
		return fmt.Errorf("inspect Phase 1 bounded workspace volume: %w", err)
	}
	var volumes []phase1DockerVolume
	if err := json.Unmarshal([]byte(result.stdout), &volumes); err != nil {
		return fmt.Errorf("decode Phase 1 bounded workspace volume: %w", err)
	}
	wantOptions := map[string]string{
		"type":   "tmpfs",
		"device": "tmpfs",
		"o":      phase1WorkspaceVolumeMountOptions(),
	}
	if len(volumes) != 1 || volumes[0].Driver != "local" ||
		len(volumes[0].Options) != len(wantOptions) {
		return errors.New("Phase 1 workspace volume did not retain its local tmpfs disk ceiling")
	}
	for name, value := range wantOptions {
		if volumes[0].Options[name] != value {
			return fmt.Errorf(
				"Phase 1 workspace volume option %s is %q, want %q",
				name,
				volumes[0].Options[name],
				value,
			)
		}
	}
	return nil
}

func (resources *phase1DockerResources) startWorkspaceVolumeHolder(ctx context.Context) error {
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--pull", "never",
		"--name", resources.volumeHolder,
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--mount", "type=volume,source="+resources.workspaceVolume+",destination="+phase1WorkspaceRoot+",readonly",
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
		return fmt.Errorf("start Phase 1 bounded workspace volume holder: %w", err)
	}
	resources.containers[resources.volumeHolder] = true
	if err := resources.requireContainerRunning(ctx, resources.volumeHolder); err != nil {
		return fmt.Errorf("validate Phase 1 bounded workspace volume holder: %w", err)
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
	if _, err := resources.client.run(
		ctx,
		"container", "create",
		"--name", container,
		"--platform", phase1ImagePlatform,
		"--network", "none",
		"--read-only",
		"--user", "0:0",
		"--cap-drop", "ALL",
		"--cap-add", "CHOWN",
		"--cap-add", "DAC_OVERRIDE",
		"--security-opt", "no-new-privileges",
		"--mount", "type=volume,source="+volume+",destination="+root,
		"--entrypoint", "/usr/local/bin/setta-eval-sandbox-helper",
		image,
		"phase1-prepare-volume",
		"--root", root,
		"--uid", strconv.Itoa(phase1ContainerUID),
		"--gid", strconv.Itoa(phase1ContainerGID),
	); err != nil {
		return fmt.Errorf("create Phase 1 %s seed container: %w", label, err)
	}
	resources.containers[container] = true
	if source != "" {
		if _, err := resources.client.run(
			ctx,
			"container", "cp",
			"--archive",
			filepath.Clean(source)+string(os.PathSeparator)+".",
			container+":"+root,
		); err != nil {
			return fmt.Errorf("copy Phase 1 %s fixture into volume: %w", label, err)
		}
	}
	if _, err := resources.client.run(ctx, "container", "start", "--attach", container); err != nil {
		return fmt.Errorf("prepare Phase 1 %s volume: %w", label, err)
	}
	if err := resources.removeContainer(ctx, container); err != nil {
		return err
	}
	return nil
}

func (resources *phase1DockerResources) startAgent(ctx context.Context) (string, error) {
	tmpfs := phase1Tmpfs()
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--pull", "never",
		"--name", resources.agentContainer,
		"--platform", phase1ImagePlatform,
		"--network", resources.agentNetwork,
		"--publish", "127.0.0.1::"+phase1ExecServerPort+"/tcp",
		"--mount", "type=volume,source="+resources.workspaceVolume+",destination="+phase1WorkspaceRoot,
		"--read-only",
		"--tmpfs", tmpfs,
		"--user", fmt.Sprintf("%d:%d", phase1ContainerUID, phase1ContainerGID),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(phase1AgentPIDs),
		"--memory", strconv.FormatInt(phase1AgentMemoryBytes, 10),
		"--cpus", "4",
		"--env", "HOME=/tmp",
		"--env", "LANG=C.UTF-8",
		"--env", "PATH=/usr/local/bin:/usr/bin:/bin",
		"--env", "SHELL=/bin/zsh",
		"--label", "com.setta.eval.phase=1",
		"--label", "com.setta.eval.run="+resources.suffix,
		resources.images.agentID,
	); err != nil {
		return "", fmt.Errorf("start Phase 1 Agent exec-server container: %w", err)
	}
	resources.containers[resources.agentContainer] = true
	if err := resources.requireContainerRunning(ctx, resources.agentContainer); err != nil {
		return "", err
	}
	return resources.publishedAddress(ctx, resources.agentContainer, phase1ExecServerPort)
}

func (resources *phase1DockerResources) startBackend(
	ctx context.Context,
) (*BackendClient, error) {
	bridgeAddress := resources.provider.controllerAddress()
	if bridgeAddress == "" {
		return nil, errors.New("Phase 1 provider bridge did not expose a controller address")
	}
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
		"--env", "SETTA_RUNTIME_DISPLAY_NAME=Setta Evaluation",
		"--env", "SETTA_RUNTIME_INFRA_PROVIDER=unknown",
		"--env", "TMPDIR=/tmp",
		"--label", "com.setta.eval.phase=1",
		"--label", "com.setta.eval.run="+resources.suffix,
		resources.images.backendID,
	); err != nil {
		return nil, fmt.Errorf("start Phase 1 production backend container: %w", err)
	}
	resources.containers[resources.backendContainer] = true
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

func (resources *phase1DockerResources) awaitBackendReady(
	ctx context.Context,
) (settaruntime.ReadyEvent, error) {
	// The detached production backend publishes its one typed readiness event
	// only through container logs. This bounded startup probe ends before any
	// scenario work; scenario state itself remains push-driven over SSE.
	readyContext, cancel := context.WithTimeout(ctx, phase1BackendReadyTimeout)
	defer cancel()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		result, err := resources.client.run(readyContext, "container", "logs", resources.backendContainer)
		if err != nil {
			return settaruntime.ReadyEvent{}, fmt.Errorf("read Phase 1 backend readiness: %w", err)
		}
		ready, found, err := decodePhase1BackendReady(result.stdout)
		if err != nil {
			return settaruntime.ReadyEvent{}, err
		}
		if found {
			return ready, nil
		}
		if err := resources.requireContainerRunning(readyContext, resources.backendContainer); err != nil {
			return settaruntime.ReadyEvent{}, err
		}
		select {
		case <-ticker.C:
		case <-readyContext.Done():
			return settaruntime.ReadyEvent{}, fmt.Errorf("Phase 1 backend readiness: %w", readyContext.Err())
		}
	}
}

func decodePhase1BackendReady(value string) (settaruntime.ReadyEvent, bool, error) {
	var found *settaruntime.ReadyEvent
	for _, line := range strings.Split(value, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var event settaruntime.ReadyEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil || event.Event != "ready" {
			continue
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
	if found.Addr != net.JoinHostPort("0.0.0.0", phase1BackendPort) ||
		found.ProtocolVersion != httpapi.ProtocolVersion ||
		strings.TrimSpace(found.BootstrapToken) == "" {
		return settaruntime.ReadyEvent{}, false, errors.New("Phase 1 backend emitted an invalid ready event")
	}
	return *found, true, nil
}

func (resources *phase1DockerResources) stopController(ctx context.Context) error {
	if resources == nil || resources.controllerStopped {
		return nil
	}
	resources.controllerStopped = true
	var stopErrors []error
	if resources.containers[resources.backendContainer] {
		if _, err := resources.client.run(
			ctx,
			"container", "stop",
			"--time", strconv.Itoa(phase1ContainerStopTime),
			resources.backendContainer,
		); err != nil {
			stopErrors = append(stopErrors, fmt.Errorf("stop Phase 1 backend container: %w", err))
		}
	}
	if resources.provider != nil {
		if err := resources.provider.close(ctx); err != nil {
			stopErrors = append(stopErrors, err)
		}
		resources.provider = nil
	}
	if resources.containers[resources.agentContainer] {
		if _, err := resources.client.run(
			ctx,
			"container", "stop",
			"--time", strconv.Itoa(phase1ContainerStopTime),
			resources.agentContainer,
		); err != nil {
			stopErrors = append(stopErrors, fmt.Errorf("stop Phase 1 Agent container: %w", err))
		}
	}
	return errors.Join(stopErrors...)
}

func (resources *phase1DockerResources) verify(
	ctx context.Context,
) (evalverifier.Result, error) {
	if !resources.controllerStopped {
		return evalverifier.Result{}, errors.New("Phase 1 controller must stop before hidden verification")
	}
	copyResult, err := resources.copyWorkspaceForVerification(ctx)
	if err != nil {
		return evalverifier.Result{}, err
	}
	if copyResult.Status == volumecopy.StatusInvalidWorkspace {
		return phase1InvalidWorkspaceVerifierResult(copyResult.Detail), nil
	}
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
	); err != nil {
		return evalverifier.Result{}, fmt.Errorf("create Phase 1 verifier container: %w", err)
	}
	resources.containers[resources.verifierContainer] = true
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

func phase1InvalidWorkspaceVerifierResult(detail string) evalverifier.Result {
	return evalverifier.NewResult(
		ScenarioVerifierStraightforward,
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
	resources.containers[resources.copyContainer] = true
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
		return fmt.Errorf("remove Phase 1 container %s: %w", container, err)
	}
	delete(resources.containers, container)
	return nil
}

func (resources *phase1DockerResources) cleanup(ctx context.Context) error {
	if resources == nil {
		return nil
	}
	return errors.Join(
		resources.stopController(ctx),
		resources.cleanupContainers(ctx),
		resources.cleanupVolumes(ctx),
		resources.cleanupNetworks(ctx),
		resources.cleanupImages(ctx),
		resources.fixture.cleanup(),
	)
}

func (resources *phase1DockerResources) cleanupContainers(ctx context.Context) error {
	var cleanupErrors []error
	for container := range resources.containers {
		if err := resources.removeContainer(ctx, container); err != nil {
			cleanupErrors = append(cleanupErrors, err)
		}
	}
	return errors.Join(cleanupErrors...)
}

func (resources *phase1DockerResources) cleanupVolumes(ctx context.Context) error {
	var cleanupErrors []error
	for volume, created := range resources.volumes {
		if !created {
			continue
		}
		if _, err := resources.client.run(ctx, "volume", "rm", volume); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 1 volume %s: %w", volume, err))
			continue
		}
		resources.volumes[volume] = false
	}
	return errors.Join(cleanupErrors...)
}

func (resources *phase1DockerResources) cleanupNetworks(ctx context.Context) error {
	var cleanupErrors []error
	for network, created := range resources.networks {
		if !created {
			continue
		}
		if _, err := resources.client.run(ctx, "network", "rm", network); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 1 network %s: %w", network, err))
			continue
		}
		resources.networks[network] = false
	}
	return errors.Join(cleanupErrors...)
}

func (resources *phase1DockerResources) cleanupImages(ctx context.Context) error {
	if resources.images != nil {
		return resources.images.cleanup(ctx)
	}
	return nil
}

func phase1Tmpfs() string {
	return fmt.Sprintf(
		"/tmp:rw,noexec,nosuid,nodev,size=%d,mode=1777",
		phase1ContainerTmpfsBytes,
	)
}
