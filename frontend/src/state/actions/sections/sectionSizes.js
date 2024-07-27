import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
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
  const sectionIds = [sectionId];
  const s = useSectionInfos.getState();
  let idx = 0;
  while (idx < sectionIds.length) {
    const currId = sectionIds[idx];
    sectionIds.push(...s.x[currId].children);
    idx += 1;
  }
  setSectionInfoAttr({
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
