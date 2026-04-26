import { resolveGeneratedEndpointOriginForMode } from "../../plugin-sdk/app-subsystem/src/bindingRuntime";
import type {
  EndpointOrigin,
  ServerMode,
} from "../../plugin-sdk/app-subsystem/src/serverModeBoundaryPolicy";
import {
  EndpointOriginEnum,
  EndpointOriginPolicyByRoute,
  ModeScopedLauncherRoutesList,
} from "./generatedTypes";
import { ROOT_TRANSPORT_ROUTES } from "./transportRouteConstants";

export {
  resolveServerModeCapabilities,
  resolveWorkspaceLaunchRouteKind,
  type EndpointOrigin,
  type WorkspaceLaunchRouteKind,
} from "../../plugin-sdk/app-subsystem/src/serverModeBoundaryPolicy";

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
