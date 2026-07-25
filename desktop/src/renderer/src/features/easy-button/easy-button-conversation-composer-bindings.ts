import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";

interface ConversationComposerBindings {
  available: boolean;
  canSubmit: boolean;
  input: string;
  onInput: EasyButtonConversationCommands["setInput"] | undefined;
  onSubmit: EasyButtonConversationCommands["submit"] | undefined;
  onVoiceCapture: EasyButtonConversationCommands["requestVoiceCapture"];
}

const unavailableConversationComposerBindings: ConversationComposerBindings = {
  available: false,
  canSubmit: false,
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
    available:
      (commands.inputAvailable || commands.available || commands.folderResourceRequest !== null) &&
      !commands.pending,
    canSubmit: commands.canSubmit,
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
