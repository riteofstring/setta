import { addTemporaryNotification } from "state/actions/notifications";
import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useShareSession,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
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

function markStateMachineRunStoppedForMachineGroup(
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
    const finishedAt = new Date().toISOString();
    const nextRuns = state.agentRuns.map((run) => {
      if (run.id !== targetRunId) {
        return run;
      }
      didChange = true;
      return {
        ...run,
        status: AgentRunStatusEnum.cancelled,
        finishedAt,
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

export function loadStateMachineRuns(): void {
  void loadAgentRuns();
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
    skipDirectRefresh: true,
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
    onSuccess: (data, context) => {
      const stoppedRunId =
        data !== null &&
        typeof data === "object" &&
        "stoppedRunId" in data &&
        typeof data.stoppedRunId === "string"
          ? data.stoppedRunId
          : null;
      markStateMachineRunStoppedForMachineGroup(
        context.projectConfigId,
        context.machineGroupId,
        stoppedRunId,
      );
    },
    skipDirectRefresh: true,
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
