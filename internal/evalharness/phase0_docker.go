package evalharness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"setta/internal/jsonio"
)

type phase0DockerClient struct {
	command  string
	repoRoot string
}

type phase0DockerResources struct {
	client           phase0DockerClient
	suffix           string
	imageTag         string
	containerName    string
	volumeName       string
	networkName      string
	imageBuilt       bool
	containerCreated bool
	volumeCreated    bool
	networkCreated   bool
	controlRelay     *execServerControlRelay
}

type phase0DockerVersion struct {
	Client struct {
		Version string `json:"Version"`
		OS      string `json:"Os"`
		Arch    string `json:"Arch"`
	} `json:"Client"`
	Server *struct {
		Version string `json:"Version"`
		OS      string `json:"Os"`
		Arch    string `json:"Arch"`
	} `json:"Server"`
}

type phase0DockerInfo struct {
	NCPU        int   `json:"NCPU"`
	MemoryBytes int64 `json:"MemTotal"`
}

type phase0DockerImage struct {
	ID           string `json:"Id"`
	Architecture string `json:"Architecture"`
	OS           string `json:"Os"`
}

type phase0DockerContainer struct {
	Config struct {
		Env          []string            `json:"Env"`
		Entrypoint   []string            `json:"Entrypoint"`
		ExposedPorts map[string]struct{} `json:"ExposedPorts"`
		OpenStdin    bool                `json:"OpenStdin"`
		StdinOnce    bool                `json:"StdinOnce"`
		User         string              `json:"User"`
		WorkingDir   string              `json:"WorkingDir"`
	} `json:"Config"`
	HostConfig struct {
		CapAdd         []string          `json:"CapAdd"`
		CapDrop        []string          `json:"CapDrop"`
		Memory         int64             `json:"Memory"`
		NanoCPUs       int64             `json:"NanoCpus"`
		NetworkMode    string            `json:"NetworkMode"`
		PidsLimit      *int64            `json:"PidsLimit"`
		PortBindings   map[string][]any  `json:"PortBindings"`
		Privileged     bool              `json:"Privileged"`
		ReadonlyRootfs bool              `json:"ReadonlyRootfs"`
		SecurityOpt    []string          `json:"SecurityOpt"`
		Tmpfs          map[string]string `json:"Tmpfs"`
	} `json:"HostConfig"`
	NetworkSettings struct {
		Ports map[string][]any `json:"Ports"`
	} `json:"NetworkSettings"`
	Mounts []struct {
		Destination string `json:"Destination"`
		RW          bool   `json:"RW"`
		Type        string `json:"Type"`
	} `json:"Mounts"`
}

type phase0DockerNetwork struct {
	Internal bool `json:"Internal"`
}

type phase0DockerVolume struct {
	Driver  string            `json:"Driver"`
	Options map[string]string `json:"Options"`
}

type phase0HelperEnvironment struct {
	UID              int      `json:"uid"`
	GID              int      `json:"gid"`
	EnvironmentNames []string `json:"environmentNames"`
}

type phase0HelperBoundary struct {
	Environment         phase0HelperEnvironment `json:"environment"`
	WorkspaceWrite      bool                    `json:"workspaceWrite"`
	RootWriteDenied     bool                    `json:"rootWriteDenied"`
	HostCanaryVisible   bool                    `json:"hostCanaryVisible"`
	FakeEndpointBlocked bool                    `json:"fakeEndpointBlocked"`
}

