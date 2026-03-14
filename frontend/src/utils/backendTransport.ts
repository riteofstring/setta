import { GoHTTPRouteHelpers } from "./generatedRoutes";
import { buildBackendURL as buildBackendURLInternal } from "./transportUrlCore";

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
  return buildBackendURL(GoHTTPRouteHelpers.binaryDownload(contentId), {
    shareSessionId: shareSessionId ?? undefined,
  });
}

export function buildPluginBackendFetchUrl(
  pluginId: string,
  routePath: string,
): string {
  return buildBackendURL(
    GoHTTPRouteHelpers.pluginsBackendRoute(pluginId, routePath),
  );
}

export const SETTA_API_PRESET_ROUTES = Object.freeze({
  createTopLevelSection: GoHTTPRouteHelpers.createTopLevelSection(),
  getLatestProjectState: GoHTTPRouteHelpers.getLatestProjectState(),
  saveProject: GoHTTPRouteHelpers.saveProject(),
});
