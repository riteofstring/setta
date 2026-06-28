import type { ChatCommandDescriptor } from "@generated/backend";
import type { KeyboardEvent } from "react";

import { commandComposerState } from "./chat-command-composer-controller";
import { SettaLogoMark } from "./setta-logo-mark";

type CommandPaletteKeyAction = "complete" | "dismiss" | "next" | "none" | "previous";

export function commandPaletteKeyAction(
  event: KeyboardEvent<HTMLTextAreaElement>,
  context: {
    paletteVisible: boolean;
    slashDraft: boolean;
    suggestionCount: number;
  },
): CommandPaletteKeyAction {
  if (!context.slashDraft) {
    return "none";
  }
  if (event.key === "Tab" && !event.nativeEvent.isComposing) {
    return "complete";
  }
  if (!context.paletteVisible) {
    return "none";
  }
  if (event.key === "Escape") {
    return "dismiss";
  }
  if (context.suggestionCount === 0) {
    return "none";
  }
  return commandPaletteNavigationKeyAction(event.key);
}

function commandPaletteNavigationKeyAction(key: string): CommandPaletteKeyAction {
  if (key === "ArrowDown") {
    return "next";
  }
  if (key === "ArrowUp") {
    return "previous";
  }
  return "none";
}

export function isSlashDraft(draft: string) {
  return draft.startsWith("/");
}

export function commandSuggestions(commands: ChatCommandDescriptor[], draft: string) {
  return commandComposerState(draft, commands).suggestions;
}

export function composerTextareaLabel(selected: boolean) {
  return selected ? "Ask Setta" : "Start new chat";
}

export function composerAcceptsPrompt(selected: boolean, hasPromptSender: boolean) {
  return selected || hasPromptSender;
}

export function commandPaletteShouldOpen(
  slashDraft: boolean,
  paletteDismissed: boolean,
  modelPickerOpen: boolean,
) {
  return slashDraft && !paletteDismissed && !modelPickerOpen;
}

export function ComposerPlaceholder({
  selected,
  visible,
}: {
  selected: boolean;
  visible: boolean;
}) {
  if (!selected || !visible) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 flex h-4 items-center gap-1 text-xs leading-4 text-muted-foreground"
    >
      <span>Ask</span>
      <SettaLogoMark className="translate-y-[3px] opacity-60" height={11} />
    </div>
  );
}
