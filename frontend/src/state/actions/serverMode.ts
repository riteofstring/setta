import { useServerMode } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_server_mode } from "utils/generatedEndpoints";

let pendingServerModeInitialization: Promise<
  "ide" | "share" | "app" | "launcher" | null
> | null = null;

export async function initializeServerMode(): Promise<
  "ide" | "share" | "app" | "launcher" | null
> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved) {
    return serverMode.mode;
  }

  if (pendingServerModeInitialization) {
    return pendingServerModeInitialization;
  }

  pendingServerModeInitialization = (async () => {
    const res = await route_get_server_mode();
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
  })();

  try {
    return await pendingServerModeInitialization;
  } finally {
    pendingServerModeInitialization = null;
  }
}
