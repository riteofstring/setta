import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
} from "state/actions/sectionInfos";
import { setSectionSize } from "state/actions/sections/sectionSizes";
import type { ZustandProjectState } from "state/definitions";
import { type SectionSize, SectionTypeEnum } from "utils/generatedTypes";

export type CrossAxis = "width" | "height";

type OverflowParentResizeInput = {
  sectionId: string;
  newWidth: number | "auto" | undefined;
  newHeight: number | "auto" | undefined;
  state: ZustandProjectState;
};

function getAxisUpdate(axis: CrossAxis, axisSize: number): Partial<SectionSize> {
  if (axis === "width") {
    return { width: axisSize };
  }
  return { height: axisSize };
}

export function getClosestOverflowGroupIdForAxis({
  sectionId,
  axis,
  state,
}: {
  sectionId: string;
  axis: CrossAxis;
  state: ZustandProjectState;
}): string | null {
  let currentId: string | null = sectionId;

  while (currentId) {
    // Use parentSectionMap for parent relationships, not impl.parentId
    const parentId = state.parentSectionMap[currentId] ?? null;
    console.log("[DEBUG] Walking parent chain:", {
      currentId,
      parentId,
    });
    if (!parentId) {
      return null;
    }

    const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
    console.log("[DEBUG] Checking parent:", {
      parentId,
      parentType: parentImpl.type,
      overflowMode: parentImpl.overflowMode,
      isHorizontalOrientation: parentImpl.isHorizontalOrientation,
      axis,
    });
    if (parentImpl.type === SectionTypeEnum.Group && parentImpl.overflowMode) {
      const isHorizontal = parentImpl.isHorizontalOrientation ?? false;
      const matchesAxis = axis === "height" ? isHorizontal : !isHorizontal;
      console.log("[DEBUG] Found overflow group:", {
        parentId,
        isHorizontal,
        matchesAxis,
      });
      if (matchesAxis) {
        return parentId;
      }
      return null;
    }

    currentId = parentId;
  }

  return null;
}

export function setOverflowGroupCrossAxisSize({
  groupId,
  axis,
  axisSize,
  state,
  includeChildren,
  includeGroup,
}: {
  groupId: string;
  axis: CrossAxis;
  axisSize: number;
  state: ZustandProjectState;
  includeChildren: boolean;
  includeGroup: boolean;
}): Record<string, SectionSize> {
  const updates: Record<string, SectionSize> = {};
  const groupImpl = getCurrEffectiveSectionImplOfType(
    state,
    groupId,
    SectionTypeEnum.Group,
  );

  if (!groupImpl.overflowMode) {
    return updates;
  }

  const sizeUpdate = getAxisUpdate(axis, axisSize);

  if (includeGroup) {
    updates[groupId] = setSectionSize(groupId, sizeUpdate, state);
  }

  if (includeChildren) {
    for (const childId of groupImpl.children) {
      updates[childId] = setSectionSize(childId, sizeUpdate, state);
    }
  }

  return updates;
}

export function getOverflowParentSizeUpdates({
  sectionId,
  newWidth,
  newHeight,
  state,
}: OverflowParentResizeInput): Record<string, Partial<SectionSize>> {
  const updates: Record<string, Partial<SectionSize>> = {};
  const didResizeWidth = typeof newWidth === "number";
  const didResizeHeight = typeof newHeight === "number";
  const resizeWidthOnly = didResizeWidth && !didResizeHeight;
  const resizeHeightOnly = didResizeHeight && !didResizeWidth;
  if (!didResizeWidth && !didResizeHeight) {
    return updates;
  }

  let currentId: string | null = sectionId;

  while (currentId) {
    const impl = getCurrEffectiveSectionImpl(state, currentId);
    const parentId = impl.parentId ?? null;
    if (!parentId) {
      break;
    }

    const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
    if (parentImpl.type !== SectionTypeEnum.Group) {
      currentId = parentId;
      continue;
    }

    if (!parentImpl.overflowMode) {
      currentId = parentId;
      continue;
    }

    const parentUpdate: Partial<SectionSize> = {};
    const isHorizontal = parentImpl.isHorizontalOrientation ?? false;

    if (resizeWidthOnly && isHorizontal) {
      break;
    }

    if (resizeHeightOnly && !isHorizontal) {
      break;
    }

    if (!isHorizontal && typeof newWidth === "number") {
      const parentWidth =
        typeof parentImpl.size.width === "number" ? parentImpl.size.width : 0;
      if (newWidth > parentWidth) {
        parentUpdate.width = newWidth;
      }
    }

    if (isHorizontal && typeof newHeight === "number") {
      const parentHeight =
        typeof parentImpl.size.height === "number" ? parentImpl.size.height : 0;
      if (newHeight > parentHeight) {
        parentUpdate.height = newHeight;
      }
    }

    if (parentUpdate.width !== undefined || parentUpdate.height !== undefined) {
      updates[parentId] = parentUpdate;
    }

    currentId = parentId;
  }

  return updates;
}

export function applyOverflowParentSizeUpdates({
  sectionId,
  newWidth,
  newHeight,
  state,
}: OverflowParentResizeInput): Record<string, SectionSize> {
  const updates: Record<string, SectionSize> = {};
  const parentUpdates = getOverflowParentSizeUpdates({
    sectionId,
    newWidth,
    newHeight,
    state,
  });

  for (const [parentId, parentUpdate] of Object.entries(parentUpdates)) {
    updates[parentId] = setSectionSize(parentId, parentUpdate, state);
  }

  return updates;
}
