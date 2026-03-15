const stopEligibleAssistantMessageIdByChatId = new Map<string, string>();

function normalizeChatId(chatId: string): string {
  return chatId.trim();
}

export function getStopEligibleAssistantMessageId(
  chatId: string,
): string | null {
  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) {
    return null;
  }
  return stopEligibleAssistantMessageIdByChatId.get(normalizedChatId) ?? null;
}

export function setStopEligibleAssistantMessageId(
  chatId: string,
  messageId: string,
): void {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedMessageId = messageId.trim();
  if (!normalizedChatId || !normalizedMessageId) {
    return;
  }
  stopEligibleAssistantMessageIdByChatId.set(
    normalizedChatId,
    normalizedMessageId,
  );
}

export function clearStopEligibleAssistantMessageId(chatId: string): void {
  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) {
    return;
  }
  stopEligibleAssistantMessageIdByChatId.delete(normalizedChatId);
}
