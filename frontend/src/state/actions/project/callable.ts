import {
  setCallable,
  type SetCallableData,
  type SetCallableResponses,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";

type SetCallableRequest = SetCallableData["body"];

type SetCallableRouteResponse = ResponseDataAndStatus<
  SetCallableResponses[200]
>;
export async function setCallableAndRefreshProjectState(
  payload: SetCallableRequest,
): Promise<boolean> {
  const setCallableResponse = (await callOpenAPI(
    setCallable({ body: payload } as Parameters<typeof setCallable>[0]),
  )) as SetCallableRouteResponse;
  return res200(setCallableResponse);
}
