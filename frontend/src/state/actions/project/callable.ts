import { setCallable, type SetCallableData } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import type { SetCallableResponse } from "utils/generatedTypes";

type SetCallableRequest = SetCallableData["body"];

type SetCallableRouteResponse = ResponseDataAndStatus<SetCallableResponse>;
export async function setCallableAndRefreshProjectState(
  payload: SetCallableRequest,
): Promise<boolean> {
  const setCallableResponse = (await callOpenAPI(
    setCallable({ body: payload } as Parameters<typeof setCallable>[0]),
  )) as SetCallableRouteResponse;
  return res200(setCallableResponse);
}
