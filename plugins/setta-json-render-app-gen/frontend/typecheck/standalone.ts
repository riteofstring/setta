import type {
  AppSubsystemFrontendRegistration,
  BinaryContentRef,
} from "@setta/app-subsystem-frontend-sdk";
import { runCode, uploadBinary } from "@setta/app-subsystem-frontend-sdk";

import {
  APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  buildAppGenerationSlashCommandDefinitions,
} from "../src/appSubsystemChatUi";
import { AppSubsystemChatUIConfig } from "../src/appSubsystemContracts";
import {
  applyAppDefinitionStructuredContentToStore,
  clearAllAppSpecPatchStreams,
} from "../src/appSubsystemPreviewController";
import { getRegisteredAppSubsystemPluginId } from "../src/appSubsystemPluginHost";

const registration: AppSubsystemFrontendRegistration = {
  chat: {
    slashCommands: buildAppGenerationSlashCommandDefinitions(),
    imageRequiredModes: [],
    customSlashCommandModes: {
      options: APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
      defaultMode: AppSubsystemChatUIConfig.defaultCustomSlashCommandMode,
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
clearAllAppSpecPatchStreams();
void getRegisteredAppSubsystemPluginId();
