const FRONTEND_AFFINITY_WAIT_TIMEOUT_MS = 1000;
const FRONTEND_AFFINITY_NOT_READY_ERROR_MESSAGE =
  "Frontend identity not ready for this websocket connection.";

let frontendAffinityToken: string | null = null;
let activeFrontendWebsocketGeneration = 0;
let frontendAffinityTokenGeneration = 0;
let nextAffinityWaiterId = 1;
const pendingAffinityWaiters = new Map<number, () => void>();

function isStaleGeneration(
  socketGeneration: number | null | undefined,
): boolean {
  if (socketGeneration === null || socketGeneration === undefined) {
    return false;
  }
  return socketGeneration !== activeFrontendWebsocketGeneration;
}

function setAffinityId(nextFrontendAffinityToken: string | null): void {
  frontendAffinityToken = nextFrontendAffinityToken;
  frontendAffinityTokenGeneration = activeFrontendWebsocketGeneration;
  notifyAffinityWaiters();
}

function notifyAffinityWaiters(): void {
  for (const notifyWaiter of pendingAffinityWaiters.values()) {
    notifyWaiter();
  }
}

export function buildFrontendAffinityCurrentAddress(pathname: string): string {
  const normalizedPathname = pathname.trim();
  if (normalizedPathname === "") {
    return "/";
  }
  return normalizedPathname;
}

export function setFrontendAffinityToken(
  frontendAffinityToken: string,
  socketGeneration?: number,
): void {
  if (isStaleGeneration(socketGeneration)) {
    return;
  }
  const normalizedFrontendAffinityToken = frontendAffinityToken.trim();
  if (normalizedFrontendAffinityToken === "") {
    setAffinityId(null);
    return;
  }
  setAffinityId(normalizedFrontendAffinityToken);
}

export function clearFrontendWebsocketAffinity(
  socketGeneration?: number,
): void {
  if (isStaleGeneration(socketGeneration)) {
    return;
  }
  setAffinityId(null);
}

export function setActiveFrontendWebsocketAffinityGeneration(
  socketGeneration: number,
): void {
  activeFrontendWebsocketGeneration = socketGeneration;
  frontendAffinityToken = null;
  frontendAffinityTokenGeneration = socketGeneration;
  notifyAffinityWaiters();
}

function getFrontendAffinityToken(): string | null {
  if (frontendAffinityTokenGeneration !== activeFrontendWebsocketGeneration) {
    return null;
  }
  return frontendAffinityToken;
}

export async function waitForFrontendAffinityToken({
  timeoutMs = FRONTEND_AFFINITY_WAIT_TIMEOUT_MS,
}: {
  timeoutMs?: number;
} = {}): Promise<string> {
  const existingToken = getFrontendAffinityToken();
  if (existingToken !== null) {
    return existingToken;
  }
  const resolvedTimeoutMs = timeoutMs < 0 ? 0 : timeoutMs;
  if (resolvedTimeoutMs <= 0) {
    throw new Error(FRONTEND_AFFINITY_NOT_READY_ERROR_MESSAGE);
  }

  return new Promise((resolve, reject) => {
    const waiterID = nextAffinityWaiterId;
    nextAffinityWaiterId += 1;
    let timeoutId: number | null = null;

    const cleanup = () => {
      pendingAffinityWaiters.delete(waiterID);
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const tryResolve = () => {
      const frontendAffinityToken = getFrontendAffinityToken();
      if (frontendAffinityToken === null) {
        return;
      }
      cleanup();
      resolve(frontendAffinityToken);
    };

    pendingAffinityWaiters.set(waiterID, tryResolve);
    timeoutId = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error(FRONTEND_AFFINITY_NOT_READY_ERROR_MESSAGE));
    }, resolvedTimeoutMs);
    tryResolve();
  });
}
