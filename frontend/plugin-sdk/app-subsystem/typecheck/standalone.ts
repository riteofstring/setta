import type {
  AppSubsystemChatSlashCommandDefinition,
  AppSubsystemFrontendRegistration,
  BinaryContentRef,
  DropzoneStatelessAttachment,
} from "../types/index";
import { runCode, uploadBinary } from "../types/index";

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

void registration;
void attachment;
void binary;
void runCode;
void uploadBinary;
