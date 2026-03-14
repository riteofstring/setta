import { describe, expect, it } from "vitest";
import {
  GoHTTPRouteHelpers,
  GoRootRouteHelpers,
  GoRoutePrefixHelpers,
  GoWebsocketRouteHelpers,
} from "./generatedRoutes";
import {
  API_ROUTE_PREFIX,
  buildBinaryDownloadRoute,
  buildListenerWebsocketRoute,
  buildPluginBackendRoute,
  buildTerminalWebsocketRoute,
  ROOT_TRANSPORT_ROUTES,
  SERVER_MODE_BOUNDARY_ROUTES,
  SETTA_API_PRESET_ROUTES,
  WEBSOCKET_TRANSPORT_ROUTES,
} from "./transportRouteConstants";

describe("transportRouteConstants", () => {
  it("keeps the API prefix aligned with canonical generated routes", () => {
    expect(API_ROUTE_PREFIX).toBe(GoRoutePrefixHelpers.api());
  });

  it("keeps root and websocket routes aligned with canonical generated routes", () => {
    expect(ROOT_TRANSPORT_ROUTES).toEqual({
      bootstrapPage: GoRootRouteHelpers.bootstrapPage(),
      toolsCall: GoRootRouteHelpers.toolsCall(),
    });
    expect(WEBSOCKET_TRANSPORT_ROUTES).toEqual({
      frontend: GoWebsocketRouteHelpers.frontend(),
    });
  });

  it("keeps server-mode policy routes aligned with canonical generated routes", () => {
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

  it("keeps Setta API preset routes aligned with canonical generated routes", () => {
    expect(SETTA_API_PRESET_ROUTES).toEqual({
      createTopLevelSection: GoHTTPRouteHelpers.createTopLevelSection(),
      getLatestProjectState: GoHTTPRouteHelpers.getLatestProjectState(),
      saveProject: GoHTTPRouteHelpers.saveProject(),
    });
  });

  it("keeps parameterized route builders aligned with canonical generated routes", () => {
    expect(buildBinaryDownloadRoute("content-a")).toBe(
      GoHTTPRouteHelpers.binaryDownload("content-a"),
    );
    expect(buildPluginBackendRoute("acme.plugin", "/health")).toBe(
      GoHTTPRouteHelpers.pluginsBackendRoute("acme.plugin", "/health"),
    );
    expect(buildListenerWebsocketRoute("listener-a")).toBe(
      GoWebsocketRouteHelpers.listenerById("listener-a"),
    );
    expect(buildTerminalWebsocketRoute("project-a", "section-a")).toBe(
      GoWebsocketRouteHelpers.terminalBySection("project-a", "section-a"),
    );
  });
});
