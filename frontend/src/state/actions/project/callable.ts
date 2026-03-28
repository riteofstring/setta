import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import { route_set_callable } from "utils/generatedEndpoints";
import type {
  SetCallableRequestInput,
  SetCallableResponse,
} from "utils/generatedTypes";

type SetCallableRouteResponse = ResponseDataAndStatus<SetCallableResponse>;

export async function setCallableAndRefreshProjectState(
  payload: SetCallableRequestInput,
): Promise<boolean> {
  const setCallableResponse: SetCallableRouteResponse =
    await route_set_callable(payload);
  return res200(setCallableResponse);
}
