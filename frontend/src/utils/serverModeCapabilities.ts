import {
  resolveServerModeCapabilities as resolveServerModeCapabilitiesFromPolicy,
  type ServerMode,
  type ServerModeCapabilities,
} from "./serverModeBoundaryPolicy";

export function resolveServerModeCapabilities(
  mode: ServerMode,
): ServerModeCapabilities {
  return resolveServerModeCapabilitiesFromPolicy(mode);
}
