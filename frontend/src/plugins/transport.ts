import { buildBackendOriginURL } from "utils/backendOriginTransport";

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
