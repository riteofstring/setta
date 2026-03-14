import { buildBackendURL } from "utils/backendTransport";
import { GoHTTPRouteHelpers } from "utils/generatedRoutes";

export function buildAppBinaryDownloadUrl(
  contentId: string,
  shareSessionId: string | null,
): string {
  return buildBackendURL(GoHTTPRouteHelpers.binaryDownload(contentId), {
    shareSessionId: shareSessionId ?? undefined,
  });
}
