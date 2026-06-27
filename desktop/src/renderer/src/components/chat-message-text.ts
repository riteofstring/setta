import type { ChatMessage } from "@generated/backend";

export function chatMessageText(message: ChatMessage) {
  return message.parts.map((part) => part.text).join("");
}
