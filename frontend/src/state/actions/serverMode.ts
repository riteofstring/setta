import { getServerMode, type HttpapiServerModeResponse } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useServerMode } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
type ServerModeRouteResponse = ResponseDataAndStatus<HttpapiServerModeResponse>;
export async function initializeServerMode(): Promise<
  "ide" | "share" | "app" | "launcher" | null
> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved) {
    return serverMode.mode;
  }
  const res = (await callOpenAPI(getServerMode())) as ServerModeRouteResponse;
  if (!res200(res)) {
    const message = res.hasResponse
      ? `Failed to check server mode (status ${res.status}).`
      : "Failed to check server mode (network error).";
    useServerMode.setState({
      mode: null,
      modeResolved: true,
      modeError: message,
    });
    return null;
  }
  const mode = res.data.mode;
  useServerMode.setState({ mode, modeResolved: true, modeError: null });
  return mode;
}
