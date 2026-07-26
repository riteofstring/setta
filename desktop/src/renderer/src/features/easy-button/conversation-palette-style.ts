import { conversationPaletteCatalog, type ConversationPaletteID } from "@generated/backend";
import type { CSSProperties } from "react";

export type ConversationPaletteStyle = CSSProperties & {
  "--conversation-accent-dark": string;
  "--conversation-accent-foreground-dark": string;
  "--conversation-accent-foreground-light": string;
  "--conversation-accent-light": string;
  "--conversation-focus-ring-dark": string;
  "--conversation-focus-ring-light": string;
};

const conversationPaletteStyleProperties = [
  "--conversation-accent-dark",
  "--conversation-accent-foreground-dark",
  "--conversation-accent-foreground-light",
  "--conversation-accent-light",
  "--conversation-focus-ring-dark",
  "--conversation-focus-ring-light",
] as const;

export function conversationPaletteStyle(
  paletteId: ConversationPaletteID | null,
): ConversationPaletteStyle | undefined {
  if (!paletteId) {
    return undefined;
  }
  const palette = conversationPaletteCatalog[paletteId];
  return {
    "--conversation-accent-dark": palette.dark.conversationAccent,
    "--conversation-accent-foreground-dark": palette.dark.conversationAccentForeground,
    "--conversation-accent-foreground-light": palette.light.conversationAccentForeground,
    "--conversation-accent-light": palette.light.conversationAccent,
    "--conversation-focus-ring-dark": palette.dark.conversationFocusRing,
    "--conversation-focus-ring-light": palette.light.conversationFocusRing,
  };
}

export function applyConversationPaletteStyle(
  element: HTMLElement,
  paletteId: ConversationPaletteID,
): () => void {
  const style = conversationPaletteStyle(paletteId);
  if (!style) {
    throw new Error(`Conversation palette ${paletteId} did not resolve to semantic tokens.`);
  }
  for (const [name, value] of Object.entries(style)) {
    element.style.setProperty(name, value);
  }
  return () => {
    clearConversationPaletteStyle(element);
  };
}

export function clearConversationPaletteStyle(element: HTMLElement): void {
  for (const name of conversationPaletteStyleProperties) {
    element.style.removeProperty(name);
  }
}
