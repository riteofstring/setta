import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_set_watch_code_enabled,
  route_set_watch_code_inputs,
} from "utils/generatedEndpoints";
import type {
  SetWatchCodeEnabledRequest,
  SetWatchCodeInputsRequest,
} from "utils/generatedTypes";

type WatchCodeMutationRouteResponse = ResponseDataAndStatus<null>;

export async function setWatchCodeEnabled(
  payload: SetWatchCodeEnabledRequest,
): Promise<boolean> {
  const response: WatchCodeMutationRouteResponse =
    await route_set_watch_code_enabled(payload);
  return res200(response);
}

export async function setWatchCodeInputs(
  payload: SetWatchCodeInputsRequest,
): Promise<boolean> {
  const response: WatchCodeMutationRouteResponse =
    await route_set_watch_code_inputs(payload);
  return res200(response);
}
