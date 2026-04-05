import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_delete_json_source_file_and_variant,
  route_delete_section_variant_or_ask,
} from "utils/generatedEndpoints";
import type {
  DeleteJSONSourceFileAndVariantRequest,
  DeleteSectionVariantOrAskRequest,
  DeleteSectionVariantOrAskResponse,
} from "utils/generatedTypes";

type DeleteSectionVariantRouteResponse =
  ResponseDataAndStatus<DeleteSectionVariantOrAskResponse | null>;
type DeleteJSONSourceFileAndVariantRouteResponse = ResponseDataAndStatus<null>;

export async function deleteSectionVariantOrAsk(
  payload: DeleteSectionVariantOrAskRequest,
): Promise<string | null> {
  const response: DeleteSectionVariantRouteResponse =
    await route_delete_section_variant_or_ask(payload);
  if (!res200(response)) {
    return null;
  }
  if (response.data) {
    return response.data;
  }
  return null;
}

export async function deleteJSONSourceFileAndVariant(
  payload: DeleteJSONSourceFileAndVariantRequest,
): Promise<boolean> {
  const response: DeleteJSONSourceFileAndVariantRouteResponse =
    await route_delete_json_source_file_and_variant(payload);
  return res200(response);
}
