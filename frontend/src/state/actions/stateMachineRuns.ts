import { addTemporaryNotification } from "state/actions/notifications";
import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_state_machine_run,
  route_reset_state_machine,
  route_start_state_machine_run,
  route_stop_state_machine_run,
} from "utils/generatedEndpoints";
import {
  AgentRunStatusEnum,
  SettaNotificationTypeEnum,
  type AgentRun,
} from "utils/generatedTypes";
import {
  filterRunsByProjectConfigId,
  getRunInputString,
  getRunLastUpdatedMs,
} from "./agentRunUtils";
import { loadAgentRuns, receiveAgentRunUpdate } from "./ai";
import { getCurrProjectConfigId } from "./sectionInfos";
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

function clearStateMachineRunForMachineGroup(
  projectConfigId: string,
  machineGroupId: string,
  stoppedRunId?: string | null,
): void {
  useAIStore.setState((state) => {
    const matchingRuns = filterStateMachineRunsByMachineGroup(
      state.agentRuns,
      projectConfigId,
      machineGroupId,
    );
    const targetRunId = stoppedRunId?.trim() || matchingRuns[0]?.id || null;
    if (targetRunId === null) {
      return state;
    }

    let didChange = false;
    const nextRuns = state.agentRuns.map((run) => {
      if (run.id !== targetRunId) {
        return run;
      }
      didChange = true;
      const nextOutputs =
        run.outputs !== null &&
        typeof run.outputs === "object" &&
        !Array.isArray(run.outputs)
          ? { ...run.outputs }
          : {};
      nextOutputs.machineStateCleared = true;
      return {
        ...run,
        status: AgentRunStatusEnum.cancelled,
        outputs: nextOutputs,
      };
    });
    if (!didChange) {
      return state;
    }
    return {
      agentRuns: nextRuns,
    };
  });
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

async function refreshStateMachineRunForMachineGroup(
  projectConfigId: string,
  machineGroupId: string,
): Promise<void> {
  const res = await route_get_state_machine_run({
    projectConfigId,
    machineGroupId,
  });
  logWorkflowDebug("workflow run direct refresh response", {
    projectConfigId,
    machineGroupId,
    status: res.status,
    hasResponse: res.hasResponse,
    ok: res200(res),
    errorDetail: res200(res) ? null : getErrorDetail(res.data),
  });
  if (!res200(res)) {
    return;
  }
  receiveAgentRunUpdate(res.data);
}

async function pollRunningStateMachineRunsForCurrentProject(): Promise<void> {
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

async function runStateMachineMutation<TSuccess>({
  machineGroupId,
  startSectionId,
  failureMessage,
  send,
  onSuccess,
  skipDirectRefresh,
}: {
  machineGroupId: string;
  startSectionId?: string | null;
  failureMessage: string;
  send: (request: {
    projectConfigId: string;
    machineGroupId: string;
    startSectionId: string | null;
  }) => Promise<{ data: TSuccess; status: number; hasResponse: boolean }>;
  onSuccess?: (
    data: TSuccess,
    context: {
      projectConfigId: string;
      machineGroupId: string;
    },
  ) => void;
  skipDirectRefresh?: boolean;
}): Promise<boolean> {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const projectConfigId = getCurrProjectConfigId();
  const normalizedMachineGroupId = machineGroupId.trim();
  const normalizedStartSectionId = startSectionId?.trim() ?? null;
  if (
    projectConfigId === NULL_PROJECT_CONFIG_ID ||
    normalizedMachineGroupId === ""
  ) {
    logWorkflowDebug("workflow mutation rejected before request", {
      projectConfigId,
      machineGroupId: normalizedMachineGroupId,
      startSectionId: normalizedStartSectionId,
      failureMessage,
    });
    return false;
  }
  logWorkflowDebug("workflow mutation request", {
    projectConfigId,
    machineGroupId: normalizedMachineGroupId,
    startSectionId: normalizedStartSectionId,
    failureMessage,
  });
  const res = await send({
    projectConfigId,
    machineGroupId: normalizedMachineGroupId,
    startSectionId: normalizedStartSectionId,
  });
  logWorkflowDebug("workflow mutation response", {
    projectConfigId,
    machineGroupId: normalizedMachineGroupId,
    startSectionId: normalizedStartSectionId,
    failureMessage,
    status: res.status,
    hasResponse: res.hasResponse,
    ok: res200(res),
    errorDetail: res200(res) ? null : getErrorDetail(res.data),
  });
  if (!res200(res)) {
    addTemporaryNotification(
      getErrorDetail(res.data) ?? failureMessage,
      SettaNotificationTypeEnum.warning,
    );
    return false;
  }
  onSuccess?.(res.data, {
    projectConfigId,
    machineGroupId: normalizedMachineGroupId,
  });
  if (!skipDirectRefresh) {
    await refreshStateMachineRunForMachineGroup(
      projectConfigId,
      normalizedMachineGroupId,
    );
  }
  return true;
}

export async function startStateMachineRun(
  machineGroupId: string,
  startSectionId: string,
): Promise<boolean> {
  return await runStateMachineMutation({
    machineGroupId,
    startSectionId,
    failureMessage: "Failed to start workflow.",
    send: (request) =>
      route_start_state_machine_run({
        projectConfigId: request.projectConfigId,
        machineGroupId: request.machineGroupId,
        startSectionId: request.startSectionId,
      }),
    onSuccess: receiveAgentRunUpdate,
  });
}

export async function stopStateMachineRun(
  machineGroupId: string,
): Promise<boolean> {
  return await runStateMachineMutation({
    machineGroupId,
    failureMessage: "Failed to stop workflow.",
    send: (request) =>
      route_stop_state_machine_run({
        projectConfigId: request.projectConfigId,
        machineGroupId: request.machineGroupId,
      }),
  });
}

export async function resetStateMachineRun(
  machineGroupId: string,
): Promise<boolean> {
  return await runStateMachineMutation({
    machineGroupId,
    failureMessage: "Failed to reset workflow.",
    send: (request) =>
      route_reset_state_machine({
        projectConfigId: request.projectConfigId,
        machineGroupId: request.machineGroupId,
      }),
    onSuccess: (data, context) => {
      const stoppedRunId =
        data !== null &&
        typeof data === "object" &&
        "stoppedRunId" in data &&
        typeof data.stoppedRunId === "string"
          ? data.stoppedRunId
          : null;
      clearStateMachineRunForMachineGroup(
        context.projectConfigId,
        context.machineGroupId,
        stoppedRunId,
      );
    },
    skipDirectRefresh: true,
  });
}
