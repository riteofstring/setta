import {
  appSubsystemFrontendRegistration,
  apiVersion,
} from "../../../plugins/setta-json-render-app-gen/frontend/src/registration";
import {
  FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID,
  FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY,
  type FirstPartyPluginFrontendBridgeRegistry,
} from "../../../plugins/setta-json-render-app-gen/frontend/src/shared";

declare global {
  var __settaFirstPartyPluginFrontends__:
    | FirstPartyPluginFrontendBridgeRegistry
    | undefined;
}

function getFirstPartyPluginFrontendRegistry(): FirstPartyPluginFrontendBridgeRegistry {
  const existing = globalThis[FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY];
  if (existing) {
    return existing;
  }
  const nextRegistry: FirstPartyPluginFrontendBridgeRegistry = {};
  globalThis[FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY] = nextRegistry;
  return nextRegistry;
}

export function installFirstPartyPluginFrontendBridge(
  pluginId: string,
): boolean {
  if (pluginId !== FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID) {
    return false;
  }
  const registry = getFirstPartyPluginFrontendRegistry();
  registry[pluginId] = {
    apiVersion,
    register: (host) => {
      host.registerAppSubsystem(appSubsystemFrontendRegistration);
    },
  };
  return true;
}
