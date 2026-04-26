import type { HttpapiServerModeResponse } from "openapi/http";
import {
  resolveGeneratedEndpointOriginForMode,
  resolveGeneratedServerModeCapabilities,
  resolveGeneratedWorkspaceLaunchRouteKind,
} from "./bindingRuntime";
import {
  EndpointOriginEnum,
  EndpointOriginPolicyByRoute,
  ModeScopedLauncherRoutesList,
  ServerModeBoundaryPolicyByMode,
  WorkspaceLaunchRouteKindEnum,
  type EndpointOrigin as GeneratedEndpointOrigin,
  type ServerModeCapabilities as GeneratedServerModeCapabilities,
  type WorkspaceLaunchRouteKind as GeneratedWorkspaceLaunchRouteKind,
} from "./generatedTypes";
import { ROOT_TRANSPORT_ROUTES } from "./transportRouteConstants";

export type ServerMode = HttpapiServerModeResponse["mode"] | null;
export type EndpointOrigin = GeneratedEndpointOrigin;
export type WorkspaceLaunchRouteKind = GeneratedWorkspaceLaunchRouteKind;

export type ServerModeCapabilities = GeneratedServerModeCapabilities;

const NULL_SERVER_MODE_CAPABILITIES: ServerModeCapabilities = {
  canManageDesktopLauncher: false,
};

export function resolveServerModeCapabilities(
  mode: ServerMode,
): ServerModeCapabilities {
  return resolveGeneratedServerModeCapabilities(
    ServerModeBoundaryPolicyByMode,
    mode,
    NULL_SERVER_MODE_CAPABILITIES,
  );
}

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerMode,
): WorkspaceLaunchRouteKind {
  return resolveGeneratedWorkspaceLaunchRouteKind(
    ServerModeBoundaryPolicyByMode,
    mode,
    WorkspaceLaunchRouteKindEnum.blocked,
  );
}

export function resolveEndpointOriginForMode(
  address: string,
  serverMode: ServerMode,
): EndpointOrigin {
  return resolveGeneratedEndpointOriginForMode(address, serverMode, {
    bootstrapPage: ROOT_TRANSPORT_ROUTES.bootstrapPage,
    launcherMode: "launcher",
    endpointOriginPolicy: EndpointOriginPolicyByRoute,
    modeScopedLauncherRoutes: new Set<string>(ModeScopedLauncherRoutesList),
    backendOriginValue: EndpointOriginEnum.BackendOrigin,
    launcherOriginValue: EndpointOriginEnum.launcher,
    backendValue: EndpointOriginEnum.backend,
  });
}
