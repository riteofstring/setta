import { useProjectState, type ZustandProjectState } from "state/definitions";
import { isBaseParentSectionImpl } from "utils/generatedTypes";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "./sectionEffectiveImplSelectors";

export function getSectionInfo(sectionId: string) {
  return useProjectState.getState().sections[sectionId];
}

export function getHighestAncestor(
  sectionId: string,
  parentIdGetter: (id: string) => string | null = (id) =>
    useProjectState.getState().parentSectionMap[id] ?? null,
): string {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }

  return highestAncestor;
}

export function getSectionDescendants(
  sectionId: string,
  state: ZustandProjectState,
): Array<string> {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    if (currId) {
      const impl = getCurrEffectiveSectionImpl(state, currId);
      if (isBaseParentSectionImpl(impl)) {
        ids.push(...impl.children);
      }
    }
    idx += 1;
  }
  return ids;
}

export function setSectionChildren(
  state: ZustandProjectState,
  sectionId: string,
  newStateFn: (currChildren: Array<string>) => Array<string>,
): void {
  setCurrEffectiveSectionImplValue<"BaseParentSection">(state, sectionId, {
    children: newStateFn,
  });
}

export function resetSectionsToDefaultVersions(
  sectionIds: Array<string>,
): void {
  useProjectState.setState((state) => {
    for (const id of sectionIds) {
      const section = state.sections[id];
      section.variantId = section.defaultVariantId;
    }
  });
}

export function resetAllSectionsToDefaultVersions(): void {
  resetSectionsToDefaultVersions(
    Object.keys(useProjectState.getState().sections),
  );
}
