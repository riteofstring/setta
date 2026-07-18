import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";
import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";
import { conversationComposerBindings } from "./easy-button-conversation-composer-bindings";

type EasyButtonConversationComposerBindings = ReturnType<typeof conversationComposerBindings>;

export type EasyButtonControlMode = "stop-listening" | "talk";

export interface EasyButtonControlAction {
  disabled: boolean;
  label: string;
  mode: EasyButtonControlMode;
  onClick: (() => void) | undefined;
}

/* The giant control is always the pane's voice/talk button — clicking it dictates
   into this conversation, and speaking while a run is working simply queues the
   follow-up. It flips to a stop affordance only while this pane is actively
   listening. Stopping a run is a separate, smaller control in the composer, so the
   big button never stops meaning "talk to your agent." */
export function conversationControlAction(
  commands: EasyButtonConversationCommands | undefined,
  readOnly: boolean,
  speech: PaneSpeechPresentation | null | undefined,
): EasyButtonControlAction {
  const bindings = conversationComposerBindings(readOnly ? undefined : commands);
  return paneIsListening(speech)
    ? listeningControlAction(bindings, speech)
    : talkControlAction(bindings, speech);
}

function paneIsListening(speech: PaneSpeechPresentation | null | undefined): boolean {
  return speech?.captureState === "listening" && speech.captureScope === "this_pane";
}

function listeningControlAction(
  bindings: EasyButtonConversationComposerBindings,
  speech: PaneSpeechPresentation | null | undefined,
): EasyButtonControlAction {
  return {
    disabled: false,
    label: speech?.voiceControlLabel ?? "Finish this voice request",
    mode: "stop-listening",
    onClick: bindings.onVoiceCapture,
  };
}

function talkControlAction(
  bindings: EasyButtonConversationComposerBindings,
  speech: PaneSpeechPresentation | null | undefined,
): EasyButtonControlAction {
  return {
    disabled:
      !bindings.onVoiceCapture || !bindings.available || (speech?.voiceControlDisabled ?? false),
    label: speech?.voiceControlLabel ?? "Start a voice request for this conversation",
    mode: "talk",
    onClick: bindings.onVoiceCapture,
  };
}
