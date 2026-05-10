import { TransportRouteConstants } from "./generatedTypes";

export const ROOT_TRANSPORT_ROUTES = Object.freeze(
  TransportRouteConstants.root,
);

const BINARY_TRANSPORT_ROUTES = Object.freeze(TransportRouteConstants.binary);

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

/** @lintignore Consumed by the app subsystem frontend SDK build. */
export function buildBinaryDownloadRoute(contentId: string): string {
  return replaceTransportRoutePathParams(BINARY_TRANSPORT_ROUTES.download, {
    contentId,
  });
}
