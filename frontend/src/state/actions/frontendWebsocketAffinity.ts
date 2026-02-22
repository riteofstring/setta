import {
  WebsocketConnectionInfo,
  WebsocketConnectionTypeEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

const FRONTEND_WEBSOCKET_AFFINITY_TOKEN = createNewId();
let frontendWebsocketId: string | null = null;
let activeFrontendWebsocketGeneration = 0;
let frontendWebsocketIdGeneration = 0;

function isStaleGeneration(
  socketGeneration: number | null | undefined,
): boolean {
  if (socketGeneration === null || socketGeneration === undefined) {
    return false;
  }
  return socketGeneration !== activeFrontendWebsocketGeneration;
}

function setAffinityId(nextFrontendWebsocketId: string | null): void {
  frontendWebsocketId = nextFrontendWebsocketId;
  frontendWebsocketIdGeneration = activeFrontendWebsocketGeneration;
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
  if (frontendWebsocketId !== null) {
    return;
  }
  if (!currentAddress) {
    setAffinityId(null);
    return;
  }
  const matchingFrontendConnections = connections.filter((connection) => {
    if (connection.connectionType !== WebsocketConnectionTypeEnum.FRONTEND) {
      return false;
    }
    if (connection.currentAddress !== currentAddress) {
      return false;
    }
    return connection.shareSessionId === shareSessionId;
  });
  if (matchingFrontendConnections.length !== 1) {
    setAffinityId(null);
    return;
  }
  setAffinityId(matchingFrontendConnections[0]?.id ?? null);
}

export function setFrontendWebsocketAffinityId(
  websocketId: string,
  socketGeneration?: number,
): void {
  if (isStaleGeneration(socketGeneration)) {
    return;
  }
  const normalizedWebsocketId = websocketId.trim();
  if (normalizedWebsocketId === "") {
    setAffinityId(null);
    return;
  }
  setAffinityId(normalizedWebsocketId);
}

export function clearFrontendWebsocketAffinity(socketGeneration?: number): void {
  if (isStaleGeneration(socketGeneration)) {
    return;
  }
  setAffinityId(null);
}

export function setActiveFrontendWebsocketAffinityGeneration(
  socketGeneration: number,
): void {
  activeFrontendWebsocketGeneration = socketGeneration;
  frontendWebsocketId = null;
  frontendWebsocketIdGeneration = socketGeneration;
}

export function getFrontendWebsocketAffinityId(): string | null {
  if (frontendWebsocketIdGeneration !== activeFrontendWebsocketGeneration) {
    return null;
  }
  return frontendWebsocketId;
}
