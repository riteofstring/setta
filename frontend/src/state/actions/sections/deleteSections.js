import C from "constants/constants.json";
import { dbDeleteTerminals } from "requests/terminals";
import { deleteNodes } from "state/actions/nodeInternals";
import { useActiveSection, useSectionInfos } from "state/definitions";
import { getSectionParentId } from "../../getters/sectionInfo";
import { getSectionChildren } from "../sectionVariants";
import { maybeIncrementProjectStateVersion } from "../undo";
import { removeActiveSectionIds } from "./activeSections";
import { removeSectionInfos } from "./sectionInfos";

export function deleteSections(sectionIds, state) {
  const idsToDelete = [...new Set(getIdsToDelete(sectionIds, state))];
  const terminalIds = idsToDelete.filter(
    (id) => state.uiTypes[state.x[id].uiTypeId].type === C.TERMINAL,
  );
  removeSectionInfos(idsToDelete, state);
  if (terminalIds) {
    dbDeleteTerminals(terminalIds);
  }
  removeActiveSectionIds(idsToDelete);
  deleteNodes(idsToDelete);
}

function getIdsToDelete(sectionIds, state) {
  const idsToDelete = [...sectionIds];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const idxChildren = getSectionChildrenFromAllVariants(
      idsToDelete[idx],
      state,
    );
    const { paramSweepSectionId } = state.x[idsToDelete[idx]];
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

function getSectionChildrenFromAllVariants(sectionId, state) {
  const output = [];
  for (const v of state.x[sectionId].variantIds) {
    output.push(...state.variants[v].children);
  }
  return output;
}

export function deleteChildrenFromSeries({
  isRoot,
  calledBy,
  numChildren = 1,
  incrementVersion = false,
}) {
  useSectionInfos.setState((state) => {
    if (isRoot) {
      const children = getSectionChildren(calledBy);
      deleteSections(children.slice(0, numChildren), state);
    } else {
      const parentId = getSectionParentId(calledBy);
      const siblings = getSectionChildren(parentId);
      const startIdx = siblings.indexOf(calledBy) + 1;
      deleteSections(siblings.slice(startIdx, startIdx + numChildren), state);
    }
  });

  maybeIncrementProjectStateVersion(incrementVersion);
}

export function deleteAllActiveSections() {
  const sectionIds = useActiveSection.getState().ids;
  useSectionInfos.setState((state) => {
    deleteSections(sectionIds, state);
  });
}
