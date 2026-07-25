import { decodeConversationPaletteID, type ConversationPaletteID } from "@generated/backend";

import {
  applyConversationPaletteStyle,
  clearConversationPaletteStyle,
} from "./conversation-palette-style";

export interface ConversationPaletteIdentity {
  conversationId: string;
  paletteId: ConversationPaletteID;
}

const conversationPaletteIdentityOwners = new WeakMap<HTMLElement, symbol>();

export function claimConversationPaletteIdentity(
  element: HTMLElement,
  identity: ConversationPaletteIdentity | null,
): () => void {
  const owner = Symbol("conversation-palette-identity");
  conversationPaletteIdentityOwners.set(element, owner);
  clearConversationPaletteIdentity(element);
  if (identity) {
    element.dataset.conversationId = identity.conversationId;
    element.dataset.conversationPalette = identity.paletteId;
    element.classList.add("conversation-presentation-identity");
    applyConversationPaletteStyle(element, identity.paletteId);
  }
  return () => {
    if (conversationPaletteIdentityOwners.get(element) !== owner) {
      return;
    }
    conversationPaletteIdentityOwners.delete(element);
    clearConversationPaletteIdentity(element);
  };
}

export function readConversationPanePaletteIdentity(
  element: HTMLElement,
): ConversationPaletteIdentity | null {
  const direct = readConversationPaletteIdentity(element);
  if (direct) {
    return direct;
  }
  const paletteElement = element.querySelector<HTMLElement>("[data-conversation-palette]");
  return paletteElement ? readConversationPaletteIdentity(paletteElement) : null;
}

function readConversationPaletteIdentity(element: HTMLElement): ConversationPaletteIdentity | null {
  const conversationId = element.dataset.conversationId;
  const paletteId = element.dataset.conversationPalette;
  if (!conversationId || !paletteId) {
    return null;
  }
  return {
    conversationId,
    paletteId: decodeConversationPaletteID(paletteId, "conversation palette identity"),
  };
}

function clearConversationPaletteIdentity(element: HTMLElement): void {
  clearConversationPaletteStyle(element);
  delete element.dataset.conversationId;
  delete element.dataset.conversationPalette;
  element.classList.remove("conversation-presentation-identity");
}
