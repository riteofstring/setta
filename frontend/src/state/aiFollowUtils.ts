type AIFollowIdsByProject = Record<
  string,
  Record<string, Record<string, Array<string>>>
>;

function getSectionIdsFromIdsByType(
  idsByType: Record<string, Array<string>> | undefined,
): Array<string> {
  return idsByType?.section ?? [];
}

export function getSectionIdsForChat(
  idsByProject: AIFollowIdsByProject,
  projectConfigId: string,
  chatId: string | null | undefined,
): Array<string> {
  if (!chatId) {
    return [];
  }
  const projectEntries = idsByProject[projectConfigId];
  if (!projectEntries) {
    return [];
  }
  return getSectionIdsFromIdsByType(projectEntries[chatId]);
}

export function hasSectionIdForChat(
  idsByProject: AIFollowIdsByProject,
  projectConfigId: string,
  sectionId: string,
  chatId: string | null | undefined,
): boolean {
  const projectEntries = idsByProject[projectConfigId];
  if (!projectEntries) {
    return false;
  }
  if (chatId) {
    const sectionIds = getSectionIdsFromIdsByType(projectEntries[chatId]);
    return sectionIds.includes(sectionId);
  }
  for (const idsByType of Object.values(projectEntries)) {
    const sectionIds = getSectionIdsFromIdsByType(idsByType);
    if (sectionIds.includes(sectionId)) {
      return true;
    }
  }
  return false;
}
