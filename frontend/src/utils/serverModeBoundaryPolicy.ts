import {
  resolveGeneratedEndpointOriginForMode,
  resolveGeneratedServerModeCapabilities,
  resolveGeneratedWorkspaceLaunchRouteKind,
} from "./bindingRuntime";
import {
  EndpointOriginEnum,
  EndpointOriginPolicyByRoute,
  ModeScopedLauncherRoutesList,
  RouteEnum,
  ServerModeBoundaryPolicyByMode,
  WorkspaceLaunchRouteKindEnum,
  type EndpointOrigin as GeneratedEndpointOrigin,
  type ServerModeCapabilities as GeneratedServerModeCapabilities,
  type WorkspaceLaunchRouteKind as GeneratedWorkspaceLaunchRouteKind,
  type ServerModeResponse,
} from "./generatedTypes";

export type ServerMode = ServerModeResponse["mode"] | null;
export type EndpointOrigin = GeneratedEndpointOrigin;
export type WorkspaceLaunchRouteKind = GeneratedWorkspaceLaunchRouteKind;

export type ServerModeCapabilities = GeneratedServerModeCapabilities;

export const ENDPOINT_ORIGIN_POLICY = EndpointOriginPolicyByRoute;

export function resolveServerModeCapabilities(
  mode: ServerMode,
): ServerModeCapabilities {
  return resolveGeneratedServerModeCapabilities(
    ServerModeBoundaryPolicyByMode,
    mode,
    { canManageDesktopLauncher: false },
  );
}

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerMode,
): WorkspaceLaunchRouteKind {
  return resolveGeneratedWorkspaceLaunchRouteKind(
    ServerModeBoundaryPolicyByMode,
    mode,
    WorkspaceLaunchRouteKindEnum.Blocked,
  );
}

export function resolveEndpointOriginForMode(
  address: string,
  serverMode: ServerMode,
): EndpointOrigin {
  return resolveGeneratedEndpointOriginForMode(address, serverMode, {
    bootstrapPage: RouteEnum.BOOTSTRAP_PAGE,
    launcherMode: "launcher",
    endpointOriginPolicy: EndpointOriginPolicyByRoute,
    modeScopedLauncherRoutes: new Set<string>(ModeScopedLauncherRoutesList),
    backendOriginValue: EndpointOriginEnum.BackendOrigin,
    launcherOriginValue: EndpointOriginEnum.Launcher,
    backendValue: EndpointOriginEnum.Backend,
  });
}
