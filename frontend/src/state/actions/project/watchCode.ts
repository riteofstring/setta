import {
  setWatchCodeEnabled as setWatchCodeEnabledRequest,
  setWatchCodeInputs as setWatchCodeInputsRequest,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import type {
  SetWatchCodeEnabledRequest,
  SetWatchCodeInputsRequest,
} from "utils/generatedTypes";
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
