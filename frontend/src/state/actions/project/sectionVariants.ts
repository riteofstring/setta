import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_delete_json_source_file_and_variant,
  route_delete_section_variant_or_ask,
  route_get_latest_project_state,
} from "utils/generatedEndpoints";
import type {
  DeleteJSONSourceFileAndVariantRequestInput,
  DeleteSectionVariantOrAskRequestInput,
  DeleteSectionVariantOrAskResponse,
  ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";

type DeleteSectionVariantRouteResponse =
  ResponseDataAndStatus<DeleteSectionVariantOrAskResponse | null>;
type DeleteJSONSourceFileAndVariantRouteResponse = ResponseDataAndStatus<null>;
type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<ProjectStateSingleConfigWithCompletedOpIds>;

async function refreshProjectState(projectConfigId: string): Promise<boolean> {
  const latestProjectStateResponse: LatestProjectStateRouteResponse =
    await route_get_latest_project_state({
      projectConfigId,
    });
  if (!res200(latestProjectStateResponse)) {
    return false;
  }

  processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
  return true;
}

export async function deleteSectionVariantOrAskAndRefreshProjectState(
  payload: DeleteSectionVariantOrAskRequestInput,
): Promise<string | null> {
  const response: DeleteSectionVariantRouteResponse =
    await route_delete_section_variant_or_ask(payload);
  if (!res200(response)) {
    return null;
  }
  if (response.data) {
    return response.data;
  }

  await refreshProjectState(payload.projectConfigId);
  return null;
}

export async function deleteJSONSourceFileAndVariantAndRefreshProjectState(
  payload: DeleteJSONSourceFileAndVariantRequestInput,
): Promise<boolean> {
  const response: DeleteJSONSourceFileAndVariantRouteResponse =
    await route_delete_json_source_file_and_variant(payload);
  if (!res200(response)) {
    return false;
  }

  return await refreshProjectState(payload.projectConfigId);
}
