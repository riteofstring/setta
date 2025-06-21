import { deleteNodes } from "state/actions/nodeInternals";
import { useProjectState } from "state/definitions";
import { route_delete_terminals } from "utils/generatedEndpoints";
import { removeActiveSectionIds } from "../activeSections";
import {
  getAllSectionsForDeletionOrCopying,
  getSectionVariant,
  setSectionVariantChildren,
} from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

export function deleteSections(sectionIds, state) {
  const idsToDelete = [
    ...new Set(getAllSectionsForDeletionOrCopying(sectionIds, state)),
  ];
  const terminalIds = idsToDelete.filter(
    (id) =>
      state.uiTypes[state.sections[id].uiTypeId].type ===
      UITypeNameEnum.TERMINAL,
  );
  removeSectionInfos(idsToDelete, state);
  if (terminalIds) {
    route_delete_terminals({ sectionIds: terminalIds });
  }
  removeActiveSectionIds(idsToDelete);
  deleteNodes(idsToDelete);
}

export function deleteChildrenFromSeries(isRoot, calledBy, numChildren = 1) {
  useProjectState.setState((state) => {
    if (isRoot) {
      const children = getSectionVariant(calledBy, state).children;
      deleteSections(children.slice(0, numChildren), state);
    } else {
      const parentId = state.sections[calledBy].parentId;
      const siblings = getSectionVariant(parentId, state).children;
      const startIdx = siblings.indexOf(calledBy) + 1;
      deleteSections(siblings.slice(startIdx, startIdx + numChildren), state);
    }
  });

  maybeIncrementProjectStateVersion(true);
}

export function deleteAllActiveSections() {
  const sectionIds = useProjectState.getState().activeIds;
  useProjectState.setState((state) => {
    deleteSections(sectionIds, state);
  });
  maybeIncrementProjectStateVersion(true);
}

function removeSectionInfos(ids, state) {
  const idSet = new Set(ids);
  for (const id of idSet) {
    const parentId = state.sections[id]?.parentId;
    if (parentId && state.sections[parentId]?.variantId) {
      setSectionVariantChildren(
        parentId,
        (children) => children.filter((x) => x !== id),
        state,
      );
    }

    let isStillUsedInAVariant = false;
    for (const variantInfo of Object.values(state.variants)) {
      if (variantInfo.children.includes(id)) {
        isStillUsedInAVariant = true;
        break;
      }
    }

    if (!isStillUsedInAVariant) {
      for (const variantId of state.sections[id].variantIds) {
        delete state.variants[variantId];
      }
      delete state.sections[id];
    }
  }
}
