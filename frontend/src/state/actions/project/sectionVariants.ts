import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  deleteJsonSourceFileAndVariant,
  deleteSectionVariantOrAsk as deleteSectionVariantOrAskRequest,
} from "openapi/http";
import type {
  DeleteJSONSourceFileAndVariantRequest,
  DeleteSectionVariantOrAskRequest,
} from "utils/generatedTypes";
type DeleteSectionVariantRouteResponse = ResponseDataAndStatus<string | null>;
type DeleteJSONSourceFileAndVariantRouteResponse = ResponseDataAndStatus<null>;
export async function deleteSectionVariantOrAsk(
  payload: DeleteSectionVariantOrAskRequest,
): Promise<string | null> {
  const response = (await callOpenAPI(
    deleteSectionVariantOrAskRequest({ body: payload } as Parameters<
      typeof deleteSectionVariantOrAskRequest
    >[0]),
  )) as DeleteSectionVariantRouteResponse;
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
  const response = (await callOpenAPI(
    deleteJsonSourceFileAndVariant({ body: payload } as Parameters<
      typeof deleteJsonSourceFileAndVariant
    >[0]),
  )) as DeleteJSONSourceFileAndVariantRouteResponse;
  return res200(response);
}
