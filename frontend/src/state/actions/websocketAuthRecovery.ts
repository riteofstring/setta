import { addTemporaryNotification } from "state/actions/notifications";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200 } from "utils/endpointUtils";
import { route_get_auth_refresh_status } from "utils/generatedEndpoints";
import { RouteEnum } from "utils/generatedTypes";
import { websocketTransportState, wssReady } from "./websocketRuntime";

export const AUTH_CLOSE_CODE = 4401;

const BOOTSTRAP_URL = `${C_ADDRESSES.BACKEND_ORIGIN}${RouteEnum.BOOTSTRAP_PAGE}`;
const AUTH_RECOVERY_INTERVAL_MS = 2000;
const DEFAULT_AUTH_REFRESH_WINDOW_SECONDS =
  C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS;

let authLost = false;
let authRecoveryTimer: number | null = null;
let authRecoveryInFlight = false;
let authRefreshTimer: number | null = null;
let authRefreshInFlight = false;
let authRefreshWindowSeconds = DEFAULT_AUTH_REFRESH_WINDOW_SECONDS;
let authRefreshIntervalMs = getAuthRefreshIntervalMs(
  DEFAULT_AUTH_REFRESH_WINDOW_SECONDS,
);

type ReconnectTarget = {
  pathname: string;
  shareSessionId: string | null;
};

export function authRecoveryBlocked(): boolean {
  return authLost;
}

export function handleAuthSocketClose({
  pathname,
  reconnectSocket,
  getReconnectTarget,
}: {
  pathname: string;
  reconnectSocket: (pathname: string, shareSessionId?: string | null) => void;
  getReconnectTarget: () => ReconnectTarget;
}): void {
  authLost = true;
  addTemporaryNotification(
    `Authentication required. Open ${BOOTSTRAP_URL} to continue.`,
  );
  scheduleAuthRecovery({
    pathname,
    reconnectSocket,
    getReconnectTarget,
  });
}

export function stopAuthRefresh(): void {
  if (authRefreshTimer === null) {
    return;
  }
  window.clearInterval(authRefreshTimer);
  authRefreshTimer = null;
}

export function startAuthRefresh({
  runImmediately,
}: {
  runImmediately: boolean;
}): void {
  stopAuthRefresh();
  if (authLost) {
    return;
  }
  if (runImmediately) {
    void runAuthRefresh();
  }
  authRefreshTimer = window.setInterval(() => {
    void runAuthRefresh();
  }, authRefreshIntervalMs);
}

function clearAuthRecoveryTimer(): void {
  if (authRecoveryTimer === null) {
    return;
  }
  window.clearTimeout(authRecoveryTimer);
  authRecoveryTimer = null;
}

function scheduleAuthRecovery({
  pathname,
  reconnectSocket,
  getReconnectTarget,
}: {
  pathname: string;
  reconnectSocket: (pathname: string, shareSessionId?: string | null) => void;
  getReconnectTarget: () => ReconnectTarget;
}): void {
  if (!authLost) {
    return;
  }
  stopAuthRefresh();
  if (authRecoveryTimer !== null) {
    return;
  }
  authRecoveryTimer = window.setTimeout(() => {
    authRecoveryTimer = null;
    void attemptAuthRecovery({
      pathname,
      reconnectSocket,
      getReconnectTarget,
    });
  }, AUTH_RECOVERY_INTERVAL_MS);
}

async function attemptAuthRecovery({
  pathname,
  reconnectSocket,
  getReconnectTarget,
}: {
  pathname: string;
  reconnectSocket: (pathname: string, shareSessionId?: string | null) => void;
  getReconnectTarget: () => ReconnectTarget;
}): Promise<void> {
  if (!authLost || authRecoveryInFlight) {
    return;
  }
  authRecoveryInFlight = true;
  const res = await route_get_auth_refresh_status();
  authRecoveryInFlight = false;
  if (res200(res)) {
    updateAuthRefreshWindowSeconds(res.data.authCookieRefreshWindowSeconds);
    authLost = false;
    clearAuthRecoveryTimer();
    const reconnectTarget = getReconnectTarget();
    reconnectSocket(
      reconnectTarget.pathname || pathname,
      reconnectTarget.shareSessionId,
    );
    return;
  }
  scheduleAuthRecovery({
    pathname,
    reconnectSocket,
    getReconnectTarget,
  });
}

async function runAuthRefresh(): Promise<void> {
  if (authLost || authRefreshInFlight) {
    return;
  }
  authRefreshInFlight = true;
  const res = await route_get_auth_refresh_status();
  authRefreshInFlight = false;
  if (res200(res)) {
    updateAuthRefreshWindowSeconds(res.data.authCookieRefreshWindowSeconds);
    return;
  }
  if (!res.hasResponse) {
    return;
  }
  if (res.status === 401 && wssReady(websocketTransportState.wss)) {
    websocketTransportState.wss.close(AUTH_CLOSE_CODE);
  }
}

function getAuthRefreshIntervalMs(windowSeconds: number): number {
  return Math.max(1000, Math.floor(windowSeconds * 1000 * 0.5));
}

function updateAuthRefreshWindowSeconds(
  windowSeconds: number | null | undefined,
): void {
  if (windowSeconds === null || windowSeconds === undefined) {
    return;
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return;
  }
  if (windowSeconds === authRefreshWindowSeconds) {
    return;
  }
  authRefreshWindowSeconds = windowSeconds;
  const nextIntervalMs = getAuthRefreshIntervalMs(windowSeconds);
  if (nextIntervalMs === authRefreshIntervalMs) {
    return;
  }
  authRefreshIntervalMs = nextIntervalMs;
  if (authRefreshTimer !== null && !authLost) {
    startAuthRefresh({ runImmediately: false });
  }
}
