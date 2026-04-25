import { TransportRouteConstants } from "./generatedTypes";

export const ROOT_TRANSPORT_ROUTES = Object.freeze(
  TransportRouteConstants.root,
);

export const WEBSOCKET_TRANSPORT_ROUTES = Object.freeze(
  TransportRouteConstants.websocket,
);

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
