type AIFollowIdsByProject = Record<
  string,
  Record<string, Record<string, Array<string>>>
>;

function getSectionIdsFromIdsByType(
  idsByType: Record<string, Array<string>> | undefined,
): Array<string> {
  return idsByType?.section ?? [];
}

export function getSectionIdsForProject(
  idsByProject: AIFollowIdsByProject,
  projectConfigId: string,
): Array<string> {
  const projectEntries = idsByProject[projectConfigId];
  if (!projectEntries) {
    return [];
  }
  const sectionIds = new Set<string>();
  for (const idsByType of Object.values(projectEntries)) {
    for (const sectionId of getSectionIdsFromIdsByType(idsByType)) {
      sectionIds.add(sectionId);
    }
  }
  return Array.from(sectionIds);
}

export function hasSectionIdInProject(
  idsByProject: AIFollowIdsByProject,
  projectConfigId: string,
  sectionId: string,
): boolean {
  const projectEntries = idsByProject[projectConfigId];
  if (!projectEntries) {
    return false;
  }
  for (const idsByType of Object.values(projectEntries)) {
    const sectionIds = getSectionIdsFromIdsByType(idsByType);
    if (sectionIds.includes(sectionId)) {
      return true;
    }
  }
  return false;
}
