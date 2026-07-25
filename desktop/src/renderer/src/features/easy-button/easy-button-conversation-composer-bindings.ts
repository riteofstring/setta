import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";

interface ConversationComposerBindings {
  canSubmit: boolean;
  inputAvailable: boolean;
  input: string;
  onInput: EasyButtonConversationCommands["setInput"] | undefined;
  onSubmit: EasyButtonConversationCommands["submit"] | undefined;
  onVoiceCapture: EasyButtonConversationCommands["requestVoiceCapture"];
}

const unavailableConversationComposerBindings: ConversationComposerBindings = {
  canSubmit: false,
  inputAvailable: false,
  input: "",
  onInput: undefined,
  onSubmit: undefined,
  onVoiceCapture: undefined,
};

export function conversationComposerBindings(
  commands: EasyButtonConversationCommands | undefined,
): ConversationComposerBindings {
  if (!commands) {
    return unavailableConversationComposerBindings;
  }
  const bindings: ConversationComposerBindings = {
    canSubmit: commands.canSubmit,
    inputAvailable:
      (commands.inputAvailable ||
        commands.workspaceCommandsAvailable ||
        commands.folderResourceRequest !== null) &&
      !commands.pending,
    input: commands.input,
    onInput: commands.setInput,
    onSubmit: commands.submit,
    onVoiceCapture: commands.requestVoiceCapture,
  };
  if (commands.clarificationQuestion === null) {
    return bindings;
  }
  return {
    ...bindings,
    onVoiceCapture: undefined,
  };
}
