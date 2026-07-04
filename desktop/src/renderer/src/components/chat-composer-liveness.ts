import type { ChatInput } from "@generated/backend";

import { chatInputHasContent } from "../lib/chat-input";
import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import type { ChatView } from "./chat-panel";

export function composerCanSteer(running: boolean, runPresentation: ActiveRunPresentation) {
  return running && runPresentation.canSteer;
}

export function composerSendDisabled(
  disabled: boolean,
  running: boolean,
  runPresentation: ActiveRunPresentation,
) {
  return disabled || (running && !runPresentation.canSteer);
}

export type ActiveRunSubmitMode = "blocked" | "send" | "steer";

export function activeRunSubmitMode(
  running: boolean,
  runPresentation: ActiveRunPresentation,
): ActiveRunSubmitMode {
  if (!running) {
    return "send";
  }
  return runPresentation.canSteer ? "steer" : "blocked";
}

export function canQueueComposerDraft({
  attaching,
  disabled,
  input,
  running,
  runPresentation,
  selectedConversation,
  submitting,
  supportsAttachments,
}: {
  attaching: boolean;
  disabled: boolean;
  input: ChatInput;
  running: boolean;
  runPresentation: ActiveRunPresentation;
  selectedConversation: ChatView["selectedConversation"];
  submitting: boolean;
  supportsAttachments: boolean;
}) {
  return (
    chatInputHasContent(input) &&
    selectedConversation !== null &&
    !disabled &&
    !attaching &&
    supportsAttachments &&
    !submitting &&
    activeRunSubmitMode(running, runPresentation) !== "blocked"
  );
}
