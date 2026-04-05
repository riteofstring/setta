import { resetProjectStores } from "state/utils";
import {
  route_reset_state_machine,
  route_start_state_machine_run,
  route_stop_state_machine_run,
} from "utils/generatedEndpoints";
import {
  AgentRunStatusEnum,
  NotificationTypeEnum,
  createAgentRun,
  createProjectConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAgentRuns } from "./ai";
import { addTemporaryNotification } from "./notifications";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_start_state_machine_run: vi.fn(),
    route_stop_state_machine_run: vi.fn(),
    route_reset_state_machine: vi.fn(),
  };
});

vi.mock("./ai", async () => {
  const actual = await vi.importActual<typeof import("./ai")>("./ai");
  return {
    ...actual,
    loadAgentRuns: vi.fn(),
  };
});

vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteStartStateMachineRun = vi.mocked(
  route_start_state_machine_run,
);
const mockedRouteStopStateMachineRun = vi.mocked(route_stop_state_machine_run);
const mockedRouteResetStateMachine = vi.mocked(route_reset_state_machine);
const mockedLoadAgentRuns = vi.mocked(loadAgentRuns);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

let useProjectState: typeof import("state/definitions").useProjectState;
let useAIStore: typeof import("state/definitions").useAIStore;
let useShareSession: typeof import("state/definitions").useShareSession;
let getLatestStateMachineRun: typeof import("./stateMachineRuns").getLatestStateMachineRun;
let loadStateMachineRuns: typeof import("./stateMachineRuns").loadStateMachineRuns;
let startStateMachineRun: typeof import("./stateMachineRuns").startStateMachineRun;
let stopStateMachineRun: typeof import("./stateMachineRuns").stopStateMachineRun;
let resetStateMachineRun: typeof import("./stateMachineRuns").resetStateMachineRun;

describe("stateMachineRuns", () => {
  beforeEach(async () => {
    resetProjectStores();
    vi.clearAllMocks();
    const definitions = await import("state/definitions");
    useProjectState = definitions.useProjectState;
    useAIStore = definitions.useAIStore;
    useShareSession = definitions.useShareSession;
    const stateMachineRuns = await import("./stateMachineRuns");
    getLatestStateMachineRun = stateMachineRuns.getLatestStateMachineRun;
    loadStateMachineRuns = stateMachineRuns.loadStateMachineRuns;
    startStateMachineRun = stateMachineRuns.startStateMachineRun;
    stopStateMachineRun = stateMachineRuns.stopStateMachineRun;
    resetStateMachineRun = stateMachineRuns.resetStateMachineRun;

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useAIStore.setState({
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: null,
    });
    useShareSession.setState({ isDeploymentMode: false });
    mockedLoadAgentRuns.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetProjectStores();
  });

  it("selects the latest state machine run for the requested project and machine group", () => {
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

  it("treats a reset-cleared latest workflow run as idle", () => {
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

  it("loads agent runs once for workflow views and relies on websocket updates afterward", () => {
    loadStateMachineRuns();

    expect(mockedLoadAgentRuns).toHaveBeenCalledTimes(1);
  });

  it("starts a workflow from the mutation response without refetching", async () => {
    mockedRouteStartStateMachineRun.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createAgentRun({
        id: "machine-run-1",
        status: AgentRunStatusEnum.running,
        inputs: {
          runType: "state_machine",
          projectConfigId: "project-1",
          machineGroupId: "workflow-main",
          startSectionId: "section-start",
        },
      }),
    });

    const started = await startStateMachineRun(
      "workflow-main",
      "section-start",
    );

    expect(started).toBe(true);
    expect(mockedRouteStartStateMachineRun).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
      startSectionId: "section-start",
    });
    expect(
      useAIStore.getState().agentRuns.find((run) => run.id === "machine-run-1"),
    ).toMatchObject({
      id: "machine-run-1",
      status: AgentRunStatusEnum.running,
      inputs: {
        runType: "state_machine",
        projectConfigId: "project-1",
        machineGroupId: "workflow-main",
      },
    });
    expect(mockedLoadAgentRuns).not.toHaveBeenCalled();
  });

  it("stops a workflow locally and skips the redundant refresh fetch", async () => {
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "machine-run-1",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:00Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
        }),
      ],
    });
    mockedRouteStopStateMachineRun.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        alreadyStopped: false,
        stoppedRunId: "machine-run-1",
      },
    });

    const stopped = await stopStateMachineRun("workflow-main");

    expect(stopped).toBe(true);
    expect(mockedRouteStopStateMachineRun).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
    });
    const stoppedRun = useAIStore
      .getState()
      .agentRuns.find((run) => run.id === "machine-run-1");
    expect(stoppedRun).toMatchObject({
      id: "machine-run-1",
      status: AgentRunStatusEnum.cancelled,
    });
    expect(stoppedRun?.finishedAt).toEqual(expect.any(String));
    expect(mockedLoadAgentRuns).not.toHaveBeenCalled();
  });

  it("surfaces backend stop failures without refreshing runs", async () => {
    mockedRouteStopStateMachineRun.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: { detail: "machine group missing" },
    });

    const stopped = await stopStateMachineRun("workflow-main");

    expect(stopped).toBe(false);
    expect(mockedLoadAgentRuns).not.toHaveBeenCalled();
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "machine group missing",
      NotificationTypeEnum.warning,
    );
  });

  it("resets a workflow with the current project scope", async () => {
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "machine-run-2",
          status: AgentRunStatusEnum.running,
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
        }),
      ],
    });
    mockedRouteResetStateMachine.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        alreadyStopped: false,
        stoppedRunId: "machine-run-2",
      },
    });

    const reset = await resetStateMachineRun("workflow-main");

    expect(reset).toBe(true);
    expect(mockedRouteResetStateMachine).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
    });
    expect(
      useAIStore.getState().agentRuns.find((run) => run.id === "machine-run-2"),
    ).toMatchObject({
      id: "machine-run-2",
      status: AgentRunStatusEnum.cancelled,
      outputs: {
        machineStateCleared: true,
      },
    });
    expect(mockedLoadAgentRuns).not.toHaveBeenCalled();
  });

  it("does not dispatch workflow mutations in deployment mode", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
    });

    await expect(
      startStateMachineRun("workflow-main", "section-start"),
    ).resolves.toBe(false);
    await expect(stopStateMachineRun("workflow-main")).resolves.toBe(false);
    await expect(resetStateMachineRun("workflow-main")).resolves.toBe(false);

    expect(mockedRouteStartStateMachineRun).not.toHaveBeenCalled();
    expect(mockedRouteStopStateMachineRun).not.toHaveBeenCalled();
    expect(mockedRouteResetStateMachine).not.toHaveBeenCalled();
    expect(mockedLoadAgentRuns).not.toHaveBeenCalled();
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });
});
