import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";

interface ConversationComposerBindings {
  available: boolean;
  canSubmit: boolean;
  input: string;
  onFork: EasyButtonConversationCommands["fork"] | undefined;
  onInput: EasyButtonConversationCommands["setInput"] | undefined;
  onQueue: EasyButtonConversationCommands["queue"] | undefined;
  onSend: EasyButtonConversationCommands["send"] | undefined;
  onSide: EasyButtonConversationCommands["startSide"];
  onStatus: EasyButtonConversationCommands["askStatus"] | undefined;
  onSteer: EasyButtonConversationCommands["steer"] | undefined;
  onSubmit: EasyButtonConversationCommands["submit"] | undefined;
  onVoiceCapture: EasyButtonConversationCommands["requestVoiceCapture"];
}

const unavailableConversationComposerBindings: ConversationComposerBindings = {
  available: false,
  canSubmit: false,
  input: "",
  onFork: undefined,
  onInput: undefined,
  onQueue: undefined,
  onSend: undefined,
  onSide: undefined,
  onStatus: undefined,
  onSteer: undefined,
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
    available: commands.available && !commands.pending,
    canSubmit: commands.canSubmit,
    input: commands.input,
    onFork: commands.fork,
    onInput: commands.setInput,
    onQueue: commands.queue,
    onSend: commands.send,
    onSide: commands.startSide,
    onStatus: commands.askStatus,
    onSteer: commands.steer,
    onSubmit: commands.submit,
    onVoiceCapture: commands.requestVoiceCapture,
  };
  if (commands.clarificationQuestion === null) {
    return bindings;
  }
  return {
    ...bindings,
    onFork: undefined,
    onQueue: undefined,
    onSend: undefined,
    onSide: undefined,
    onStatus: undefined,
    onSteer: undefined,
    onVoiceCapture: undefined,
  };
}
