import { res200 } from "utils/endpointUtils";
import { route_create_app_session_current } from "utils/generatedEndpoints";
import type { AppDeploymentSessionResponse } from "utils/generatedTypes";

import { useServerMode } from "state/stores/sessionStores";
import {
  clearAppSessionCookie,
  getCachedAppSession,
  hydrateAppSessionFromStorage,
  resetAppSessionState,
  setAppSessionFromResponse,
} from "./appSessionStoredState";

type AppSessionOptions = {
  forceNewSession?: boolean;
};

export async function ensureAppSessionFromCurrentDeployment(
  options: AppSessionOptions = {},
): Promise<AppDeploymentSessionResponse | null> {
  const forceNewSession = options.forceNewSession ?? false;
  if (forceNewSession) {
    resetAppSessionState();
  } else {
    clearAppSessionCookie();
    hydrateAppSessionFromStorage();
  }
  const serverMode = useServerMode.getState();
  if (
    serverMode.modeResolved &&
    serverMode.mode === "app" &&
    !forceNewSession
  ) {
    const cached = getCachedAppSession();
    if (cached) {
      return cached;
    }
  }
  const sessionRes = await route_create_app_session_current();
  if (!res200(sessionRes)) {
    return null;
  }
  const session = sessionRes.data;
  setAppSessionFromResponse(session);
  return session;
}

export async function initializeAppSessionFromCurrentDeployment(
  options: AppSessionOptions = {},
): Promise<boolean> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved && serverMode.mode !== "app") {
    resetAppSessionState();
    return false;
  }
  const session = await ensureAppSessionFromCurrentDeployment(options);
  if (session) {
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    return true;
  }
  if (!serverMode.modeResolved) {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
  }
  resetAppSessionState();
  return false;
}
