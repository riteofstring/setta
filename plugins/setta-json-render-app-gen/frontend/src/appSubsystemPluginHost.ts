import {
  registerAppSubsystemPlugin,
  type AppSubsystemFrontendRegistration,
  type AppSubsystemPluginRegistrationHost,
} from "@setta/app-subsystem-frontend-sdk";

let registeredAppSubsystemPluginHost: AppSubsystemPluginRegistrationHost | null =
  null;

export function registerAppSubsystemFrontend(
  host: unknown,
  registration: AppSubsystemFrontendRegistration,
): void {
  registeredAppSubsystemPluginHost = registerAppSubsystemPlugin(
    host,
    registration,
  );
}

export function getRegisteredAppSubsystemPluginId(): string | null {
  const pluginId = registeredAppSubsystemPluginHost?.pluginId?.trim() ?? "";
  return pluginId.length > 0 ? pluginId : null;
}
