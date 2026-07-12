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
    for (const name of Object.keys(style)) {
      element.style.removeProperty(name);
    }
  };
}
