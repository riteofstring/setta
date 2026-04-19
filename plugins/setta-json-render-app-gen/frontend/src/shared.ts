export const FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID =
  "setta-json-render-app-gen";
export const apiVersion = 1;
export const FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY =
  "__settaFirstPartyPluginFrontends__";

export type FirstPartyAppSubsystemPluginHost = {
  registerAppSubsystem: (registration: unknown) => void;
};

export type FirstPartyPluginFrontendBridge = {
  apiVersion: number;
  register: (host: FirstPartyAppSubsystemPluginHost) => void;
};

export type FirstPartyPluginFrontendBridgeRegistry = Record<
  string,
  FirstPartyPluginFrontendBridge
>;
