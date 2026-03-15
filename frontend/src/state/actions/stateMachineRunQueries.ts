import { useShareSession } from "state/definitions";
import { AgentRunStatusEnum, type AgentRun } from "utils/generatedTypes";

import {
  filterRunsByProjectConfigId,
  getRunInputString,
  getRunLastUpdatedMs,
} from "./agentRunUtils";

const STATE_MACHINE_RUN_TYPE = "state_machine";

const RUNNING_MACHINE_STATUSES = new Set<AgentRunStatusEnum>([
  AgentRunStatusEnum.running,
]);

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

export function getRunningStateMachineMachineGroupIds(
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
