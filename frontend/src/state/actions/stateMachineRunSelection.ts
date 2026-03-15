import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_state_machine_run } from "utils/generatedEndpoints";
import { AgentRunStatusEnum, type AgentRun } from "utils/generatedTypes";

import {
  filterRunsByProjectConfigId,
  getRunInputString,
  getRunLastUpdatedMs,
} from "./agentRunUtils";
import { loadAgentRuns, receiveAgentRunUpdate } from "./aiAgentRuns";
import { logWorkflowDebug } from "./stateMachineDebug";

const STATE_MACHINE_RUN_TYPE = "state_machine";

const RUNNING_MACHINE_STATUSES = new Set<AgentRunStatusEnum>([
  AgentRunStatusEnum.running,
]);

let stateMachineRunPollSubscriberCount = 0;
let stateMachineRunPollPromise: Promise<void> | null = null;
let visibilityChangeHandlerAttached = false;

function isMachinePollingBrowserReady(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isStateMachineRun(run: AgentRun): boolean {
  return getRunInputString(run, "runType") === STATE_MACHINE_RUN_TYPE;
}

function getCurrentWorkflowShareSessionId(): string | null {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode) {
    return null;
  }
  return shareSession.shareSessionId;
}

function runMatchesCurrentWorkflowShareSession(run: AgentRun): boolean {
  const currentShareSessionId = getCurrentWorkflowShareSessionId();
  const runShareSessionId = getRunInputString(run, "shareSessionId");
  if (
    useShareSession.getState().isDeploymentMode &&
    currentShareSessionId === null
  ) {
    return false;
  }
  return runShareSessionId === currentShareSessionId;
}

function filterStateMachineRunsByMachineGroup(
  runs: AgentRun[],
  projectConfigId: string,
  machineGroupId: string,
): AgentRun[] {
  if (projectConfigId === "" || machineGroupId === "") {
    return [];
  }
  return filterRunsByProjectConfigId(runs, projectConfigId)
    .filter(isStateMachineRun)
    .filter(runMatchesCurrentWorkflowShareSession)
    .filter(
      (run) => getRunInputString(run, "machineGroupId") === machineGroupId,
    )
    .sort(
      (left, right) => getRunLastUpdatedMs(right) - getRunLastUpdatedMs(left),
    );
}

function isStateMachineRunCleared(run: AgentRun): boolean {
  const outputs = run.outputs;
  if (
    outputs === null ||
    typeof outputs !== "object" ||
    Array.isArray(outputs)
  ) {
    return false;
  }
  return outputs.machineStateCleared === true;
}

export function getLatestStateMachineRun(
  runs: AgentRun[],
  projectConfigId: string,
  machineGroupId: string,
): AgentRun | null {
  const latestRun =
    filterStateMachineRunsByMachineGroup(
      runs,
      projectConfigId,
      machineGroupId,
    )[0] ?? null;
  if (latestRun === null || isStateMachineRunCleared(latestRun)) {
    return null;
  }
  return latestRun;
}

function getRunningStateMachineMachineGroupIds(
  runs: AgentRun[],
  projectConfigId: string,
): string[] {
  const machineGroupIds = new Set<string>();
  for (const run of filterRunsByProjectConfigId(runs, projectConfigId)) {
    if (
      !isStateMachineRun(run) ||
      isStateMachineRunCleared(run) ||
      !runMatchesCurrentWorkflowShareSession(run)
    ) {
      continue;
    }
    if (!RUNNING_MACHINE_STATUSES.has(run.status)) {
      continue;
    }
    const machineGroupId = getRunInputString(run, "machineGroupId");
    if (machineGroupId === "") {
      continue;
    }
    machineGroupIds.add(machineGroupId);
  }
  return [...machineGroupIds];
}

async function refreshRunningStateMachineRunsForProject(
  projectConfigId: string,
): Promise<void> {
  const machineGroupIds = getRunningStateMachineMachineGroupIds(
    useAIStore.getState().agentRuns,
    projectConfigId,
  );
  if (machineGroupIds.length === 0) {
    return;
  }
  const refreshResponses = await Promise.all(
    machineGroupIds.map(async (machineGroupId) => {
      const res = await route_get_state_machine_run({
        projectConfigId,
        machineGroupId,
      });
      return { machineGroupId, res };
    }),
  );
  for (const { machineGroupId, res } of refreshResponses) {
    logWorkflowDebug("workflow run refresh response", {
      projectConfigId,
      machineGroupId,
      status: res.status,
      hasResponse: res.hasResponse,
      ok: res200(res),
      errorDetail: res200(res) ? null : getErrorDetail(res.data),
    });
    if (!res200(res)) {
      continue;
    }
    receiveAgentRunUpdate(res.data);
  }
}

export async function pollRunningStateMachineRunsForCurrentProject(): Promise<void> {
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  await loadAgentRuns();
  await refreshRunningStateMachineRunsForProject(projectConfigId);
}

function requestStateMachineRunPoll(): void {
  if (stateMachineRunPollPromise !== null) {
    return;
  }
  stateMachineRunPollPromise = (async () => {
    await pollRunningStateMachineRunsForCurrentProject();
  })().finally(() => {
    stateMachineRunPollPromise = null;
  });
}

function handleStateMachineRunPollingVisibilityChange(): void {
  if (!isMachinePollingBrowserReady()) {
    return;
  }
  if (document.visibilityState !== "visible") {
    return;
  }
  requestStateMachineRunPoll();
}

function attachStateMachineRunPollingInfrastructure(): void {
  if (!isMachinePollingBrowserReady()) {
    return;
  }
  if (!visibilityChangeHandlerAttached) {
    document.addEventListener(
      "visibilitychange",
      handleStateMachineRunPollingVisibilityChange,
    );
    visibilityChangeHandlerAttached = true;
  }
}

function detachStateMachineRunPollingInfrastructure(): void {
  if (visibilityChangeHandlerAttached && typeof document !== "undefined") {
    document.removeEventListener(
      "visibilitychange",
      handleStateMachineRunPollingVisibilityChange,
    );
    visibilityChangeHandlerAttached = false;
  }
}

export function subscribeStateMachineRunPolling(): () => void {
  stateMachineRunPollSubscriberCount += 1;
  if (stateMachineRunPollSubscriberCount === 1) {
    attachStateMachineRunPollingInfrastructure();
    requestStateMachineRunPoll();
  }
  return () => {
    stateMachineRunPollSubscriberCount = Math.max(
      0,
      stateMachineRunPollSubscriberCount - 1,
    );
    if (stateMachineRunPollSubscriberCount === 0) {
      detachStateMachineRunPollingInfrastructure();
      return;
    }
  };
}
