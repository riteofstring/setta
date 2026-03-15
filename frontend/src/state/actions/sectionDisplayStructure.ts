import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import type { Node } from "forks/xyflow/core/types";
import {
  useProjectState,
  type ZustandNodeInternalsState,
  type ZustandProjectState,
} from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  type BaseSectionImplUnion,
  isBaseParentSectionImpl,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { getEffectiveSectionImplIfPresent } from "./sectionEffectiveImplCore";
import {
  getSectionShouldRender,
  getSectionViewModeVisibilityIfPresent,
} from "./sectionViewModeVisibility";
import { getActiveViewModeTopLevelSections } from "./topLevelSectionLayouts";

export function getTopLevelSectionIdsForDisplay(
  projectState: ZustandProjectState,
): string[] {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  return Object.keys(topLevelSections).filter((sectionId) => {
    // Only true top-level sections should be rendered as React Flow nodes. If a
    // section has a parent, it will be rendered via the nested section tree.
    const parentId = projectState.parentSectionMap[sectionId] ?? null;
    if (parentId !== null) {
      return false;
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    return sectionImpl !== null;
  });
}

export function manualDndChildrenReset(): void {
  updateDndChildren(
    getDisplayedSectionIdToChildren(useProjectState.getState()),
  );
}

export function createNodesMapFromProjectConfigChildren(
  projectState: ZustandProjectState,
  nodes: ZustandNodeInternalsState["x"],
): Map<string, Node> {
  const nodesMap: Map<string, Node> = new Map();
  const darkMode = useLocalStorage.getState().darkMode;
  const { activeViewModeId, viewModes } = projectState.projectConfig;
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(projectState);
  const canFilterByView =
    Boolean(activeViewModeId) &&
    Boolean(activeViewModeId && viewModes[activeViewModeId]);

  for (const sectionId of topLevelSectionIds) {
    const layout = topLevelSections[sectionId];
    if (!layout) {
      continue;
    }
    if (canFilterByView) {
      const visibilityInfo = getSectionViewModeVisibilityIfPresent(
        sectionId,
        projectState,
      );
      if (!visibilityInfo) {
        continue;
      }
      if (
        !getSectionShouldRender(
          visibilityInfo.visibility,
          visibilityInfo.isEditingViewMode,
        )
      ) {
        continue;
      }
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    const sectionTheme =
      sectionImpl?.styleColor !== null &&
      sectionImpl?.styleColor !== undefined &&
      sectionImpl.styleColor.trim() !== ""
        ? deriveSectionStyleTheme(sectionImpl.styleColor, darkMode)
        : null;
    nodesMap.set(sectionId, {
      id: sectionId,
      position: { x: layout.x, y: layout.y },
      width: nodes.get(sectionId)?.width ?? layout.w,
      height: nodes.get(sectionId)?.height ?? layout.h,
      zIndex: layout.zIndex,
      tempZIndex: layout.zIndex,
      type: sectionImpl?.type,
      style: sectionTheme ? { background: sectionTheme.bg } : undefined,
    });
  }

  return nodesMap;
}

function getDisplayedSectionIdToChildrenHelper(
  sectionId: string,
  sectionImpl: BaseSectionImplUnion | null,
  state: ZustandProjectState,
  output: Record<string, Array<string>>,
): void {
  if (!sectionImpl) {
    return;
  }
  if (isBaseParentSectionImpl(sectionImpl)) {
    const displayedChildren: string[] = [];
    for (const childId of sectionImpl.children) {
      const childImpl = getEffectiveSectionImplIfPresent(state, childId);
      if (!childImpl) {
        continue;
      }
      displayedChildren.push(childId);
      getDisplayedSectionIdToChildrenHelper(childId, childImpl, state, output);
    }
    output[sectionId] = displayedChildren;
    return;
  }
  output[sectionId] = [];
}

export function getDisplayedSectionIdToChildren(
  state: ZustandProjectState,
): Record<string, Array<string>> {
  const output: Record<string, Array<string>> = {};
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(state);
  for (const sectionId of topLevelSectionIds) {
    const impl = getEffectiveSectionImplIfPresent(state, sectionId);
    getDisplayedSectionIdToChildrenHelper(sectionId, impl, state, output);
  }
  return output;
}
