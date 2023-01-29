import { useSectionInfos } from "models/info/sectionInfos";

export function setSelfParentSiblingChildrenWidths({
  sectionId,
  d,
  minHeight,
  minWidth,
}) {
  // set own width
  useSectionInfos.getState().setSectionInfoAttr({
    sectionId,
    attr: "size",
    newValueFn: getNewSizeFn({ d, minHeight, minWidth }),
  });

  setAllOtherWidths({
    sectionId,
    width: useSectionInfos.getState().x[sectionId].size.width,
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

function getHighestAncestor(sectionId) {
  const s = useSectionInfos.getState();
  let parentId = s.x[sectionId].parentId;
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = s.x[parentId].parentId;
  }

  return highestAncestor;
}

function getNewSizeFn({ d, minHeight, minWidth }) {
  return (size) => {
    const newHeight = Math.max(size.height + d.height, minHeight);
    const newWidth = Math.max(size.width + d.width, minWidth);
    return { height: newHeight, width: newWidth };
  };
}
