import { AppSubsystemChatUIConfig } from "@setta/app-subsystem-frontend-sdk";
import { buildChatSlashCommands } from "./chatComposerControls";

const APP_SUBSYSTEM_IMAGE_REQUIRED_MODES = new Set(
  AppSubsystemChatUIConfig.customSlashCommandModeOptions
    .filter((option) => option.requiresImageAttachment)
    .map((option) => option.value),
);

export const APP_GENERATION_COMMANDS = buildChatSlashCommands({
  appGenerationCommands: AppSubsystemChatUIConfig.slashCommands.map(
    (entry) => ({
      command: entry.command,
      action: entry.action,
      summary: entry.summary,
      promptTemplate: entry.promptTemplate,
      appGenerationMode: entry.appGenerationMode,
      requiresImageAttachment: APP_SUBSYSTEM_IMAGE_REQUIRED_MODES.has(
        entry.appGenerationMode,
      ),
    }),
  ),
});

export function getAppGenerationPrompt(command: string): string {
  const entry = APP_GENERATION_COMMANDS.find(
    (slashCommand) => slashCommand.command === command,
  );
  if (!entry?.promptTemplate) {
    throw new Error(`Missing app generation prompt for ${command}.`);
  }
  return entry.promptTemplate;
}

export function getComposerElements(host: HTMLDivElement): {
  textarea: HTMLTextAreaElement;
  submitButton: HTMLButtonElement;
} {
  const textarea = host.querySelector(
    '[data-testid="chat-input-textarea"]',
  ) as HTMLTextAreaElement | null;
  const submitButton = host.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement | null;
  if (!textarea || !submitButton) {
    throw new Error("Expected chat input controls.");
  }
  return { textarea, submitButton };
}

export function setTextareaValue(
  textarea: HTMLTextAreaElement,
  value: string,
): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (!valueSetter) {
    throw new Error("Expected textarea value setter.");
  }
  valueSetter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  if (!resolve) {
    throw new Error("Expected deferred promise resolver.");
  }
  return { promise, resolve };
}