type phase0HelperFile struct {
	Path   string `json:"path"`
	Bytes  int    `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type phase0HelperWorkspace struct {
	Files []phase0HelperFile `json:"files"`
}

var execServerStdioEntrypoint = []string{
	"/usr/local/bin/codex",
	"exec-server",
	"--strict-config",
	"--listen",
	"stdio://",
}

func inspectPhase0Docker(
	ctx context.Context,
	client phase0DockerClient,
) (Phase0DockerEvidence, error) {
	versionResult, err := client.run(ctx, "version", "--format", "{{json .}}")
	if err != nil {
		if strings.Contains(strings.ToLower(versionResult.stderr), "cannot connect") {
			return Phase0DockerEvidence{}, errors.New("Docker Desktop is stopped or its daemon is unavailable")
		}
		return Phase0DockerEvidence{}, fmt.Errorf("inspect Docker version: %w", err)
	}
	var version phase0DockerVersion
	if err := json.Unmarshal([]byte(versionResult.stdout), &version); err != nil {
		return Phase0DockerEvidence{}, fmt.Errorf("decode Docker version: %w", err)
	}
	if version.Server == nil {
		return Phase0DockerEvidence{}, errors.New("Docker Desktop is stopped or its daemon is unavailable")
	}
	if version.Client.OS != "darwin" || version.Client.Arch != "arm64" {
		return Phase0DockerEvidence{}, fmt.Errorf(
			"Docker client is %s/%s, want darwin/arm64",
			version.Client.OS,
			version.Client.Arch,
		)
	}
	if version.Server.OS != "linux" || !phase0ARM64(version.Server.Arch) {
		return Phase0DockerEvidence{}, fmt.Errorf(
			"Docker server is %s/%s, want linux/arm64",
			version.Server.OS,
			version.Server.Arch,
		)
	}
	infoResult, err := client.run(ctx, "info", "--format", "{{json .}}")
	if err != nil {
		return Phase0DockerEvidence{}, fmt.Errorf("inspect Docker resources: %w", err)
	}
	var info phase0DockerInfo
	if err := json.Unmarshal([]byte(infoResult.stdout), &info); err != nil {
		return Phase0DockerEvidence{}, fmt.Errorf("decode Docker resources: %w", err)
	}
	return Phase0DockerEvidence{
		ClientVersion: version.Client.Version,
		ServerVersion: version.Server.Version,
		ServerOS:      version.Server.OS,
		ServerArch:    version.Server.Arch,
		CPUs:          info.NCPU,
		MemoryBytes:   info.MemoryBytes,
	}, nil
}

func newPhase0DockerResources(client phase0DockerClient, suffix string) *phase0DockerResources {
	base := "setta-eval-phase0-" + suffix
	return &phase0DockerResources{
		client:        client,
		suffix:        suffix,
		imageTag:      base + ":probe",
		containerName: base + "-exec",
		volumeName:    base + "-workspace",
		networkName:   base + "-network",
	}
}

func (resources *phase0DockerResources) buildImage(
	ctx context.Context,
	build phase0PreparedBuild,
) (string, error) {
	// Mark the deterministic tag before invoking Docker so cleanup still tries
	// to remove it if the CLI is interrupted after the daemon creates it.
	resources.imageBuilt = true
	if _, err := resources.client.run(
		ctx,
		"build",
		"--network",
		"none",
		"--platform",
		phase0ImagePlatform,
		"--label",
		"com.setta.eval.phase0="+resources.suffix,
		"--tag",
		resources.imageTag,
		build.contextDir,
	); err != nil {
		return "", fmt.Errorf("build Phase 0 sandbox image: %w", err)
	}
	result, err := resources.client.run(ctx, "image", "inspect", resources.imageTag)
	if err != nil {
		return "", fmt.Errorf("inspect Phase 0 sandbox image: %w", err)
	}
	var images []phase0DockerImage
	if err := json.Unmarshal([]byte(result.stdout), &images); err != nil {
		return "", fmt.Errorf("decode Phase 0 sandbox image: %w", err)
	}
	if len(images) != 1 || images[0].ID == "" {
		return "", fmt.Errorf("Phase 0 sandbox image inspection returned %d images", len(images))
	}
	if images[0].OS != "linux" || !phase0ARM64(images[0].Architecture) {
		return "", fmt.Errorf(
			"Phase 0 sandbox image is %s/%s, want linux/arm64",
			images[0].OS,
			images[0].Architecture,
		)
	}
	return images[0].ID, nil
}

func (resources *phase0DockerResources) start(
	ctx context.Context,
) (Phase0BoundaryEvidence, error) {
	resources.networkCreated = true
	if _, err := resources.client.run(
		ctx,
		"network",
		"create",
		"--driver",
		"bridge",
		"--internal",
		"--label",
		"com.setta.eval.phase0="+resources.suffix,
		resources.networkName,
	); err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("create Phase 0 network: %w", err)
	}
	resources.volumeCreated = true
	if _, err := resources.client.run(
		ctx,
		"volume",
		"create",
		"--driver",
		"local",
		"--opt",
		"type=tmpfs",
		"--opt",
		"device=tmpfs",
		"--opt",
		"o="+phase0WorkspaceVolumeMountOptions(),
		"--label",
		"com.setta.eval.phase0="+resources.suffix,
		resources.volumeName,
	); err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("create Phase 0 workspace volume: %w", err)
	}
	tmpfs := fmt.Sprintf(
		"/tmp:rw,noexec,nosuid,nodev,size=%d,mode=1777",
		phase0ContainerTmpfsBytes,
	)
	resources.containerCreated = true
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--interactive",
		"--pull",
		"never",
		"--name",
		resources.containerName,
		"--platform",
		phase0ImagePlatform,
		"--network",
		resources.networkName,
		"--mount",
		"type=volume,source="+resources.volumeName+",destination="+phase0WorkspaceRoot,
		"--read-only",
		"--tmpfs",
		tmpfs,
		"--user",
		fmt.Sprintf("%d:%d", phase0ContainerUID, phase0ContainerGID),
		"--cap-drop",
		"ALL",
		"--security-opt",
		"no-new-privileges",
		"--pids-limit",
		strconv.Itoa(phase0ContainerPIDs),
		"--memory",
		strconv.FormatInt(phase0ContainerMemory, 10),
		"--cpus",
		"2",
		"--env",
		"HOME=/tmp",
		"--env",
		"LANG=C.UTF-8",
		"--env",
		"PATH=/usr/local/bin:/bin",
		"--env",
		"SHELL=/bin/zsh",
		"--label",
		"com.setta.eval.phase0="+resources.suffix,
		resources.imageTag,
	); err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("start Phase 0 exec-server container: %w", err)
	}
	relay, err := startExecServerControlRelay(ctx, resources.client, resources.containerName, nil)
	if err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("start Phase 0 exec-server control relay: %w", err)
	}
	resources.controlRelay = relay
	return resources.inspectBoundary(ctx)
}

func phase0WorkspaceVolumeMountOptions() string {
	return fmt.Sprintf(
		"size=%d,uid=%d,gid=%d,mode=0755",
		phase0WorkspaceDiskBytes,
		phase0ContainerUID,
		phase0ContainerGID,
	)
}

func (resources *phase0DockerResources) inspectBoundary(
	ctx context.Context,
) (Phase0BoundaryEvidence, error) {
	containerResult, err := resources.client.run(ctx, "container", "inspect", resources.containerName)
	if err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("inspect Phase 0 container: %w", err)
	}
	var containers []phase0DockerContainer
	if err := json.Unmarshal([]byte(containerResult.stdout), &containers); err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("decode Phase 0 container: %w", err)
	}
	if len(containers) != 1 {
		return Phase0BoundaryEvidence{}, fmt.Errorf("Phase 0 container inspection returned %d containers", len(containers))
	}
	container := containers[0]
	if err := validatePhase0Container(container, resources.networkName); err != nil {
		return Phase0BoundaryEvidence{}, err
	}
	networkResult, err := resources.client.run(ctx, "network", "inspect", resources.networkName)
	if err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("inspect Phase 0 network: %w", err)
	}
	var networks []phase0DockerNetwork
	if err := json.Unmarshal([]byte(networkResult.stdout), &networks); err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("decode Phase 0 network: %w", err)
	}
	if len(networks) != 1 || !networks[0].Internal {
		return Phase0BoundaryEvidence{}, errors.New("Phase 0 Docker network is not internal")
	}
	if err := resources.validateWorkspaceVolume(ctx); err != nil {
		return Phase0BoundaryEvidence{}, err
	}
	endpoint := resources.controlRelay.endpointValue()
	environmentNames := environmentNames(container.Config.Env)
	return Phase0BoundaryEvidence{
		ContainerUser:             container.Config.User,
		ReadOnlyRootFilesystem:    container.HostConfig.ReadonlyRootfs,
		WorkspaceDiskLimitBytes:   phase0WorkspaceDiskBytes,
		InternalNetwork:           networks[0].Internal,
		ControlTransport:          execServerControlTransport,
		HostControlAddress:        endpoint.Address,
		ContainerStdioAttached:    container.Config.OpenStdin && !container.Config.StdinOnce,
		HostPortPublicationAbsent: phase0HostPortPublicationAbsent(container),
		MountDestinations:         phase0MountDestinations(container),
		ContainerEnvironmentNames: environmentNames,
		DroppedCapabilities:       sortedUnique(container.HostConfig.CapDrop),
		NoNewPrivileges:           phase0NoNewPrivileges(container.HostConfig.SecurityOpt),
		Privileged:                container.HostConfig.Privileged,
		PIDsLimit:                 *container.HostConfig.PidsLimit,
		MemoryLimitBytes:          container.HostConfig.Memory,
		NanoCPUs:                  container.HostConfig.NanoCPUs,
	}, nil
}

func (resources *phase0DockerResources) validateWorkspaceVolume(ctx context.Context) error {
	result, err := resources.client.run(ctx, "volume", "inspect", resources.volumeName)
	if err != nil {
		return fmt.Errorf("inspect Phase 0 bounded workspace volume: %w", err)
	}
	var volumes []phase0DockerVolume
	if err := json.Unmarshal([]byte(result.stdout), &volumes); err != nil {
		return fmt.Errorf("decode Phase 0 bounded workspace volume: %w", err)
	}
	wantOptions := map[string]string{
		"type":   "tmpfs",
		"device": "tmpfs",
		"o":      phase0WorkspaceVolumeMountOptions(),
	}
	if len(volumes) != 1 || volumes[0].Driver != "local" ||
		len(volumes[0].Options) != len(wantOptions) {
		return errors.New("Phase 0 workspace volume did not retain its local tmpfs disk ceiling")
	}
	for name, value := range wantOptions {
		if volumes[0].Options[name] != value {
			return fmt.Errorf(
				"Phase 0 workspace volume option %s is %q, want %q",
				name,
				volumes[0].Options[name],
				value,
			)
		}
	}
	return nil
}

func validatePhase0Container(container phase0DockerContainer, networkName string) error {
	if err := validatePhase0ContainerIsolation(container, networkName); err != nil {
		return err
	}
	if err := validatePhase0ContainerLimits(container); err != nil {
		return err
	}
	return validatePhase0ContainerFilesystem(container)
}

func validatePhase0ContainerIsolation(container phase0DockerContainer, networkName string) error {
	wantUser := fmt.Sprintf("%d:%d", phase0ContainerUID, phase0ContainerGID)
	if container.Config.User != wantUser || container.Config.WorkingDir != phase0WorkspaceRoot {
		return fmt.Errorf(
			"Phase 0 container user/workdir is %q/%q, want %q/%q",
			container.Config.User,
			container.Config.WorkingDir,
			wantUser,
			phase0WorkspaceRoot,
		)
	}
	if !container.HostConfig.ReadonlyRootfs || container.HostConfig.Privileged {
		return errors.New("Phase 0 container requires a read-only root filesystem and privileged=false")
	}
	if container.HostConfig.NetworkMode != networkName {
		return fmt.Errorf("Phase 0 container uses network %q, want %q", container.HostConfig.NetworkMode, networkName)
	}
	if !containsString(container.HostConfig.CapDrop, "ALL") || len(container.HostConfig.CapAdd) != 0 {
		return errors.New("Phase 0 container must drop all capabilities and add none")
	}
	if !phase0NoNewPrivileges(container.HostConfig.SecurityOpt) {
		return errors.New("Phase 0 container is missing no-new-privileges")
	}
	if err := validateExecServerStdioContainer(container); err != nil {
		return fmt.Errorf("Phase 0 Agent control boundary: %w", err)
	}
	return nil
}

func validateExecServerStdioContainer(container phase0DockerContainer) error {
	if !container.Config.OpenStdin || container.Config.StdinOnce {
		return errors.New("exec-server container must keep one Docker-managed stdin stream open")
	}
	if !slices.Equal(container.Config.Entrypoint, execServerStdioEntrypoint) {
		return fmt.Errorf(
			"exec-server container entrypoint is %q, want %q",
			container.Config.Entrypoint,
			execServerStdioEntrypoint,
		)
	}
	if !phase0HostPortPublicationAbsent(container) {
		return errors.New("exec-server container must not expose or publish a host port")
	}
	return nil
}

func phase0HostPortPublicationAbsent(container phase0DockerContainer) bool {
	return len(container.Config.ExposedPorts) == 0 &&
		len(container.HostConfig.PortBindings) == 0 &&
		len(container.NetworkSettings.Ports) == 0
}

func validatePhase0ContainerLimits(container phase0DockerContainer) error {
	if container.HostConfig.PidsLimit == nil || *container.HostConfig.PidsLimit != phase0ContainerPIDs {
		return errors.New("Phase 0 container has an unexpected process limit")
	}
	if container.HostConfig.Memory != phase0ContainerMemory ||
		container.HostConfig.NanoCPUs != phase0ContainerNanoCPUs {
		return errors.New("Phase 0 container has unexpected CPU or memory limits")
	}
	if _, ok := container.HostConfig.Tmpfs["/tmp"]; !ok {
		return errors.New("Phase 0 container is missing its /tmp tmpfs")
	}
	return nil
}

func validatePhase0ContainerFilesystem(container phase0DockerContainer) error {
	if len(container.Mounts) != 1 ||
		container.Mounts[0].Destination != phase0WorkspaceRoot ||
		container.Mounts[0].Type != "volume" ||
		!container.Mounts[0].RW {
		return errors.New("Phase 0 container must mount only one writable workspace volume")
	}
	return validateEnvironmentNames(environmentNames(container.Config.Env))
}

func (resources *phase0DockerResources) runBoundaryHelper(
	ctx context.Context,
	hostCanary string,
	fakePort string,
) (phase0HelperBoundary, error) {
	result, err := resources.execHelper(
		ctx,
		"boundary",
		"--host-canary",
		hostCanary,
		"--fake-host",
		phase0FakeEndpointHost,
		"--fake-port",
		fakePort,
	)
	if err != nil {
		return phase0HelperBoundary{}, fmt.Errorf("run Phase 0 boundary helper: %w", err)
	}
	var evidence phase0HelperBoundary
	if err := jsonio.DecodeSingle(strings.NewReader(result.stdout), &evidence); err != nil {
		return phase0HelperBoundary{}, fmt.Errorf("decode Phase 0 boundary helper: %w", err)
	}
	if evidence.Environment.UID != phase0ContainerUID || evidence.Environment.GID != phase0ContainerGID {
		return phase0HelperBoundary{}, fmt.Errorf(
			"Phase 0 helper ran as %d:%d, want %d:%d",
			evidence.Environment.UID,
			evidence.Environment.GID,
			phase0ContainerUID,
			phase0ContainerGID,
		)
	}
	if err := validateEnvironmentNames(evidence.Environment.EnvironmentNames); err != nil {
		return phase0HelperBoundary{}, err
	}
	if !evidence.WorkspaceWrite || !evidence.RootWriteDenied ||
		evidence.HostCanaryVisible || !evidence.FakeEndpointBlocked {
		return phase0HelperBoundary{}, errors.New("Phase 0 boundary helper found an unsafe sandbox condition")
	}
	return evidence, nil
}

func (resources *phase0DockerResources) seedWorkspace(ctx context.Context, value string) error {
	_, err := resources.execHelper(ctx, "seed", "--value", value)
	if err != nil {
		return fmt.Errorf("seed Phase 0 workspace: %w", err)
	}
	return nil
}

func (resources *phase0DockerResources) verifyOutput(
	ctx context.Context,
) (phase0HelperFile, error) {
	result, err := resources.execHelper(ctx, "verify-output")
	if err != nil {
		return phase0HelperFile{}, fmt.Errorf("verify Phase 0 model output: %w", err)
	}
	var evidence phase0HelperFile
	if err := jsonio.DecodeSingle(strings.NewReader(result.stdout), &evidence); err != nil {
		return phase0HelperFile{}, fmt.Errorf("decode Phase 0 model output: %w", err)
	}
	return evidence, nil
}

func (resources *phase0DockerResources) workspaceSnapshot(
	ctx context.Context,
) (phase0HelperWorkspace, error) {
	result, err := resources.execHelper(ctx, "snapshot")
	if err != nil {
		return phase0HelperWorkspace{}, fmt.Errorf("snapshot Phase 0 workspace: %w", err)
	}
	var evidence phase0HelperWorkspace
	if err := jsonio.DecodeSingle(strings.NewReader(result.stdout), &evidence); err != nil {
		return phase0HelperWorkspace{}, fmt.Errorf("decode Phase 0 workspace snapshot: %w", err)
	}
	return evidence, nil
}

func (resources *phase0DockerResources) execHelper(
	ctx context.Context,
	args ...string,
) (phase0CommandResult, error) {
	commandArgs := []string{
		"exec",
		resources.containerName,
		"/usr/local/bin/setta-eval-sandbox-helper",
	}
	commandArgs = append(commandArgs, args...)
	return resources.client.run(ctx, commandArgs...)
}

func (resources *phase0DockerResources) cleanup() (Phase0TeardownEvidence, error) {
	evidence := Phase0TeardownEvidence{}
	var cleanupErrors []error
	if resources.controlRelay != nil {
		if err := runPhase0Cleanup(resources.controlRelay.close); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("stop Phase 0 control relay: %w", err))
		} else {
			evidence.ControlRelayStopped = true
			resources.controlRelay = nil
		}
	}
	if resources.containerCreated {
		removed, err := resources.removeDockerResource(
			"container",
			resources.containerName,
			[]string{"container", "rm", "--force", resources.containerName},
			resources.client.containerExists,
		)
		if err != nil {
			cleanupErrors = append(cleanupErrors, err)
		} else {
			evidence.ContainerRemoved = removed
			resources.containerCreated = !removed
		}
	}
	if resources.volumeCreated {
		removed, err := resources.removeDockerResource(
			"volume",
			resources.volumeName,
			[]string{"volume", "rm", resources.volumeName},
			resources.client.volumeExists,
		)
		if err != nil {
			cleanupErrors = append(cleanupErrors, err)
		} else {
			evidence.VolumeRemoved = removed
			resources.volumeCreated = !removed
		}
	}
	if resources.networkCreated {
		removed, err := resources.removeDockerResource(
			"network",
			resources.networkName,
			[]string{"network", "rm", resources.networkName},
			resources.client.networkExists,
		)
		if err != nil {
			cleanupErrors = append(cleanupErrors, err)
		} else {
			evidence.NetworkRemoved = removed
			resources.networkCreated = !removed
		}
	}
	if resources.imageBuilt {
		removed, err := resources.removeDockerResource(
			"image tag",
			resources.imageTag,
			[]string{"image", "rm", resources.imageTag},
			resources.client.imageTagExists,
		)
		if err != nil {
			cleanupErrors = append(cleanupErrors, err)
		} else {
			evidence.ImageTagRemoved = removed
			resources.imageBuilt = !removed
		}
	}
	return evidence, errors.Join(cleanupErrors...)
}

type dockerResourceExistenceCheck func(context.Context, string) (bool, error)

func (resources *phase0DockerResources) removeDockerResource(
	label string,
	name string,
	removeArgs []string,
	exists dockerResourceExistenceCheck,
) (bool, error) {
	removeErr := runPhase0Cleanup(func(ctx context.Context) error {
		_, err := resources.client.run(ctx, removeArgs...)
		return err
	})
	if removeErr == nil {
		return true, nil
	}
	var remaining bool
	inspectErr := runPhase0Cleanup(func(ctx context.Context) error {
		var err error
		remaining, err = exists(ctx, name)
		return err
	})
	if inspectErr != nil {
		return false, errors.Join(
			fmt.Errorf("remove Phase 0 Docker %s %s: %w", label, name, removeErr),
			fmt.Errorf("confirm Phase 0 Docker %s removal: %w", label, inspectErr),
		)
	}
	if remaining {
		return false, fmt.Errorf("remove Phase 0 Docker %s %s: %w", label, name, removeErr)
	}
	return true, nil
}

func (client phase0DockerClient) run(
	ctx context.Context,
	args ...string,
) (phase0CommandResult, error) {
	return runPhase0Command(ctx, client.repoRoot, nil, client.command, args...)
}

func (client phase0DockerClient) containerExists(ctx context.Context, name string) (bool, error) {
	return client.namedResourceExists(
		ctx,
		name,
		"container", "ls", "--all", "--filter", "name="+name, "--format", "{{.Names}}",
	)
}

func (client phase0DockerClient) volumeExists(ctx context.Context, name string) (bool, error) {
	return client.namedResourceExists(
		ctx,
		name,
		"volume", "ls", "--filter", "name="+name, "--format", "{{.Name}}",
	)
}

func (client phase0DockerClient) networkExists(ctx context.Context, name string) (bool, error) {
	return client.namedResourceExists(
		ctx,
		name,
		"network", "ls", "--filter", "name="+name, "--format", "{{.Name}}",
	)
}

func (client phase0DockerClient) imageTagExists(ctx context.Context, name string) (bool, error) {
	return client.namedResourceExists(
		ctx,
		name,
		"image", "ls", "--filter", "reference="+name, "--format", "{{.Repository}}:{{.Tag}}",
	)
}

func (client phase0DockerClient) namedResourceExists(
	ctx context.Context,
	name string,
	args ...string,
) (bool, error) {
	result, err := client.run(ctx, args...)
	if err != nil {
		return false, err
	}
	for _, candidate := range strings.Split(result.stdout, "\n") {
		if strings.TrimSpace(candidate) == name {
			return true, nil
		}
	}
	return false, nil
}

func environmentNames(entries []string) []string {
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		name, _, _ := strings.Cut(entry, "=")
		names = append(names, name)
	}
	return sortedUnique(names)
}

func phase0MountDestinations(container phase0DockerContainer) []string {
	destinations := make([]string, 0, len(container.Mounts)+len(container.HostConfig.Tmpfs))
	for _, mount := range container.Mounts {
		destinations = append(destinations, mount.Destination)
	}
	for destination := range container.HostConfig.Tmpfs {
		destinations = append(destinations, destination)
	}
	return sortedUnique(destinations)
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func phase0NoNewPrivileges(values []string) bool {
	for _, value := range values {
		if value == "no-new-privileges" || value == "no-new-privileges:true" {
			return true
		}
	}
	return false
}

func phase0ARM64(value string) bool {
	return value == "arm64" || value == "aarch64"
}
