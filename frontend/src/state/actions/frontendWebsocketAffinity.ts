import {
  WebsocketConnectionInfo,
  WebsocketConnectionTypeEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

const FRONTEND_WEBSOCKET_AFFINITY_TOKEN = createNewId();
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
  const resolvedPathname = normalizedPathname === "" ? "/" : normalizedPathname;
  return `${resolvedPathname}#setta-ws-affinity=${FRONTEND_WEBSOCKET_AFFINITY_TOKEN}`;
}

export function updateFrontendWebsocketAffinity({
  connections,
  currentAddress,
  shareSessionId,
  socketGeneration,
}: {
  connections: Array<WebsocketConnectionInfo>;
  currentAddress: string | null;
  shareSessionId: string | null;
  socketGeneration?: number;
}): void {
  if (isStaleGeneration(socketGeneration)) {
    return;
  }
  if (frontendAffinityToken !== null) {
    return;
  }
  if (!currentAddress) {
    setAffinityId(null);
    return;
  }
  const hasMatchingFrontendConnection = connections.some((connection) => {
    if (connection.connectionType !== WebsocketConnectionTypeEnum.FRONTEND) {
      return false;
    }
    if (connection.currentAddress !== currentAddress) {
      return false;
    }
    return connection.shareSessionId === shareSessionId;
  });
  if (!hasMatchingFrontendConnection) {
    setAffinityId(null);
    return;
  }
  // AllConnections snapshots expose websocket ids, not affinity capability tokens.
  // Keep waiting for FrontendIdentity to provide the token bound to this socket.
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
