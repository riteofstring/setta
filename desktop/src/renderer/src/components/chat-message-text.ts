import type { ChatMessage } from "@generated/backend";

import { chatMessagePartsText } from "../lib/chat-input";

export function chatMessageText(message: ChatMessage) {
  return chatMessagePartsText(message.parts);
}
