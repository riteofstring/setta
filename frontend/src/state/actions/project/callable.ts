import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_get_latest_project_state,
  route_set_callable,
} from "utils/generatedEndpoints";
import type {
  ProjectStateSingleConfigWithCompletedOpIds,
  SetCallableRequestInput,
  SetCallableResponse,
} from "utils/generatedTypes";

type SetCallableRouteResponse = ResponseDataAndStatus<SetCallableResponse>;
type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<ProjectStateSingleConfigWithCompletedOpIds>;

export async function setCallableAndRefreshProjectState(
  payload: SetCallableRequestInput,
): Promise<boolean> {
  const setCallableResponse: SetCallableRouteResponse =
    await route_set_callable(payload);
  if (!res200(setCallableResponse)) {
    return false;
  }

  const latestProjectStateResponse: LatestProjectStateRouteResponse =
    await route_get_latest_project_state({
      projectConfigId: payload.projectConfigId,
    });
  if (!res200(latestProjectStateResponse)) {
    return false;
  }

  processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
  return true;
}
