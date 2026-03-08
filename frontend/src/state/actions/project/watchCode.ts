import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { res200 } from "utils/endpointUtils";
import {
  route_get_latest_project_state,
  route_set_watch_code_enabled,
  route_set_watch_code_inputs,
} from "utils/generatedEndpoints";
import type {
  SetWatchCodeEnabledRequestInput,
  SetWatchCodeInputsRequestInput,
} from "utils/generatedTypes";

async function refreshProjectState(projectConfigId: string): Promise<boolean> {
  const latestProjectStateResponse = await route_get_latest_project_state({
    projectConfigId,
  });
  if (!res200(latestProjectStateResponse)) {
    return false;
  }

  processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
  return true;
}

export async function setWatchCodeEnabledAndRefreshProjectState(
  payload: SetWatchCodeEnabledRequestInput,
): Promise<boolean> {
  const response = await route_set_watch_code_enabled(payload);
  if (!res200(response)) {
    return false;
  }

  return await refreshProjectState(payload.projectConfigId);
}

export async function setWatchCodeInputsAndRefreshProjectState(
  payload: SetWatchCodeInputsRequestInput,
): Promise<boolean> {
  const response = await route_set_watch_code_inputs(payload);
  if (!res200(response)) {
    return false;
  }

  return await refreshProjectState(payload.projectConfigId);
}
