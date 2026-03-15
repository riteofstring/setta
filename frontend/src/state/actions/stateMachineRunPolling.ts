import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_state_machine_run } from "utils/generatedEndpoints";

import { loadAgentRuns, receiveAgentRunUpdate } from "./aiAgentRuns";
import { logWorkflowDebug } from "./stateMachineDebug";
import { getRunningStateMachineMachineGroupIds } from "./stateMachineRunQueries";

let stateMachineRunPollSubscriberCount = 0;
let stateMachineRunPollPromise: Promise<void> | null = null;
let visibilityChangeHandlerAttached = false;

function isMachinePollingBrowserReady(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
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
