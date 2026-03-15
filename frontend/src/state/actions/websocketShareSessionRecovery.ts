import { addTemporaryNotification } from "state/actions/notifications";
import { useServerMode, useShareSession } from "state/stores/sessionStores";
import { initializeAppSessionFromCurrentDeployment } from "./appSessionBootstrap";
import { resetAppSessionState } from "./appSessionStoredState";
import {
  initializeShareSessionFromCurrentDeployment,
  resetShareSessionState,
} from "./share";

export const SHARE_SESSION_MISSING_CODE = 4400;
export const SHARE_SESSION_UNKNOWN_CODE = 4404;

const SHARE_HEARTBEAT_INTERVAL_MS = 30000;
const SHARE_SESSION_RECOVERY_MAX_ATTEMPTS = 1;

let shareHeartbeatTimer: number | null = null;
let shareSessionRecoveryAttempts = 0;
let shareSessionRecoveryInFlight = false;

export function startShareHeartbeat({
  getCurrentAddress,
  getCurrentShareSessionId,
  isSocketReady,
  sendCurrentAddress,
}: {
  getCurrentAddress: () => string | null;
  getCurrentShareSessionId: () => string | null;
  isSocketReady: () => boolean;
  sendCurrentAddress: (currentAddress: string) => void;
}): void {
  stopShareHeartbeat();
  shareHeartbeatTimer = window.setInterval(() => {
    if (getCurrentShareSessionId() === null || !isSocketReady()) {
      return;
    }
    const currentAddress = getCurrentAddress();
    if (!currentAddress) {
      return;
    }
    sendCurrentAddress(currentAddress);
  }, SHARE_HEARTBEAT_INTERVAL_MS);
}

export function stopShareHeartbeat(): void {
  if (shareHeartbeatTimer === null) {
    return;
  }
  window.clearInterval(shareHeartbeatTimer);
  shareHeartbeatTimer = null;
}

export function isShareSessionRecoveryCloseCode(code: number): boolean {
  return (
    code === SHARE_SESSION_MISSING_CODE || code === SHARE_SESSION_UNKNOWN_CODE
  );
}

export async function handleShareSessionRecovery(): Promise<void> {
  if (shareSessionRecoveryInFlight) {
    return;
  }
  const shareSession = useShareSession.getState();
  const serverMode = useServerMode.getState();
  const isAppMode =
    shareSession.deploymentMode === "app" || serverMode.mode === "app";
  const expiredMessage = isAppMode
    ? "App session expired. Refresh to continue."
    : "Share session expired. Refresh to continue.";
  if (shareSessionRecoveryAttempts >= SHARE_SESSION_RECOVERY_MAX_ATTEMPTS) {
    resetRecoveredSessionState(isAppMode);
    addTemporaryNotification(expiredMessage);
    return;
  }
  shareSessionRecoveryInFlight = true;
  shareSessionRecoveryAttempts += 1;
  const recovered = isAppMode
    ? await initializeAppSessionFromCurrentDeployment({
        forceNewSession: true,
      })
    : await initializeShareSessionFromCurrentDeployment({
        forceNewSession: true,
      });
  shareSessionRecoveryInFlight = false;
  if (!recovered) {
    resetRecoveredSessionState(isAppMode);
    addTemporaryNotification(expiredMessage);
    return;
  }
  shareSessionRecoveryAttempts = 0;
}

function resetRecoveredSessionState(isAppMode: boolean): void {
  if (isAppMode) {
    resetAppSessionState();
    return;
  }
  resetShareSessionState();
}
