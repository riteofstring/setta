import { res200 } from "utils/endpointUtils";
import { route_create_share_session_current } from "utils/generatedEndpoints";
import type { ShareDeploymentSessionResponse } from "utils/generatedTypes";

import { useServerMode } from "state/stores/sessionStores";
import {
  getCachedShareSession,
  hydrateShareSessionFromStorage,
  resetShareSessionState,
  setShareSessionFromResponse,
} from "./shareSessionStoredState";

type ShareSessionOptions = {
  forceNewSession?: boolean;
};

export async function ensureShareSessionFromCurrentDeployment(
  options: ShareSessionOptions = {},
): Promise<ShareDeploymentSessionResponse | null> {
  const forceNewSession = options.forceNewSession ?? false;
  if (forceNewSession) {
    resetShareSessionState();
  } else {
    hydrateShareSessionFromStorage();
  }
  const serverMode = useServerMode.getState();
  if (
    serverMode.modeResolved &&
    serverMode.mode === "share" &&
    !forceNewSession
  ) {
    const cached = getCachedShareSession();
    if (cached) {
      return cached;
    }
  }
  const sessionRes = await route_create_share_session_current();
  if (!res200(sessionRes)) {
    return null;
  }
  const session = sessionRes.data;
  setShareSessionFromResponse(session);
  return session;
}

export async function initializeShareSessionFromCurrentDeployment(
  options: ShareSessionOptions = {},
): Promise<boolean> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved && serverMode.mode !== "share") {
    resetShareSessionState();
    return false;
  }
  const session = await ensureShareSessionFromCurrentDeployment(options);
  if (session) {
    useServerMode.setState({
      mode: "share",
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
  resetShareSessionState();
  return false;
}
