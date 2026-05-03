import { getActiveViewModeTopLevelSections } from "state/actions/sectionInfos/codeObjectsAndLayout";
import type { SingleConfig } from "utils/generatedTypes";

export function selectActiveResizeSectionIds(
  resizeEvents: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return Object.keys(resizeEvents)
    .filter((sectionId) => resizeEvents[sectionId] === "start")
    .sort();
}

export function resolveProjectGpuNestedResizePaintSuppressionNodeIds(
  projectState: SingleConfig,
  activeResizeSectionIds: readonly string[],
): readonly string[] {
  if (activeResizeSectionIds.length === 0) {
    return [];
  }
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const nodeIds = new Set<string>();
  for (const sectionId of activeResizeSectionIds) {
    if ((projectState.parentSectionMap[sectionId] ?? null) === null) {
      continue;
    }
    const topLevelSectionId = resolveTopLevelSectionId(
      projectState.parentSectionMap,
      sectionId,
    );
    if (
      Object.prototype.hasOwnProperty.call(topLevelSections, topLevelSectionId)
    ) {
      nodeIds.add(topLevelSectionId);
    }
  }
  return [...nodeIds].sort();
}

function resolveTopLevelSectionId(
  parentSectionMap: Readonly<Record<string, string | null | undefined>>,
  sectionId: string,
): string {
  let topLevelSectionId = sectionId;
  let parentId = parentSectionMap[sectionId] ?? null;
  while (parentId) {
    topLevelSectionId = parentId;
    parentId = parentSectionMap[parentId] ?? null;
  }
  return topLevelSectionId;
}
