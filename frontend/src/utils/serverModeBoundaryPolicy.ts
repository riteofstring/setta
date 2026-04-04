import {
  GENERATED_ENDPOINT_ORIGIN_POLICY,
  resolveGeneratedEndpointOriginForMode,
  resolveGeneratedServerModeCapabilities,
  resolveGeneratedWorkspaceLaunchRouteKind,
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
  return resolveGeneratedServerModeCapabilities(mode);
}

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerMode,
): WorkspaceLaunchRouteKind {
  return resolveGeneratedWorkspaceLaunchRouteKind(mode);
}

export function resolveEndpointOriginForMode(
  address: string,
  serverMode: ServerMode,
): EndpointOriginPolicy {
  return resolveGeneratedEndpointOriginForMode(address, serverMode);
}
