import { dbDeleteTerminals } from "requests/terminals";
import { deleteNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { getSectionInfo, getSectionParentId } from "../../getters/sectionInfo";
import { removeSectionInfos } from "./sectionInfos";
import { removeActiveSectionIds } from "./activeSections";

export function deleteSections({ sectionIds, incrementVersion = false }) {
  const idsToDelete = [];
  for (const sid of sectionIds) {
    idsToDelete.push(...getIdsToDelete(sid));
  }

  removeActiveSectionIds(idsToDelete);
  removeSectionInfos(idsToDelete);
  deleteNodes(idsToDelete);
  dbDeleteTerminals(idsToDelete); // delete any terminals associated with the sections

  maybeIncrementProjectStateVersion(incrementVersion);
}

function getIdsToDelete(sectionId) {
  const sectionInfosState = useSectionInfos.getState();
  const idsToDelete = [sectionId];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const { children: idxChildren, paramSweepSectionId } =
      sectionInfosState.x[idsToDelete[idx]];
    if (idxChildren) {
      idsToDelete.push(...idxChildren);
    }
    if (paramSweepSectionId) {
      idsToDelete.push(paramSweepSectionId);
    }
    idx += 1;
  }
  return idsToDelete;
}

export function deleteChildrenFromSeries({
  isRoot,
  calledBy,
  numChildren = 1,
  incrementVersion = false,
}) {
  if (isRoot) {
    const { children } = getSectionInfo(calledBy);
    deleteSections({
      sectionIds: children.slice(0, numChildren),
      incrementVersion,
    });
  } else {
    const parentId = getSectionParentId(calledBy);
    const { children: siblings } = getSectionInfo(parentId);
    const startIdx = siblings.indexOf(calledBy) + 1;
    deleteSections({
      sectionIds: siblings.slice(startIdx, startIdx + numChildren),
      incrementVersion,
    });
  }
}
