import type {
  AppSubsystemFrontendRegistration,
  BinaryContentRef,
} from "@setta/app-subsystem-frontend-sdk";
import { runCode, uploadBinary } from "@setta/app-subsystem-frontend-sdk";

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
const binary: BinaryContentRef = {
  byteLength: 12,
  contentId: "content-1",
};

void registration;
void binary;
void runCode;
void uploadBinary;
void applyAppDefinitionStructuredContentToStore({ appSpec: null });
clearAllAppSpecPatchPreviewStreams();
void getRegisteredAppSubsystemPluginId();
resetRegisteredAppSubsystemPluginHost();
