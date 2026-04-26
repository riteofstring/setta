import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  setCallable,
  type SetCallableData,
  type SetCallableResponses,
} from "openapi/http";

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
