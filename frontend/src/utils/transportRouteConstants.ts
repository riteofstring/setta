import {
  GoHTTPRouteHelpers,
  GoRootRouteHelpers,
  GoRoutePrefixHelpers,
  GoWebsocketRouteHelpers,
} from "./generatedRoutes";

export const API_ROUTE_PREFIX = GoRoutePrefixHelpers.api();

export const ROOT_TRANSPORT_ROUTES = Object.freeze({
  bootstrapPage: GoRootRouteHelpers.bootstrapPage(),
  toolsCall: GoRootRouteHelpers.toolsCall(),
});

export const WEBSOCKET_TRANSPORT_ROUTES = Object.freeze({
  frontend: GoWebsocketRouteHelpers.frontend(),
});

export const SERVER_MODE_BOUNDARY_ROUTES = Object.freeze({
  launch: GoHTTPRouteHelpers.launch(),
  createWorkspaceLaunchIntent: GoHTTPRouteHelpers.createWorkspaceLaunchIntent(),
  getSettaHomeInfo: GoHTTPRouteHelpers.getSettaHomeInfo(),
  getLauncherRecentWorkspaces: GoHTTPRouteHelpers.getLauncherRecentWorkspaces(),
  addLauncherRecentWorkspace: GoHTTPRouteHelpers.addLauncherRecentWorkspace(),
  removeLauncherRecentWorkspace:
    GoHTTPRouteHelpers.removeLauncherRecentWorkspace(),
  pinLauncherRecentWorkspace: GoHTTPRouteHelpers.pinLauncherRecentWorkspace(),
  getLauncherFilesystemRoots: GoHTTPRouteHelpers.getLauncherFilesystemRoots(),
  listLauncherDirectory: GoHTTPRouteHelpers.listLauncherDirectory(),
  openLauncherWorkspace: GoHTTPRouteHelpers.openLauncherWorkspace(),
});

export const SETTA_API_PRESET_ROUTES = Object.freeze({
  createTopLevelSection: GoHTTPRouteHelpers.createTopLevelSection(),
  getLatestProjectState: GoHTTPRouteHelpers.getLatestProjectState(),
  saveProject: GoHTTPRouteHelpers.saveProject(),
});

export function buildBinaryDownloadRoute(contentId: string): string {
  return GoHTTPRouteHelpers.binaryDownload(contentId);
}

export function buildPluginBackendRoute(
  pluginId: string,
  routePath: string,
): string {
  return GoHTTPRouteHelpers.pluginsBackendRoute(pluginId, routePath);
}

export function buildListenerWebsocketRoute(listenerId: string): string {
  return GoWebsocketRouteHelpers.listenerById(listenerId);
}

export function buildTerminalWebsocketRoute(
  projectConfigId: string,
  sectionId: string,
): string {
  return GoWebsocketRouteHelpers.terminalBySection(projectConfigId, sectionId);
}
