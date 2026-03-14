import {
  buildBackendOriginURL,
  buildListenerWebsocketUrl,
} from "utils/backendOriginTransport";
import { buildBackendURL } from "utils/backendTransport";
import { GoHTTPRouteHelpers } from "utils/generatedRoutes";

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
  return buildListenerWebsocketUrl({
    listenerId,
    projectConfigId,
    shareSessionId,
  });
}
