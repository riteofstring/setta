import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { setSectionSize } from "state/actions/sections/sectionSizes";
import type { ZustandProjectState } from "state/definitions";
import {
  createSectionSize,
  type SectionSize,
  SectionTypeEnum,
} from "utils/generatedTypes";

// Padding constants - must match ContainerCore.tsx
const GROUP_HORIZONTAL_PADDING = 48; // px-6 = 24px left + 24px right
const GROUP_VERTICAL_PADDING = 80; // pt-2 + pb-6 + header + content padding

// Base minimum sizes for overflow groups
const GROUP_OVERFLOW_MIN_WIDTH = 250;
const GROUP_OVERFLOW_MIN_HEIGHT = 185;

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

function getNumericSectionSize(
  value: SectionSize["width"] | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
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
    if (!parentId) {
      return null;
    }

    const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
    if (parentImpl.type === SectionTypeEnum.Group && parentImpl.overflowMode) {
      const isHorizontal = parentImpl.isHorizontalOrientation ?? false;
      const matchesAxis = axis === "height" ? isHorizontal : !isHorizontal;
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
    // Use parentSectionMap for parent relationships
    const parentId = state.parentSectionMap[currentId] ?? null;
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

type NestedMinimumSize = {
  minWidth: number;
  minHeight: number;
};

/**
 * Recursively calculates the minimum size needed for a group based on its nested children.
 * For groups nested inside, we need to account for their sizes + padding.
 */
export function calculateNestedGroupMinimumSize(
  groupId: string,
  state: ZustandProjectState,
): NestedMinimumSize {
  const groupImpl = getCurrEffectiveSectionImplOfType(
    state,
    groupId,
    SectionTypeEnum.Group,
  );

  // Start with base minimum sizes
  let minWidth = GROUP_OVERFLOW_MIN_WIDTH;
  let minHeight = GROUP_OVERFLOW_MIN_HEIGHT;

  // If no children, return base minimums
  if (!groupImpl.children || groupImpl.children.length === 0) {
    return { minWidth, minHeight };
  }

  // Calculate minimum size needed to contain the largest nested child without clipping
  for (const childId of groupImpl.children) {
    const childImpl = getCurrEffectiveSectionImpl(state, childId);

    let childMinWidth = GROUP_OVERFLOW_MIN_WIDTH;
    let childMinHeight = GROUP_OVERFLOW_MIN_HEIGHT;

    // If child is a group, recursively calculate its minimum size
    if (childImpl.type === SectionTypeEnum.Group) {
      const nestedMin = calculateNestedGroupMinimumSize(childId, state);
      childMinWidth = nestedMin.minWidth;
      childMinHeight = nestedMin.minHeight;

      const childWidth = getNumericSectionSize(childImpl.size?.width);
      if (childWidth !== null) {
        childMinWidth = Math.max(childMinWidth, childWidth);
      }

      const childHeight = getNumericSectionSize(childImpl.size?.height);
      if (childHeight !== null) {
        childMinHeight = Math.max(childMinHeight, childHeight);
      }

      const childOverflowMinWidth = getNumericSectionSize(
        childImpl.overflowMinSize?.width,
      );
      if (childOverflowMinWidth !== null) {
        childMinWidth = Math.max(childMinWidth, childOverflowMinWidth);
      }

      const childOverflowMinHeight = getNumericSectionSize(
        childImpl.overflowMinSize?.height,
      );
      if (childOverflowMinHeight !== null) {
        childMinHeight = Math.max(childMinHeight, childOverflowMinHeight);
      }
    }

    // Keep both axes at least as large as the largest nested child + padding
    // so overflow groups can't shrink below nested group minimums.
    minWidth = Math.max(minWidth, childMinWidth + GROUP_HORIZONTAL_PADDING);
    minHeight = Math.max(minHeight, childMinHeight + GROUP_VERTICAL_PADDING);
  }

  return { minWidth, minHeight };
}

/**
 * After adding a section to an overflow group, recalculate minimum sizes
 * for all ancestor overflow groups and expand them if necessary.
 */
export function adjustOverflowGroupMinimumSizes(
  newParentId: string | null,
  state: ZustandProjectState,
): Record<string, SectionSize> {
  const updates: Record<string, SectionSize> = {};

  if (!newParentId) {
    return updates;
  }

  let currentId: string | null = newParentId;

  while (currentId) {
    // Check if this is an overflow group
    let impl;
    try {
      impl = getCurrEffectiveSectionImplOfType(
        state,
        currentId,
        SectionTypeEnum.Group,
      );
    } catch {
      // Not a group, move up
      currentId = state.parentSectionMap[currentId] ?? null;
      continue;
    }

    if (!impl.overflowMode) {
      // Not an overflow group, move up
      currentId = state.parentSectionMap[currentId] ?? null;
      continue;
    }

    // Calculate the new minimum size for this overflow group
    const nestedMin = calculateNestedGroupMinimumSize(currentId, state);
    const newOverflowMinSize = createSectionSize({
      width: nestedMin.minWidth,
      height: nestedMin.minHeight,
    });

    // Update the overflowMinSize on the impl
    setCurrEffectiveSectionImplValue<"GroupSection">(state, currentId, {
      overflowMinSize: newOverflowMinSize,
    });

    // Check if current size is smaller than new minimum - if so, expand
    const currentWidth =
      typeof impl.size.width === "number" ? impl.size.width : 0;
    const currentHeight =
      typeof impl.size.height === "number" ? impl.size.height : 0;

    const needsExpansion =
      currentWidth < nestedMin.minWidth || currentHeight < nestedMin.minHeight;

    if (needsExpansion) {
      const expandedSize: Partial<SectionSize> = {};
      if (currentWidth < nestedMin.minWidth) {
        expandedSize.width = nestedMin.minWidth;
      }
      if (currentHeight < nestedMin.minHeight) {
        expandedSize.height = nestedMin.minHeight;
      }
      updates[currentId] = setSectionSize(currentId, expandedSize, state);
    }

    // Move up to parent
    currentId = state.parentSectionMap[currentId] ?? null;
  }

  return updates;
}
