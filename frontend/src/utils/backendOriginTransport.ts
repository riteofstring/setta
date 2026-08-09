import {
  buildTerminalWebsocketRoute,
  ROOT_TRANSPORT_ROUTES,
  WEBSOCKET_TRANSPORT_ROUTES,
} from "./transportRouteConstants";
import {
  buildBackendOriginURL as buildBackendOriginURLInternal,
  buildBackendOriginWebsocketURL as buildBackendOriginWebsocketURLInternal,
} from "./transportUrlCore";

type BuildTerminalWebsocketUrlOptions = {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
};

export function buildBackendOriginURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendOriginURLInternal(address, addressParams);
}

function buildBackendOriginWebsocketURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendOriginWebsocketURLInternal(address, addressParams);
}

export function buildBootstrapPageUrl(): string {
  return buildBackendOriginURL(ROOT_TRANSPORT_ROUTES.bootstrapPage);
}

export function getFrontendWebsocketRoute(): string {
  return WEBSOCKET_TRANSPORT_ROUTES.frontend;
}

export function buildFrontendWebsocketUrl(
  shareSessionId: string | null,
): string {
  return buildBackendOriginWebsocketURL(WEBSOCKET_TRANSPORT_ROUTES.frontend, {
    shareSessionId: shareSessionId ?? undefined,
  });
}

export function buildTerminalWebsocketUrl({
  projectConfigId,
  sectionId,
  shareSessionId,
}: BuildTerminalWebsocketUrlOptions): string {
  return buildBackendOriginWebsocketURL(
    buildTerminalWebsocketRoute(projectConfigId, sectionId),
    {
      shareSessionId: shareSessionId ?? undefined,
    },
  );
}
