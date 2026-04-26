import type {
  AppSubsystemChatSlashCommandDefinition,
  AppSubsystemFrontendRegistration,
  BinaryContentRef,
  DropzoneStatelessAttachment,
  SettaPluginCanvasControlDefinition,
  SettaPluginHost,
} from "../types/index";
import {
  isGeneratedPythonIdentifier,
  isSettaPluginHost,
  runCode,
  uploadBinary,
  validateGeneratedParamNameInput,
} from "../types/index";

const slashCommands: AppSubsystemChatSlashCommandDefinition[] = [
  {
    command: "/app",
    action: "custom_prompt",
    summary: "Generate an app",
    appGenerationMode: "plain_chat",
  },
];

const registration: AppSubsystemFrontendRegistration = {
  chat: {
    slashCommands,
    imageRequiredModes: [],
    customSlashCommandModes: {
      options: [{ id: "plain_chat", name: "Plain chat" }],
      defaultMode: "plain_chat",
    },
  },
};

const attachment: DropzoneStatelessAttachment = {
  kind: "text",
  name: "notes.txt",
  text: "hello",
};
const binary: BinaryContentRef = {
  byteLength: 12,
  contentId: "content-1",
};
const canvasControl: SettaPluginCanvasControlDefinition = {
  id: "watch-code",
  label: "Watch Code",
  renderer: {
    mount: () => undefined,
  },
};
const pluginHost: Partial<SettaPluginHost> = {
  apiVersion: 1,
};
const validPluginHost = isSettaPluginHost(pluginHost);
const pythonIdentifierStartChars = new Set(["a", "_"]);
const pythonIdentifierContinueChars = new Set(["a", "1", "_"]);
const pythonKeywords = new Set(["class"]);
const validIdentifier = isGeneratedPythonIdentifier(
  "a_1",
  pythonIdentifierStartChars,
  pythonIdentifierContinueChars,
  pythonKeywords,
);
const validationError = validateGeneratedParamNameInput("a_1", {
  allowEmpty: false,
  label: "Param name",
  requirePythonIdentifier: true,
  pythonIdentifierStartChars,
  pythonIdentifierContinueChars,
  pythonKeywords,
});

void registration;
void attachment;
void binary;
void canvasControl;
void pluginHost;
void validPluginHost;
void validIdentifier;
void validationError;
void runCode;
void uploadBinary;
