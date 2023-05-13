import { useSectionInfos } from "models/info/sectionInfos";
import { getSectionParentId, setSectionSize } from "./sections";

export function setSelfParentSiblingChildrenWidths({ sectionId, size }) {
  // set own width
  setSectionSize(sectionId, size);

  setAllOtherWidths({
    sectionId,
    width: size.width,
  });
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
  const sectionIds = [sectionId];
  const s = useSectionInfos.getState();
  let idx = 0;
  while (idx < sectionIds.length) {
    const currId = sectionIds[idx];
    sectionIds.push(...s.currChildren[currId]);
    idx += 1;
  }
  useSectionInfos.getState().setSectionInfoAttr({
    sectionIds: sectionIds.filter((x) => x !== exclude),
    attr: "size",
    newValueFn: (size) => ({ width, height: size.height }),
  });
}

export function getHighestAncestor(sectionId) {
  let parentId = getSectionParentId(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = getSectionParentId(parentId);
  }

  return highestAncestor;
}
