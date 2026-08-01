package evalharness

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
)

func (resources *phase1DockerResources) startAgent(
	ctx context.Context,
	abortScenario func(),
) (execServerControlEndpoint, error) {
	tmpfs := phase1Tmpfs()
	resources.containers[resources.agentContainer] = true
	if _, err := resources.client.run(
		ctx,
		"run",
		"--detach",
		"--interactive",
		"--pull", "never",
		"--name", resources.agentContainer,
		"--platform", phase1ImagePlatform,
		"--network", resources.agentNetwork,
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
		return execServerControlEndpoint{}, fmt.Errorf("start Phase 1 Agent exec-server container: %w", err)
	}
	if err := resources.requireContainerRunning(ctx, resources.agentContainer); err != nil {
		return execServerControlEndpoint{}, err
	}
	if err := resources.validateAgentControlBoundary(ctx); err != nil {
		return execServerControlEndpoint{}, err
	}
	relay, err := startExecServerControlRelay(
		ctx,
		resources.client,
		resources.agentContainer,
		abortScenario,
	)
	if err != nil {
		return execServerControlEndpoint{}, fmt.Errorf("start Phase 1 Agent control relay: %w", err)
	}
	resources.controlRelay = relay
	return relay.endpointValue(), nil
}

func (resources *phase1DockerResources) validateAgentControlBoundary(ctx context.Context) error {
	result, err := resources.client.run(ctx, "container", "inspect", resources.agentContainer)
	if err != nil {
		return fmt.Errorf("inspect Phase 1 Agent control boundary: %w", err)
	}
	var containers []phase0DockerContainer
	if err := json.Unmarshal([]byte(result.stdout), &containers); err != nil {
		return fmt.Errorf("decode Phase 1 Agent control boundary: %w", err)
	}
	if len(containers) != 1 {
		return fmt.Errorf("Phase 1 Agent inspection returned %d containers", len(containers))
	}
	container := containers[0]
	if container.HostConfig.NetworkMode != resources.agentNetwork {
		return fmt.Errorf(
			"Phase 1 Agent network is %q, want %q",
			container.HostConfig.NetworkMode,
			resources.agentNetwork,
		)
	}
	if err := validateExecServerStdioContainer(container); err != nil {
		return fmt.Errorf("validate Phase 1 Agent control boundary: %w", err)
	}
	return nil
}
