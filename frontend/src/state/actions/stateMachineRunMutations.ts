import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID, useShareSession } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_reset_state_machine,
  route_start_state_machine_run,
  route_stop_state_machine_run,
} from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";

import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";
import { logWorkflowDebug } from "./stateMachineDebug";
import { pollRunningStateMachineRunsForCurrentProject } from "./stateMachineRunPolling";

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
