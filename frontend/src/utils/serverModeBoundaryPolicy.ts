import {
  resolveGeneratedEndpointOriginForMode,
  resolveGeneratedServerModeCapabilities,
  resolveGeneratedWorkspaceLaunchRouteKind,
} from "./bindingRuntime";
import {
  GENERATED_ENDPOINT_ORIGIN_POLICY,
  GENERATED_MODE_SCOPED_LAUNCHER_ROUTES,
  GENERATED_SERVER_MODE_BOUNDARY_POLICY,
  RouteEnum,
  type GeneratedEndpointOriginPolicy,
  type GeneratedServerModeCapabilities,
  type GeneratedWorkspaceLaunchRouteKind,
  type ServerModeResponse,
} from "./generatedTypes";

export type ServerMode = ServerModeResponse["mode"] | null;
export type EndpointOriginPolicy = GeneratedEndpointOriginPolicy;
export type WorkspaceLaunchRouteKind = GeneratedWorkspaceLaunchRouteKind;

export type ServerModeCapabilities = GeneratedServerModeCapabilities;

export const ENDPOINT_ORIGIN_POLICY = GENERATED_ENDPOINT_ORIGIN_POLICY;

export function resolveServerModeCapabilities(
  mode: ServerMode,
): ServerModeCapabilities {
  return resolveGeneratedServerModeCapabilities(
    GENERATED_SERVER_MODE_BOUNDARY_POLICY,
    mode,
    { canManageDesktopLauncher: false },
  );
}

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerMode,
): WorkspaceLaunchRouteKind {
  return resolveGeneratedWorkspaceLaunchRouteKind(
    GENERATED_SERVER_MODE_BOUNDARY_POLICY,
    mode,
    "blocked",
  );
}

export function resolveEndpointOriginForMode(
  address: string,
  serverMode: ServerMode,
): EndpointOriginPolicy {
  return resolveGeneratedEndpointOriginForMode(address, serverMode, {
    bootstrapPage: RouteEnum.BOOTSTRAP_PAGE,
    launcherMode: "launcher",
    endpointOriginPolicy: GENERATED_ENDPOINT_ORIGIN_POLICY,
    modeScopedLauncherRoutes: GENERATED_MODE_SCOPED_LAUNCHER_ROUTES,
    backendOriginValue: "backend-origin",
    launcherOriginValue: "launcher",
    backendValue: "backend",
  });
}
