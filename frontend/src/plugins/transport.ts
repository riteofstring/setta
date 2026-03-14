import {
  buildBackendOriginURL,
  buildBackendOriginWebsocketURL,
} from "utils/backendOriginTransport";
import { buildBackendURL } from "utils/endpointUtils";
import {
  GoHTTPRouteHelpers,
  GoWebsocketRouteHelpers,
} from "utils/generatedRoutes";

export type BuildPluginListenerWebsocketUrlOptions = {
  listenerId: string;
  projectConfigId: string;
  shareSessionId: string | null;
};

export function buildPluginAssetUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return buildBackendOriginURL(url);
  }
  return url;
}

export function buildPluginBackendFetchUrl(
  pluginId: string,
  routePath: string,
): string {
  return buildBackendURL(
    GoHTTPRouteHelpers.pluginsBackendRoute(pluginId, routePath),
  );
}

export function buildPluginListenerWebsocketUrl({
  listenerId,
  projectConfigId,
  shareSessionId,
}: BuildPluginListenerWebsocketUrlOptions): string {
  return buildBackendOriginWebsocketURL(
    GoWebsocketRouteHelpers.listenerById(listenerId),
    {
      projectId: projectConfigId,
      shareSessionId: shareSessionId ?? undefined,
    },
  );
}
