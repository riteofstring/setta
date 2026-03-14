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
import { loadAgentRuns } from "./ai";
import { getCurrProjectConfigId } from "./sectionInfos";
import { logWorkflowDebug } from "./stateMachineDebug";

const STATE_MACHINE_RUN_TYPE = "state_machine";

const RUNNING_MACHINE_STATUSES = new Set<AgentRunStatusEnum>([
  AgentRunStatusEnum.running,
]);

let stateMachineRunPollSubscriberCount = 0;
let stateMachineRunPollIntervalId: number | null = null;
let stateMachineRunPollPromise: Promise<void> | null = null;
let unsubscribeAgentRunPollingStore: (() => void) | null = null;
let unsubscribeProjectConfigPollingStore: (() => void) | null = null;
let visibilityChangeHandlerAttached = false;

function isMachinePollingBrowserReady(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function clearStateMachineRunPollingInterval(): void {
  if (stateMachineRunPollIntervalId === null || typeof window === "undefined") {
    return;
  }
  window.clearInterval(stateMachineRunPollIntervalId);
  stateMachineRunPollIntervalId = null;
}

function isStateMachineRun(run: AgentRun): boolean {
  return getRunInputString(run, "runType") === STATE_MACHINE_RUN_TYPE;
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

function hasRunningStateMachineRunsForProject(
  runs: AgentRun[],
  projectConfigId: string,
): boolean {
  return filterRunsByProjectConfigId(runs, projectConfigId)
    .filter(isStateMachineRun)
    .some((run) => RUNNING_MACHINE_STATUSES.has(run.status));
}

function getRunningStateMachineMachineGroupIds(
  runs: AgentRun[],
  projectConfigId: string,
): string[] {
  const machineGroupIds = new Set<string>();
  for (const run of filterRunsByProjectConfigId(runs, projectConfigId)) {
    if (!isStateMachineRun(run) || isStateMachineRunCleared(run)) {
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

function mergeRefreshedStateMachineRun(updatedRun: AgentRun): void {
  useAIStore.setState((state) => {
    const existingIndex = state.agentRuns.findIndex(
      (candidate) => candidate.id === updatedRun.id,
    );
    if (existingIndex === -1) {
      return {
        agentRuns: [updatedRun, ...state.agentRuns],
      };
    }
    const nextRuns = state.agentRuns.slice();
    nextRuns[existingIndex] = updatedRun;
    return {
      agentRuns: nextRuns,
    };
  });
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
    mergeRefreshedStateMachineRun(res.data);
  }
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

export function resolveStateMachineRunPollIntervalMs({
  hasLoadError,
  hasRunningRuns,
}: {
  hasLoadError: boolean;
  hasRunningRuns: boolean;
}): number {
  if (hasLoadError || hasRunningRuns) {
    return 2500;
  }
  return 20000;
}

function syncStateMachineRunPollingInterval(): void {
  clearStateMachineRunPollingInterval();
  if (!isMachinePollingBrowserReady()) {
    return;
  }
  if (stateMachineRunPollSubscriberCount === 0) {
    return;
  }
  if (document.visibilityState !== "visible") {
    return;
  }
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const aiState = useAIStore.getState();
  const intervalMs = resolveStateMachineRunPollIntervalMs({
    hasLoadError: Boolean(aiState.agentRunsLoadError),
    hasRunningRuns: hasRunningStateMachineRunsForProject(
      aiState.agentRuns,
      projectConfigId,
    ),
  });
  stateMachineRunPollIntervalId = window.setInterval(() => {
    requestStateMachineRunPoll();
  }, intervalMs);
}

function handleStateMachineRunPollingVisibilityChange(): void {
  if (!isMachinePollingBrowserReady()) {
    return;
  }
  if (document.visibilityState !== "visible") {
    clearStateMachineRunPollingInterval();
    return;
  }
  requestStateMachineRunPoll();
  syncStateMachineRunPollingInterval();
}

function attachStateMachineRunPollingInfrastructure(): void {
  if (!isMachinePollingBrowserReady()) {
    return;
  }
  if (unsubscribeAgentRunPollingStore === null) {
    unsubscribeAgentRunPollingStore = useAIStore.subscribe(
      (state) => ({
        agentRuns: state.agentRuns,
        agentRunsLoadError: state.agentRunsLoadError,
      }),
      () => {
        syncStateMachineRunPollingInterval();
      },
    );
  }
  if (unsubscribeProjectConfigPollingStore === null) {
    unsubscribeProjectConfigPollingStore = useProjectState.subscribe(
      (state) => state.projectConfig.id,
      () => {
        syncStateMachineRunPollingInterval();
      },
    );
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
  clearStateMachineRunPollingInterval();
  if (unsubscribeAgentRunPollingStore) {
    unsubscribeAgentRunPollingStore();
    unsubscribeAgentRunPollingStore = null;
  }
  if (unsubscribeProjectConfigPollingStore) {
    unsubscribeProjectConfigPollingStore();
    unsubscribeProjectConfigPollingStore = null;
  }
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
    syncStateMachineRunPollingInterval();
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
    syncStateMachineRunPollingInterval();
  };
}

async function runStateMachineMutation({
  machineGroupId,
  startSectionId,
  failureMessage,
  send,
}: {
  machineGroupId: string;
  startSectionId?: string | null;
  failureMessage: string;
  send: (request: {
    projectConfigId: string;
    machineGroupId: string;
    startSectionId: string | null;
  }) => Promise<{ data: unknown; status: number; hasResponse: boolean }>;
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
  await pollRunningStateMachineRunsForCurrentProject();
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
  });
}
