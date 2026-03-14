import { GoHTTPRouteHelpers, GoRootRouteHelpers } from "./generatedRoutes";
import type { ServerModeResponse } from "./generatedTypes";

export type ServerMode = ServerModeResponse["mode"] | null;
export type EndpointOriginPolicy = "backend" | "launcher" | "backend-origin";
export type WorkspaceLaunchRouteKind = "ide" | "launcher" | "blocked";

export type ServerModeCapabilities = {
  canManageDesktopLauncher: boolean;
};

type ModeBoundaryPolicy = {
  capabilities: ServerModeCapabilities;
  workspaceLaunchRouteKind: WorkspaceLaunchRouteKind;
};

const BOOTSTRAP_PAGE_ROUTE = GoRootRouteHelpers.bootstrapPage();
const TOOLS_CALL_ROUTE = GoRootRouteHelpers.toolsCall();
const LAUNCH_ROUTE = GoHTTPRouteHelpers.launch();
const CREATE_WORKSPACE_LAUNCH_INTENT_ROUTE =
  GoHTTPRouteHelpers.createWorkspaceLaunchIntent();
const GET_SETTA_HOME_INFO_ROUTE = GoHTTPRouteHelpers.getSettaHomeInfo();
const GET_LAUNCHER_RECENT_WORKSPACES_ROUTE =
  GoHTTPRouteHelpers.getLauncherRecentWorkspaces();
const ADD_LAUNCHER_RECENT_WORKSPACE_ROUTE =
  GoHTTPRouteHelpers.addLauncherRecentWorkspace();
const REMOVE_LAUNCHER_RECENT_WORKSPACE_ROUTE =
  GoHTTPRouteHelpers.removeLauncherRecentWorkspace();
const PIN_LAUNCHER_RECENT_WORKSPACE_ROUTE =
  GoHTTPRouteHelpers.pinLauncherRecentWorkspace();
const GET_LAUNCHER_FILESYSTEM_ROOTS_ROUTE =
  GoHTTPRouteHelpers.getLauncherFilesystemRoots();
const LIST_LAUNCHER_DIRECTORY_ROUTE =
  GoHTTPRouteHelpers.listLauncherDirectory();
const OPEN_LAUNCHER_WORKSPACE_ROUTE =
  GoHTTPRouteHelpers.openLauncherWorkspace();

const MODE_BOUNDARY_POLICY: Readonly<
  Record<ServerModeResponse["mode"], ModeBoundaryPolicy>
> = Object.freeze({
  ide: {
    capabilities: { canManageDesktopLauncher: true },
    workspaceLaunchRouteKind: "ide",
  },
  share: {
    capabilities: { canManageDesktopLauncher: false },
    workspaceLaunchRouteKind: "blocked",
  },
  app: {
    capabilities: { canManageDesktopLauncher: false },
    workspaceLaunchRouteKind: "blocked",
  },
  launcher: {
    capabilities: { canManageDesktopLauncher: false },
    workspaceLaunchRouteKind: "launcher",
  },
});

export const ENDPOINT_ORIGIN_POLICY: Readonly<
  Record<string, EndpointOriginPolicy>
> = Object.freeze({
  [LAUNCH_ROUTE]: "launcher",
  [CREATE_WORKSPACE_LAUNCH_INTENT_ROUTE]: "launcher",
  [GET_SETTA_HOME_INFO_ROUTE]: "backend",
  [TOOLS_CALL_ROUTE]: "backend-origin",
  [GET_LAUNCHER_RECENT_WORKSPACES_ROUTE]: "launcher",
  [ADD_LAUNCHER_RECENT_WORKSPACE_ROUTE]: "launcher",
  [REMOVE_LAUNCHER_RECENT_WORKSPACE_ROUTE]: "launcher",
  [PIN_LAUNCHER_RECENT_WORKSPACE_ROUTE]: "launcher",
  [GET_LAUNCHER_FILESYSTEM_ROOTS_ROUTE]: "launcher",
  [LIST_LAUNCHER_DIRECTORY_ROUTE]: "launcher",
  [OPEN_LAUNCHER_WORKSPACE_ROUTE]: "launcher",
});

const MODE_SCOPED_LAUNCHER_ROUTES = new Set<string>([
  LAUNCH_ROUTE,
  CREATE_WORKSPACE_LAUNCH_INTENT_ROUTE,
]);

export function resolveServerModeCapabilities(
  mode: ServerMode,
): ServerModeCapabilities {
  if (mode === null) {
    return { canManageDesktopLauncher: false };
  }
  return MODE_BOUNDARY_POLICY[mode].capabilities;
}

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerMode,
): WorkspaceLaunchRouteKind {
  if (mode === null) {
    return "blocked";
  }
  return MODE_BOUNDARY_POLICY[mode].workspaceLaunchRouteKind;
}

function stripQueryAndHash(address: string): string {
  const hashIndex = address.indexOf("#");
  let withoutHash = address;
  if (hashIndex >= 0) {
    withoutHash = address.slice(0, hashIndex);
  }
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex >= 0) {
    return withoutHash.slice(0, queryIndex);
  }
  return withoutHash;
}

export function resolveEndpointOriginForMode(
  address: string,
  serverMode: ServerMode,
): EndpointOriginPolicy {
  const normalizedAddress = stripQueryAndHash(address);
  if (normalizedAddress.startsWith(BOOTSTRAP_PAGE_ROUTE)) {
    return "backend-origin";
  }
  const routePolicy = ENDPOINT_ORIGIN_POLICY[normalizedAddress];
  if (routePolicy === "backend-origin") {
    return "backend-origin";
  }
  if (routePolicy === "launcher") {
    if (
      MODE_SCOPED_LAUNCHER_ROUTES.has(normalizedAddress) &&
      serverMode !== "launcher"
    ) {
      return "backend";
    }
    return "launcher";
  }
  return "backend";
}
