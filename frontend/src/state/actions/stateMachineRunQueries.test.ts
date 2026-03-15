import { resetProjectStores } from "state/utils";
import {
  AgentRunStatusEnum,
  createAgentRun,
  createProjectConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";

import { getLatestStateMachineRun } from "./stateMachineRunQueries";

let useProjectState: typeof import("state/definitions").useProjectState;
let useShareSession: typeof import("state/definitions").useShareSession;

describe("stateMachineRunQueries", () => {
  beforeEach(async () => {
    resetProjectStores();
    const definitions = await import("state/definitions");
    useProjectState = definitions.useProjectState;
    useShareSession = definitions.useShareSession;
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
  });

  it("selects the latest state machine run for the requested project and machine group", () => {
    // Selection should ignore other run types and other machine groups.
    const latestRun = getLatestStateMachineRun(
      [
        createAgentRun({
          id: "chat-run",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:00Z",
          inputs: {
            runType: "chat",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
        }),
        createAgentRun({
          id: "other-machine",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:10Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-other",
          },
        }),
        createAgentRun({
          id: "older-machine-run",
          status: AgentRunStatusEnum.completed,
          startedAt: "2024-01-01T00:00:10Z",
          finishedAt: "2024-01-01T00:00:20Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
        }),
        createAgentRun({
          id: "latest-machine-run",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:30Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          events: [
            {
              timestamp: "2024-01-01T00:00:45Z",
              type: "run_heartbeat",
              payload: {},
            },
          ],
        }),
      ],
      "project-1",
      "workflow-main",
    );

    expect(latestRun?.id).toBe("latest-machine-run");
  });

  it("treats a cleared latest workflow run as idle", () => {
    // Reset-cleared runs should hide stale workflow state from the UI.
    const latestRun = getLatestStateMachineRun(
      [
        createAgentRun({
          id: "completed-machine-run",
          status: AgentRunStatusEnum.completed,
          startedAt: "2024-01-01T00:00:10Z",
          finishedAt: "2024-01-01T00:00:20Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          events: [
            {
              timestamp: "2024-01-01T00:00:20Z",
              type: "run_completed",
              payload: {},
            },
          ],
        }),
        createAgentRun({
          id: "reset-machine-run",
          status: AgentRunStatusEnum.cancelled,
          startedAt: "2024-01-01T00:00:30Z",
          finishedAt: "2024-01-01T00:00:31Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          outputs: {
            machineStateCleared: true,
          },
          events: [
            {
              timestamp: "2024-01-01T00:00:31Z",
              type: "run_reset",
              payload: {},
            },
          ],
        }),
      ],
      "project-1",
      "workflow-main",
    );

    expect(latestRun).toBeNull();
  });

  it("selects the latest workflow run only from the current deployment share session", () => {
    // Deployment mode should scope workflow status to the active share session.
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
    });

    const latestRun = getLatestStateMachineRun(
      [
        createAgentRun({
          id: "share-session-2-run",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:40Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
            shareSessionId: "share-session-2",
          },
        }),
        createAgentRun({
          id: "shareless-run",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:35Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
        }),
        createAgentRun({
          id: "share-session-1-run",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:30Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
            shareSessionId: "share-session-1",
          },
        }),
      ],
      "project-1",
      "workflow-main",
    );

    expect(latestRun?.id).toBe("share-session-1-run");
  });
});
