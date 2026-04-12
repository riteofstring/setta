import {
  resetStateMachine as apiResetStateMachine,
  startStateMachineRun as apiStartStateMachineRun,
  stopStateMachineRun as apiStopStateMachineRun,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useShareSession,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  NotificationTypeEnum,
  RunStatusEnum,
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
        status: RunStatusEnum.cancelled,
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
        status: RunStatusEnum.cancelled,
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
type StateMachineMutationRequest = {
  projectConfigId: string;
  machineGroupId: string;
  startSectionId: string | null;
};
type StateMachineMutationContext = StateMachineMutationRequest & {
  failureMessage: string;
};
type StateMachineMutationResponse<TSuccess> = {
  data: TSuccess;
  status: number;
  hasResponse: boolean;
};
function resolveStateMachineMutationContext({
  machineGroupId,
  startSectionId,
  failureMessage,
}: {
  machineGroupId: string;
  startSectionId?: string | null;
  failureMessage: string;
}): StateMachineMutationContext | null {
  if (useShareSession.getState().isDeploymentMode) {
    return null;
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
    return null;
  }
  return {
    projectConfigId,
    machineGroupId: normalizedMachineGroupId,
    startSectionId: normalizedStartSectionId,
    failureMessage,
  };
}
function logStateMachineMutationRequest(
  context: StateMachineMutationContext,
): void {
  logWorkflowDebug("workflow mutation request", context);
}
function logStateMachineMutationResponse<TSuccess>(
  context: StateMachineMutationContext,
  response: StateMachineMutationResponse<TSuccess>,
): void {
  logWorkflowDebug("workflow mutation response", {
    ...context,
    status: response.status,
    hasResponse: response.hasResponse,
    ok: res200(response),
    errorDetail: res200(response) ? null : getErrorDetail(response.data),
  });
}
async function finalizeStateMachineMutationSuccess<TSuccess>(
  context: StateMachineMutationContext,
  data: TSuccess,
  onSuccess:
    | ((
        data: TSuccess,
        context: {
          projectConfigId: string;
          machineGroupId: string;
        },
      ) => void)
    | undefined,
  skipDirectRefresh: boolean,
): Promise<boolean> {
  onSuccess?.(data, {
    projectConfigId: context.projectConfigId,
    machineGroupId: context.machineGroupId,
  });
  if (skipDirectRefresh) {
    return true;
  }
  await refreshStateMachineRunForMachineGroup(
    context.projectConfigId,
    context.machineGroupId,
  );
  return true;
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
  }) => Promise<StateMachineMutationResponse<TSuccess>>;
  onSuccess?: (
    data: TSuccess,
    context: {
      projectConfigId: string;
      machineGroupId: string;
    },
  ) => void;
  skipDirectRefresh?: boolean;
}): Promise<boolean> {
  const context = resolveStateMachineMutationContext({
    machineGroupId,
    startSectionId,
    failureMessage,
  });
  if (context === null) {
    return false;
  }
  logStateMachineMutationRequest(context);
  const res = await send(context);
  logStateMachineMutationResponse(context, res);
  if (!res200(res)) {
    addTemporaryNotification(
      getErrorDetail(res.data) ?? failureMessage,
      NotificationTypeEnum.warning,
    );
    return false;
  }
  return await finalizeStateMachineMutationSuccess(
    context,
    res.data,
    onSuccess,
    skipDirectRefresh ?? false,
  );
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
      callOpenAPI(
        apiStartStateMachineRun({
          body: {
            projectConfigId: request.projectConfigId,
            machineGroupId: request.machineGroupId,
            startSectionId: request.startSectionId,
          },
        } as Parameters<typeof apiStartStateMachineRun>[0]),
      ),
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
      callOpenAPI(
        apiStopStateMachineRun({
          body: {
            projectConfigId: request.projectConfigId,
            machineGroupId: request.machineGroupId,
          },
        } as Parameters<typeof apiStopStateMachineRun>[0]),
      ),
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
      callOpenAPI(
        apiResetStateMachine({
          body: {
            projectConfigId: request.projectConfigId,
            machineGroupId: request.machineGroupId,
          },
        } as Parameters<typeof apiResetStateMachine>[0]),
      ),
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
