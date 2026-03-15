import { type ZustandProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { getCurrEffectiveSectionImpl } from "../sectionEffectiveImplSelectors";
import { isBaseCodeSectionType } from "../sectionStructureQueries";

export function isCodeSection(
  state: ZustandProjectState,
  sectionId: string,
): boolean {
  return isBaseCodeSectionType(
    getCurrEffectiveSectionImpl(state, sectionId).type,
  );
}

export function isTerminalSection(
  state: ZustandProjectState,
  sectionId: string,
): boolean {
  return (
    getCurrEffectiveSectionImpl(state, sectionId).type ===
    SectionTypeEnum.Terminal
  );
}

export function shouldUseAttachedTerminalRoute({
  state,
  sectionIds,
  newParentId,
}: {
  state: ZustandProjectState;
  sectionIds: string[];
  newParentId: string | null;
}): boolean {
  if (!newParentId) {
    return false;
  }
  if (sectionIds.length !== 1) {
    return false;
  }
  if (!isCodeSection(state, newParentId)) {
    return false;
  }
  return isTerminalSection(state, sectionIds[0]);
}

export function resolveParentIds(
  state: ZustandProjectState,
  sectionIds: string[],
): Record<string, string | null> {
  const parentsById: Record<string, string | null> = {};
  for (const sectionId of sectionIds) {
    parentsById[sectionId] = state.parentSectionMap[sectionId] ?? null;
  }
  return parentsById;
}
