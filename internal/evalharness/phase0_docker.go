package evalharness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
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
		Env        []string `json:"Env"`
		Entrypoint []string `json:"Entrypoint"`
		User       string   `json:"User"`
		WorkingDir string   `json:"WorkingDir"`
	} `json:"Config"`
	HostConfig struct {
		CapAdd         []string          `json:"CapAdd"`
		CapDrop        []string          `json:"CapDrop"`
		Memory         int64             `json:"Memory"`
		NanoCPUs       int64             `json:"NanoCpus"`
		NetworkMode    string            `json:"NetworkMode"`
		PidsLimit      *int64            `json:"PidsLimit"`
		Privileged     bool              `json:"Privileged"`
		ReadonlyRootfs bool              `json:"ReadonlyRootfs"`
		SecurityOpt    []string          `json:"SecurityOpt"`
		Tmpfs          map[string]string `json:"Tmpfs"`
	} `json:"HostConfig"`
	Mounts []struct {
		Destination string `json:"Destination"`
		RW          bool   `json:"RW"`
		Type        string `json:"Type"`
	} `json:"Mounts"`
}

type phase0DockerNetwork struct {
	Internal bool `json:"Internal"`
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
	resources.imageBuilt = true
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
	resources.networkCreated = true
	if _, err := resources.client.run(
		ctx,
		"volume",
		"create",
		"--label",
		"com.setta.eval.phase0="+resources.suffix,
		resources.volumeName,
	); err != nil {
		return Phase0BoundaryEvidence{}, fmt.Errorf("create Phase 0 workspace volume: %w", err)
	}
	resources.volumeCreated = true
	tmpfs := fmt.Sprintf(
		"/tmp:rw,noexec,nosuid,nodev,size=%d,mode=1777",
		phase0ContainerTmpfsBytes,
	)
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--pull",
		"never",
		"--name",
		resources.containerName,
		"--platform",
		phase0ImagePlatform,
		"--network",
		resources.networkName,
		"--publish",
		"127.0.0.1::"+phase0ExecServerPort+"/tcp",
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
	resources.containerCreated = true
	return resources.inspectBoundary(ctx)
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
	address, err := resources.publishedAddress(ctx)
	if err != nil {
		return Phase0BoundaryEvidence{}, err
	}
	environmentNames := environmentNames(container.Config.Env)
	return Phase0BoundaryEvidence{
		ContainerUser:             container.Config.User,
		ReadOnlyRootFilesystem:    container.HostConfig.ReadonlyRootfs,
		InternalNetwork:           networks[0].Internal,
		PublishedControlAddress:   address,
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
	return nil
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

func (resources *phase0DockerResources) publishedAddress(ctx context.Context) (string, error) {
	result, err := resources.client.run(
		ctx,
		"port",
		resources.containerName,
		phase0ExecServerPort+"/tcp",
	)
	if err != nil {
		return "", fmt.Errorf("read Phase 0 control port: %w", err)
	}
	host, port, err := net.SplitHostPort(strings.TrimSpace(result.stdout))
	if err != nil {
		return "", fmt.Errorf("parse Phase 0 control address %q: %w", result.stdout, err)
	}
	if host != "127.0.0.1" || strings.TrimSpace(port) == "" {
		return "", fmt.Errorf("Phase 0 control address is %q, want host loopback", result.stdout)
	}
	return net.JoinHostPort(host, port), nil
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
	if err := json.Unmarshal([]byte(result.stdout), &evidence); err != nil {
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
	if err := json.Unmarshal([]byte(result.stdout), &evidence); err != nil {
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
	if err := json.Unmarshal([]byte(result.stdout), &evidence); err != nil {
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

func (resources *phase0DockerResources) cleanup(
	ctx context.Context,
) (Phase0TeardownEvidence, error) {
	evidence := Phase0TeardownEvidence{}
	var cleanupErrors []error
	if resources.containerCreated {
		_, err := resources.client.run(ctx, "container", "rm", "--force", resources.containerName)
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 0 container: %w", err))
		} else {
			evidence.ContainerRemoved = true
			resources.containerCreated = false
		}
	}
	if resources.volumeCreated {
		_, err := resources.client.run(ctx, "volume", "rm", resources.volumeName)
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 0 volume: %w", err))
		} else {
			evidence.VolumeRemoved = true
			resources.volumeCreated = false
		}
	}
	if resources.networkCreated {
		_, err := resources.client.run(ctx, "network", "rm", resources.networkName)
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 0 network: %w", err))
		} else {
			evidence.NetworkRemoved = true
			resources.networkCreated = false
		}
	}
	if resources.imageBuilt {
		_, err := resources.client.run(ctx, "image", "rm", resources.imageTag)
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove Phase 0 image tag: %w", err))
		} else {
			evidence.ImageTagRemoved = true
			resources.imageBuilt = false
		}
	}
	return evidence, errors.Join(cleanupErrors...)
}

func (client phase0DockerClient) run(
	ctx context.Context,
	args ...string,
) (phase0CommandResult, error) {
	return runPhase0Command(ctx, client.repoRoot, nil, client.command, args...)
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
