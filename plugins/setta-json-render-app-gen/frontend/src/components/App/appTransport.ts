import {
  buildBinaryDownloadUrl as buildSdkBinaryDownloadUrl,
  type AppSubsystemFrontendHost,
} from "@setta/app-subsystem-frontend-sdk";

export function buildAppBinaryDownloadUrl(
  contentId: string,
  shareSessionId: string | null,
  frontendHost: AppSubsystemFrontendHost,
): string {
  return buildSdkBinaryDownloadUrl(
    contentId,
    shareSessionId,
    frontendHost.getServerModeState().mode,
  );
}
