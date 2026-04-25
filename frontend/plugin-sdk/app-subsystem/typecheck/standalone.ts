import type {
  AppSubsystemChatSlashCommandDefinition,
  AppSubsystemFrontendRegistration,
  DropzoneStatelessAttachment,
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

void registration;
void attachment;
