import { dbDeleteTerminals } from "requests/terminals";
import { deleteNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useActiveSection, useSectionInfos } from "state/definitions";
import { getSectionParentId } from "../../getters/sectionInfo";
import {
  getSectionChildren,
  getSectionChildrenFromAllVariants,
} from "../sectionVariants";
import { removeActiveSectionIds } from "./activeSections";
import { removeSectionInfos } from "./sectionInfos";

export function deleteSections({ sectionIds, incrementVersion = false }) {
  let idsToDelete = [];
  for (const sid of sectionIds) {
    idsToDelete.push(...getIdsToDelete(sid));
  }
  idsToDelete = [...new Set(idsToDelete)];
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
    const idxChildren = getSectionChildrenFromAllVariants(idsToDelete[idx]);
    const { paramSweepSectionId } = sectionInfosState.x[idsToDelete[idx]];
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
    const children = getSectionChildren(calledBy);
    deleteSections({
      sectionIds: children.slice(0, numChildren),
      incrementVersion,
    });
  } else {
    const parentId = getSectionParentId(calledBy);
    const siblings = getSectionChildren(parentId);
    const startIdx = siblings.indexOf(calledBy) + 1;
    deleteSections({
      sectionIds: siblings.slice(startIdx, startIdx + numChildren),
      incrementVersion,
    });
  }
}

export function deleteAllActiveSections() {
  const sectionIds = useActiveSection.getState().ids;
  deleteSections({ sectionIds, incrementVersion: true });
}
