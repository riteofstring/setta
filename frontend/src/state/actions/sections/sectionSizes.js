import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import { getSectionParentId } from "../../getters/sectionInfo";
import { setSectionInfoAttr } from "./sectionInfos";
import { setSectionSize } from "./setters";

export function setSelfParentSiblingChildrenWidths({ sectionId, size }) {
  // set own width
  setSectionSize(sectionId, size);

  setAllOtherWidths({
    sectionId,
    width: size.width,
  });

  maybeIncrementProjectStateVersion(true);
}

function setAllOtherWidths({ sectionId, width }) {
  const highestAncestor = getHighestAncestor(sectionId);
  setAllChildrenWidths({
    sectionId: highestAncestor,
    exclude: sectionId,
    width,
  });
}

export function setAllChildrenWidths({ sectionId, exclude, width }) {
  const sectionIds = getAllSectionChildrenIds(
    useSectionInfos.getState().x,
    useSectionVariants.getState().x,
    [sectionId],
  );
  setSectionInfoAttr({
    sectionIds: sectionIds.filter((x) => x !== exclude),
    attr: "size",
    newValueFn: (size) => ({ width, height: size.height }),
  });
}

export function getHighestAncestor(
  sectionId,
  parentIdGetter = getSectionParentId,
) {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }

  return highestAncestor;
}

export function getAllSectionChildrenIds(
  sectionInfoState,
  sectionVariantState,
  sectionIds,
) {
  const ids = [...sectionIds];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    ids.push(
      ...sectionVariantState[sectionInfoState[currId].variantId].children,
    );
    idx += 1;
  }
  return ids;
}
