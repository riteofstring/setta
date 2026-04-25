import type { AppSubsystemFrontendRegistration } from "@setta/app-subsystem-frontend-sdk";

import {
  APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  buildAppGenerationSlashCommandDefinitions,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
} from "../src/appSubsystemChatUi";
import {
  applyAppDefinitionStructuredContentToStore,
  clearAllAppSpecPatchPreviewStreams,
} from "../src/appSubsystemPreviewController";
import {
  getRegisteredAppSubsystemPluginId,
  resetRegisteredAppSubsystemPluginHost,
} from "../src/appSubsystemPluginHost";

const registration: AppSubsystemFrontendRegistration = {
  chat: {
    slashCommands: buildAppGenerationSlashCommandDefinitions(),
    imageRequiredModes: [],
    customSlashCommandModes: {
      options: APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
      defaultMode: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
    },
  },
};

void registration;
void applyAppDefinitionStructuredContentToStore({ appSpec: null });
clearAllAppSpecPatchPreviewStreams();
void getRegisteredAppSubsystemPluginId();
resetRegisteredAppSubsystemPluginHost();
