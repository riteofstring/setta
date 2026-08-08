const FRONTEND_AFFINITY_WAIT_TIMEOUT_MS = 1000;
const FRONTEND_AFFINITY_WAIT_POLL_INTERVAL_MS = 25;
const FRONTEND_AFFINITY_NOT_READY_ERROR_MESSAGE =
  "Frontend identity not ready for this websocket connection.";

let frontendAffinityToken: string | null = null;
let activeFrontendWebsocketGeneration = 0;
let frontendAffinityTokenGeneration = 0;

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
}

export function getFrontendAffinityToken(): string | null {
  if (frontendAffinityTokenGeneration !== activeFrontendWebsocketGeneration) {
    return null;
  }
  return frontendAffinityToken;
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

export async function waitForFrontendAffinityToken({
  timeoutMs = FRONTEND_AFFINITY_WAIT_TIMEOUT_MS,
  pollIntervalMs = FRONTEND_AFFINITY_WAIT_POLL_INTERVAL_MS,
}: {
  timeoutMs?: number;
  pollIntervalMs?: number;
} = {}): Promise<string> {
  const resolvedTimeoutMs = timeoutMs < 0 ? 0 : timeoutMs;
  const resolvedPollIntervalMs =
    pollIntervalMs <= 0
      ? FRONTEND_AFFINITY_WAIT_POLL_INTERVAL_MS
      : pollIntervalMs;
  let remainingWaitMs = resolvedTimeoutMs;

  while (true) {
    const frontendAffinityToken = getFrontendAffinityToken();
    if (frontendAffinityToken !== null) {
      return frontendAffinityToken;
    }
    if (remainingWaitMs <= 0) {
      throw new Error(FRONTEND_AFFINITY_NOT_READY_ERROR_MESSAGE);
    }
    const waitStepMs = Math.min(remainingWaitMs, resolvedPollIntervalMs);
    await sleep(waitStepMs);
    remainingWaitMs -= waitStepMs;
  }
}
