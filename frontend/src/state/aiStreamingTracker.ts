const activeChatIds = new Set<string>();
const activeSectionIds = new Set<string>();
const lastFinalizedMessageIdBySectionId = new Map<string, string>();

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function markChatStreamActive(
  chatId: string | null | undefined,
  sectionId?: string | null,
) {
  const normalizedChatId = normalizeId(chatId);
  if (normalizedChatId) {
    activeChatIds.add(normalizedChatId);
  }
  const normalizedSectionId = normalizeId(sectionId);
  if (normalizedSectionId) {
    activeSectionIds.add(normalizedSectionId);
  }
}

export function clearChatStreamActive(
  chatId: string | null | undefined,
  sectionId?: string | null,
) {
  const normalizedChatId = normalizeId(chatId);
  if (normalizedChatId) {
    activeChatIds.delete(normalizedChatId);
  }
  const normalizedSectionId = normalizeId(sectionId);
  if (normalizedSectionId) {
    activeSectionIds.delete(normalizedSectionId);
  }
}

export function isChatStreamActive(chatId: string | null | undefined): boolean {
  const normalizedChatId = normalizeId(chatId);
  if (!normalizedChatId) {
    return false;
  }
  return activeChatIds.has(normalizedChatId);
}

export function isSectionStreamActive(
  sectionId: string | null | undefined,
): boolean {
  const normalizedSectionId = normalizeId(sectionId);
  if (!normalizedSectionId) {
    return false;
  }
  return activeSectionIds.has(normalizedSectionId);
}

export function recordFinalizedMessage(
  sectionId: string | null | undefined,
  messageId: string | null | undefined,
): void {
  const normalizedSectionId = normalizeId(sectionId);
  const normalizedMessageId = normalizeId(messageId);
  if (!normalizedSectionId || !normalizedMessageId) {
    return;
  }
  lastFinalizedMessageIdBySectionId.set(
    normalizedSectionId,
    normalizedMessageId,
  );
}

export function shouldPersistOnMessageStop(
  sectionId: string | null | undefined,
  messageId: string | null | undefined,
): boolean {
  const normalizedSectionId = normalizeId(sectionId);
  const normalizedMessageId = normalizeId(messageId);
  if (!normalizedSectionId || !normalizedMessageId) {
    return true;
  }
  const lastFinalized =
    lastFinalizedMessageIdBySectionId.get(normalizedSectionId);
  return lastFinalized !== normalizedMessageId;
}

export function resetStreamingTracker() {
  activeChatIds.clear();
  activeSectionIds.clear();
  lastFinalizedMessageIdBySectionId.clear();
}
