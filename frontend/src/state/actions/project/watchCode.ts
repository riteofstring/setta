import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  setWatchCodeEnabled as setWatchCodeEnabledRequest,
  setWatchCodeInputs as setWatchCodeInputsRequest,
  type SetWatchCodeEnabledData,
  type SetWatchCodeInputsData,
} from "openapi/http";

type SetWatchCodeEnabledRequest = SetWatchCodeEnabledData["body"];
type SetWatchCodeInputsRequest = SetWatchCodeInputsData["body"];

type WatchCodeMutationRouteResponse = ResponseDataAndStatus<null>;
export async function setWatchCodeEnabled(
  payload: SetWatchCodeEnabledRequest,
): Promise<boolean> {
  const response = (await callOpenAPI(
    setWatchCodeEnabledRequest({ body: payload } as Parameters<
      typeof setWatchCodeEnabledRequest
    >[0]),
  )) as WatchCodeMutationRouteResponse;
  return res200(response);
}
export async function setWatchCodeInputs(
  payload: SetWatchCodeInputsRequest,
): Promise<boolean> {
  const response = (await callOpenAPI(
    setWatchCodeInputsRequest({ body: payload } as Parameters<
      typeof setWatchCodeInputsRequest
    >[0]),
  )) as WatchCodeMutationRouteResponse;
  return res200(response);
}
