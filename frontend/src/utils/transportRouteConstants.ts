import { TransportRouteConstants } from "./generatedTypes";

const TRANSPORT_ROUTES = TransportRouteConstants;

export const API_ROUTE_PREFIX = TRANSPORT_ROUTES.apiPrefix;

export const ROOT_TRANSPORT_ROUTES = Object.freeze(TRANSPORT_ROUTES.root);

export const WEBSOCKET_TRANSPORT_ROUTES = Object.freeze(
  TRANSPORT_ROUTES.websocket,
);

const BINARY_TRANSPORT_ROUTES = Object.freeze(TRANSPORT_ROUTES.binary);

function replaceTransportRoutePathParams(
  routePath: string,
  params: Record<string, string>,
): string {
  let resolved = routePath;
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replaceAll(`{${key}}`, value);
  }
  return resolved;
}

export function buildBinaryDownloadRoute(contentId: string): string {
  return replaceTransportRoutePathParams(BINARY_TRANSPORT_ROUTES.download, {
    contentId,
  });
}

export function buildTerminalWebsocketRoute(
  projectConfigId: string,
  sectionId: string,
): string {
  return replaceTransportRoutePathParams(
    WEBSOCKET_TRANSPORT_ROUTES.terminalBySection,
    {
      projectID: projectConfigId,
      sectionID: sectionId,
    },
  );
}
