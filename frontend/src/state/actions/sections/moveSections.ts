import { addNodes, deleteNodes } from "state/actions/nodeInternals";
import { ZustandProjectState } from "state/definitions";
import {
  route_move_section,
  route_set_section_sizes,
} from "utils/generatedEndpoints";
import { Position, SectionSize, SectionTypeEnum } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setSectionChildren,
} from "../sectionInfos";
import { setSectionSize } from "./sectionSizes";

function moveSections({
  sectionIds,
  oldParentIds,
  newParentIds,
  positions,
  oldParentId,
  newParentId,
  state,
}) {
  for (const [idx, sectionId] of sectionIds.entries()) {
    moveSection({
      oldParentId: oldParentIds ? oldParentIds[sectionId] : oldParentId,
      newParentId: newParentIds ? newParentIds[sectionId] : newParentId,
      oldSectionId: sectionId,
      newSectionId: sectionId,
      newIndex: idx,
      position: positions ? positions[sectionId] : null,
      state,
    });
  }
}

function moveSection({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
  state,
}: {
  oldParentId: string | null;
  newParentId: string | null;
  oldSectionId: string;
  newSectionId: string;
  newIndex: number | null;
  position: Position | null;
  state: ZustandProjectState;
}): Record<string, SectionSize> {
  setChildrenAndParent({
    oldParentId,
    newParentId,
    oldSectionId,
    newSectionId,
    newIndex,
    position,
    state,
  });

  return syncSectionSizeToOverflowGroup(newParentId, newSectionId, state);
}

// Group container has px-6 = 24px left + 24px right = 48px total horizontal padding
const GROUP_HORIZONTAL_PADDING = 48;

/**
 * When a section is dropped into an overflow group, sync its width to match the group's children
 */
function syncSectionSizeToOverflowGroup(
  newParentId: string | null,
  sectionId: string,
  state: ZustandProjectState,
): Record<string, SectionSize> {
  const updates: Record<string, SectionSize> = {};

  if (!newParentId) {
    return updates;
  }

  // Check if parent is an overflow group
  let parentImpl;
  try {
    parentImpl = getCurrEffectiveSectionImplOfType(
      state,
      newParentId,
      SectionTypeEnum.Group,
    );
  } catch {
    return updates;
  }

  if (!parentImpl.overflowMode) {
    return updates;
  }

  // For vertical listing, sync width (cross-axis)
  const isHorizontal = parentImpl.isHorizontalOrientation ?? false;
  if (isHorizontal) {
    // TODO: Handle horizontal listing (sync height)
    return updates;
  }

  // Get the target width from the group (minus padding)
  const groupWidth = parentImpl.size.width;
  if (typeof groupWidth !== "number") {
    return updates;
  }

  const childWidth = groupWidth - GROUP_HORIZONTAL_PADDING;
  const newSize = setSectionSize(sectionId, { width: childWidth }, state);
  updates[sectionId] = newSize;

  return updates;
}

export function moveSectionWithBackend({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
  position,
}: {
  oldParentId: string | null;
  newParentId: string | null;
  sectionId: string;
  newIndex: number | null;
  position: Position | null;
}) {
  let sizeUpdates: Record<string, SectionSize> = {};

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      sizeUpdates = moveSection({
        oldParentId,
        newParentId,
        oldSectionId: sectionId,
        newSectionId: sectionId,
        newIndex,
        position,
        state,
      });
    },
    send: async (frontendOpId) => {
      await route_move_section({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        newParentId,
        newIndex,
        position,
        frontendOpId,
      });
      // Also persist size changes if any
      if (Object.keys(sizeUpdates).length > 0) {
        await route_set_section_sizes({
          projectConfigId: getCurrProjectConfigId(),
          sectionSizes: sizeUpdates,
          frontendOpId,
        });
      }
    },
  });
}

function setChildrenAndParent({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
  state,
}: {
  oldParentId: string | null;
  newParentId: string | null;
  oldSectionId: string;
  newSectionId: string;
  newIndex: number | null;
  position: Position | null;
  state: ZustandProjectState;
}) {
  // Remove child from old parent's list
  if (!oldParentId) {
    // This means it was a top level section
    deleteNodes([oldSectionId]);
  } else {
    setSectionChildren(state, oldParentId, (x) =>
      x.filter((y) => y !== oldSectionId),
    );
  }
  if (!newParentId) {
    if (position === null) {
      throw new Error();
    }
    // This means it's becoming a top level section
    addNodes([
      {
        id: newSectionId,
        position,
        zIndex: 0,
        tempZIndex: 0,
        width: null,
        height: null,
      },
    ]);
  } else {
    if (newIndex === null) {
      throw new Error();
    }
    // Add child to new parent's list
    setSectionChildren(state, newParentId, (x) =>
      insertIntoArray(x, newIndex, newSectionId),
    );
  }
}
