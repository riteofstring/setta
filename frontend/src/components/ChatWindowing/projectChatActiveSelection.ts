export function resolveProjectChatShortcutActiveSectionId(
  activeSectionUiId: string | null | undefined,
  durableActiveSectionId: string | null | undefined,
): string | null {
  return activeSectionUiId ?? durableActiveSectionId ?? null;
}
