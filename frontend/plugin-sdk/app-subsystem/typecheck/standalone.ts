import type {
  AppSubsystemChatSlashCommandDefinition,
  AppSubsystemFrontendRegistration,
  BinaryContentRef,
  DropzoneStatelessAttachment,
} from "../types/index";
import {
  isGeneratedPythonIdentifier,
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
void validIdentifier;
void validationError;
void runCode;
void uploadBinary;
