import { GoRootRouteHelpers, GoWebsocketRouteHelpers } from "./generatedRoutes";
import {
  buildBackendOriginURL as buildBackendOriginURLInternal,
  buildBackendOriginWebsocketURL as buildBackendOriginWebsocketURLInternal,
} from "./transportUrlCore";

export type BuildListenerWebsocketUrlOptions = {
  listenerId: string;
  projectConfigId: string;
  shareSessionId: string | null;
};

export type BuildTerminalWebsocketUrlOptions = {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
};

const FRONTEND_WEBSOCKET_ROUTE = GoWebsocketRouteHelpers.frontend();

export function buildBackendOriginURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendOriginURLInternal(address, addressParams);
}

export function buildBackendOriginWebsocketURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendOriginWebsocketURLInternal(address, addressParams);
}

export function buildBootstrapPageUrl(): string {
  return buildBackendOriginURL(GoRootRouteHelpers.bootstrapPage());
}

export function getFrontendWebsocketRoute(): string {
  return FRONTEND_WEBSOCKET_ROUTE;
}

export function buildFrontendWebsocketUrl(
  shareSessionId: string | null,
): string {
  return buildBackendOriginWebsocketURL(FRONTEND_WEBSOCKET_ROUTE, {
    shareSessionId: shareSessionId ?? undefined,
  });
}

export function buildListenerWebsocketUrl({
  listenerId,
  projectConfigId,
  shareSessionId,
}: BuildListenerWebsocketUrlOptions): string {
  return buildBackendOriginWebsocketURL(
    GoWebsocketRouteHelpers.listenerById(listenerId),
    {
      projectId: projectConfigId,
      shareSessionId: shareSessionId ?? undefined,
    },
  );
}

export function buildTerminalWebsocketUrl({
  projectConfigId,
  sectionId,
  shareSessionId,
}: BuildTerminalWebsocketUrlOptions): string {
  return buildBackendOriginWebsocketURL(
    GoWebsocketRouteHelpers.terminalBySection(projectConfigId, sectionId),
    {
      shareSessionId: shareSessionId ?? undefined,
    },
  );
}
