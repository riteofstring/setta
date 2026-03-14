import {
  buildBackendOriginURL,
  buildListenerWebsocketUrl,
} from "utils/backendOriginTransport";
export { buildPluginBackendFetchUrl } from "utils/backendTransport";

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
