import { RouteEnum, type ServerModeResponse } from "./generatedTypes";

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
  [RouteEnum.GET_SETTA_HOME_INFO]: "launcher",
  [RouteEnum.LAUNCH]: "launcher",
  [RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT]: "launcher",
  [RouteEnum.GET_LAUNCHER_APP_MODE]: "launcher",
  [RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES]: "launcher",
  [RouteEnum.ADD_LAUNCHER_RECENT_WORKSPACE]: "launcher",
  [RouteEnum.REMOVE_LAUNCHER_RECENT_WORKSPACE]: "launcher",
  [RouteEnum.PIN_LAUNCHER_RECENT_WORKSPACE]: "launcher",
  [RouteEnum.GET_LAUNCHER_FILESYSTEM_ROOTS]: "launcher",
  [RouteEnum.LIST_LAUNCHER_DIRECTORY]: "launcher",
  [RouteEnum.OPEN_LAUNCHER_WORKSPACE]: "launcher",
});

const MODE_SCOPED_LAUNCHER_ROUTES = new Set<string>([
  RouteEnum.LAUNCH,
  RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT,
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

export function modeSupportsWorkspaceLaunch(mode: ServerMode): boolean {
  return resolveWorkspaceLaunchRouteKind(mode) !== "blocked";
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
  if (normalizedAddress.startsWith(RouteEnum.BOOTSTRAP_PAGE)) {
    return "backend-origin";
  }
  const routePolicy = ENDPOINT_ORIGIN_POLICY[normalizedAddress];
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
