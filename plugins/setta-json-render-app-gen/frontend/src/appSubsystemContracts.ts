import {
  AppGenerationModeEnum,
  AppSpecPatchPolicyConfig,
  AppSubsystemChatUIConfig,
  type AppsubsystemAppdefinitionAppDefinition as GeneratedAppDefinition,
} from "@setta/app-subsystem-frontend-sdk";

export {
  AppGenerationModeEnum,
  AppSpecPatchPolicyConfig,
  AppSubsystemChatUIConfig,
};

export type AppDefinition = GeneratedAppDefinition;
export type AppRoute = NonNullable<AppDefinition["routes"]>[number];
export type AppGenerationMode =
  (typeof AppGenerationModeEnum)[keyof typeof AppGenerationModeEnum];

export function createAppDefinition(
  options: Partial<AppDefinition> = {},
): AppDefinition {
  return options as AppDefinition;
}
