import { C_ADDRESSES } from "utils/c_addresses";
import { GoHTTPRouteHelpers } from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import {
  buildBackendURL,
  buildBinaryDownloadUrl,
  buildPluginBackendFetchUrl,
  SERVER_MODE_BOUNDARY_ROUTES,
  SETTA_API_PRESET_ROUTES,
} from "./backendTransport";

describe("backendTransport", () => {
  it("builds canonical backend URLs", () => {
    const expectedPath = `/api${GoHTTPRouteHelpers.binaryDownload("content-a")}`;
    const url = new URL(
      buildBackendURL(GoHTTPRouteHelpers.binaryDownload("content-a")),
    );

    expect(url.pathname).toBe(expectedPath);
  });

  it("preserves query params on canonical backend URLs", () => {
    const url = new URL(
      buildBackendURL("/binary/content-a", {
        shareSessionId: "share-session-a",
      }),
    );

    expect(url.searchParams.get("shareSessionId")).toBe("share-session-a");
  });

  it("builds canonical binary-download URLs", () => {
    const expectedPath = `/api${GoHTTPRouteHelpers.binaryDownload("content-a")}`;
    const url = new URL(buildBinaryDownloadUrl("content-a", "share-a"));

    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });

  it("builds canonical plugin backend fetch URLs", () => {
    const expectedPath =
      new URL(C_ADDRESSES.BACKEND).pathname +
      GoHTTPRouteHelpers.pluginsBackendRoute("acme.plugin", "/health");
    const url = new URL(buildPluginBackendFetchUrl("acme.plugin", "/health"));

    expect(url.pathname).toBe(expectedPath);
  });

  it("exposes server-mode boundary routes from canonical HTTP route helpers", () => {
    expect(SERVER_MODE_BOUNDARY_ROUTES).toEqual({
      launch: GoHTTPRouteHelpers.launch(),
      createWorkspaceLaunchIntent:
        GoHTTPRouteHelpers.createWorkspaceLaunchIntent(),
      getSettaHomeInfo: GoHTTPRouteHelpers.getSettaHomeInfo(),
      getLauncherRecentWorkspaces:
        GoHTTPRouteHelpers.getLauncherRecentWorkspaces(),
      addLauncherRecentWorkspace:
        GoHTTPRouteHelpers.addLauncherRecentWorkspace(),
      removeLauncherRecentWorkspace:
        GoHTTPRouteHelpers.removeLauncherRecentWorkspace(),
      pinLauncherRecentWorkspace:
        GoHTTPRouteHelpers.pinLauncherRecentWorkspace(),
      getLauncherFilesystemRoots:
        GoHTTPRouteHelpers.getLauncherFilesystemRoots(),
      listLauncherDirectory: GoHTTPRouteHelpers.listLauncherDirectory(),
      openLauncherWorkspace: GoHTTPRouteHelpers.openLauncherWorkspace(),
    });
  });

  it("exposes Setta API preset routes from canonical HTTP route helpers", () => {
    expect(SETTA_API_PRESET_ROUTES).toEqual({
      createTopLevelSection: GoHTTPRouteHelpers.createTopLevelSection(),
      getLatestProjectState: GoHTTPRouteHelpers.getLatestProjectState(),
      saveProject: GoHTTPRouteHelpers.saveProject(),
    });
  });
});
