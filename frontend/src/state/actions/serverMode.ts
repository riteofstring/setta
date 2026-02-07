import { useServerMode } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_server_mode } from "utils/generatedEndpoints";

export async function initializeServerMode(): Promise<"ide" | "share" | "app"> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved) {
    return serverMode.mode;
  }

  const res = await route_get_server_mode();
  if (!res200(res)) {
    useServerMode.setState({ mode: "ide", modeResolved: true });
    return "ide";
  }
  const mode = res.data.mode;
  useServerMode.setState({ mode, modeResolved: true });
  return mode;
}
