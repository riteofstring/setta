import {
  WebsocketConnectionInfo,
  WebsocketConnectionTypeEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

const FRONTEND_WEBSOCKET_AFFINITY_TOKEN = createNewId();
let frontendWebsocketId: string | null = null;

export function buildFrontendAffinityCurrentAddress(pathname: string): string {
  const normalizedPathname = pathname.trim();
  const resolvedPathname = normalizedPathname === "" ? "/" : normalizedPathname;
  return `${resolvedPathname}#setta-ws-affinity=${FRONTEND_WEBSOCKET_AFFINITY_TOKEN}`;
}

export function updateFrontendWebsocketAffinity({
  connections,
  currentAddress,
  shareSessionId,
}: {
  connections: Array<WebsocketConnectionInfo>;
  currentAddress: string | null;
  shareSessionId: string | null;
}): void {
  if (!currentAddress) {
    frontendWebsocketId = null;
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
    frontendWebsocketId = null;
    return;
  }
  frontendWebsocketId = matchingFrontendConnections[0]?.id ?? null;
}

export function clearFrontendWebsocketAffinity(): void {
  frontendWebsocketId = null;
}

export function getFrontendWebsocketAffinityId(): string | null {
  return frontendWebsocketId;
}
