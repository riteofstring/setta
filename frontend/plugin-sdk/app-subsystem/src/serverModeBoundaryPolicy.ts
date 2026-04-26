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
import type { HttpapiServerModeResponse } from "./openapi/http/generated/types.gen";
import { ROOT_TRANSPORT_ROUTES } from "./transportRouteConstants";

export type ServerMode = HttpapiServerModeResponse["mode"] | null;
export type EndpointOrigin = GeneratedEndpointOrigin;
export type WorkspaceLaunchRouteKind = GeneratedWorkspaceLaunchRouteKind;

export type ServerModeCapabilities = GeneratedServerModeCapabilities;

const NULL_SERVER_MODE_CAPABILITIES: ServerModeCapabilities = {
  canManageDesktopLauncher: false,
};

function requireGeneratedStringValue(
  value: string | undefined,
  name: string,
): string {
  if (value === undefined) {
    throw new Error(`Missing generated app-subsystem SDK value ${name}.`);
  }
  return value;
}

const BLOCKED_WORKSPACE_LAUNCH_ROUTE_KIND = requireGeneratedStringValue(
  WorkspaceLaunchRouteKindEnum.blocked,
  "WorkspaceLaunchRouteKind.blocked",
) as WorkspaceLaunchRouteKind;
const BACKEND_ORIGIN_ENDPOINT = requireGeneratedStringValue(
  EndpointOriginEnum.BackendOrigin,
  "EndpointOrigin.BackendOrigin",
) as EndpointOrigin;
const LAUNCHER_ENDPOINT = requireGeneratedStringValue(
  EndpointOriginEnum.launcher,
  "EndpointOrigin.launcher",
) as EndpointOrigin;
const BACKEND_ENDPOINT = requireGeneratedStringValue(
  EndpointOriginEnum.backend,
  "EndpointOrigin.backend",
) as EndpointOrigin;

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
    BLOCKED_WORKSPACE_LAUNCH_ROUTE_KIND,
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
    backendOriginValue: BACKEND_ORIGIN_ENDPOINT,
    launcherOriginValue: LAUNCHER_ENDPOINT,
    backendValue: BACKEND_ENDPOINT,
  });
}
