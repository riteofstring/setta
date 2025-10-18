import { addNodes, deleteNodes } from "state/actions/nodeInternals";
import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_sections_make_copy } from "utils/generatedEndpoints";
import { insertIntoArray } from "utils/utils";
import { copySections } from "../copyPaste/copy";
import { getSectionInfo, setSectionVariantChildren } from "../sectionInfos";
import { setAllChildrenWidths } from "./sectionSizes";

export function moveSections({
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

export function moveSection({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
  state,
}) {
  setChildrenAndParent({
    oldParentId,
    newParentId,
    oldSectionId,
    newSectionId,
    newIndex,
    position,
    state,
  });

  setSectionSizeAfterMove(newParentId, newSectionId, state);
}

function setChildrenAndParent({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
  state,
}) {
  // Remove child from old parent's list
  if (!oldParentId) {
    // This means it was a top level section
    deleteNodes([oldSectionId]);
  } else {
    setSectionVariantChildren(
      oldParentId,
      (x) => x.filter((y) => y !== oldSectionId),
      state,
    );
  }
  if (!newParentId) {
    // This means it's becoming a top level section
    addNodes([{ id: newSectionId, position, zIndex: 0, tempZIndex: 0 }]);
  } else {
    // Add child to new parent's list
    setSectionVariantChildren(
      newParentId,
      (x) => insertIntoArray(x, newIndex, newSectionId),
      state,
    );
  }

  state.sections[newSectionId].parentId = newParentId;
}

function setSectionSizeAfterMove(newParentId, sectionId, state) {
  if (!newParentId) {
    return;
  }
  const isGroup =
    state.uiTypes[state.sections[newParentId].uiTypeId].type ===
    UITypeNameEnum.GROUP;

  // if new parent is a group and the group has children and is not horizontal
  if (isGroup) {
    const { isHorizontalOrientation } = state.sections[newParentId];
    if (!isHorizontalOrientation) {
      const groupChildren =
        state.variants[state.sections[newParentId].variantId].children;
      if (groupChildren.length > 0) {
        const width = state.sections[groupChildren[0]].size.width;
        setAllChildrenWidths({ sectionId, width, state });
      }
    }
  } else {
    const width = state.sections[newParentId].size.width;
    setAllChildrenWidths({ sectionId, width, state });
  }
}

export async function maybeMakeCopyOfSection({
  sectionId,
  oldParentId,
  newParentId,
}) {
  if (!oldParentId || oldParentId === newParentId) {
    return sectionId;
  }

  const { variantIds } = getSectionInfo(oldParentId);
  if (variantIds.length <= 1) {
    return sectionId;
  }

  // If the old parent has multiple variants,
  // then we need to check if any of those variants
  // have children that include sectionId.
  // If they do include sectionId, then make a copy of sectionId
  // to prevent the possibility of sectionId appearing in 2 places at once.
  const { variantId: activeVariantId } = getSectionInfo(sectionId);
  const variantState = useProjectState.getState().variants;
  let isInOtherVariants = false;
  for (const variantId of variantIds) {
    if (variantId === activeVariantId) {
      continue;
    }
    const children = variantState[variantId].children;
    const sectionIdx = children.findIndex((x) => x === sectionId);
    if (sectionIdx !== -1) {
      isInOtherVariants = true;
      break;
    }
  }

  if (isInOtherVariants) {
    const res = await route_sections_make_copy(copySections([sectionId]));
    if (res200(res)) {
      return res.data;
    }
  }

  return sectionId;
}
