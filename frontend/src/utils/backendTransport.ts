import { buildBinaryDownloadRoute } from "./transportRouteConstants";
import { buildBackendURL as buildBackendURLInternal } from "./transportUrlCore";

export { SETTA_API_PRESET_ROUTES } from "./transportRouteConstants";

function buildBackendURL(
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
