import {
  buildBinaryDownloadRoute,
} from "./transportRouteConstants";
import { buildBackendURL as buildBackendURLInternal } from "./transportUrlCore";

export {
  SERVER_MODE_BOUNDARY_ROUTES,
  SETTA_API_PRESET_ROUTES,
} from "./transportRouteConstants";

export function buildBackendURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendURLInternal(address, addressParams);
}

export function buildBinaryDownloadUrl(
  contentId: string,
  shareSessionId: string | null,
): string {
  return buildBackendURL(buildBinaryDownloadRoute(contentId), {
    shareSessionId: shareSessionId ?? undefined,
  });
}
