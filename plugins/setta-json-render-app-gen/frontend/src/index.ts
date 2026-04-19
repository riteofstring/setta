import "./index.css";
import {
  FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID,
  FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY,
  apiVersion,
  type FirstPartyAppSubsystemPluginHost,
  type FirstPartyPluginFrontendBridge,
  type FirstPartyPluginFrontendBridgeRegistry,
} from "./shared";

export { apiVersion } from "./shared";

function requirePluginHost(host: unknown): FirstPartyAppSubsystemPluginHost {
  if (
    !host ||
    typeof host !== "object" ||
    typeof (host as { registerAppSubsystem?: unknown }).registerAppSubsystem !==
      "function"
  ) {
    throw new Error(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers.",
    );
  }
  return host as FirstPartyAppSubsystemPluginHost;
}

function requireFirstPartyFrontendBridge(): FirstPartyPluginFrontendBridge {
  const registry = (
    globalThis as {
      [FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY]?:
        | FirstPartyPluginFrontendBridgeRegistry
        | undefined;
    }
  )[FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY];
  const bridge = registry?.[FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID];
  if (!bridge) {
    throw new Error(
      `Host-owned frontend bridge for ${FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID} is unavailable.`,
    );
  }
  if (bridge.apiVersion !== apiVersion) {
    throw new Error(
      `Host-owned frontend bridge for ${FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID} apiVersion mismatch. Expected ${apiVersion}.`,
    );
  }
  return bridge;
}

export function register(host: unknown): void {
  requireFirstPartyFrontendBridge().register(requirePluginHost(host));
}
