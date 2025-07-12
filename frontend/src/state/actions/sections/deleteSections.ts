import { deleteNodes } from "state/actions/nodeInternals";
import { useProjectState, ZustandProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  isBaseParentSectionLayering,
} from "utils/generatedTypes";
import { removeActiveSectionIds } from "../activeSections";
import {
  getAllSectionsForDeletionOrCopying,
  getEffectiveSectionImpl,
  getSectionImplLayering,
} from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

export function deleteSections(
  sectionIds: Array<string>,
  state: ZustandProjectState,
) {
  const idsToDelete = [
    ...new Set(getAllSectionsForDeletionOrCopying(sectionIds, state)),
  ];
  // const terminalIds = idsToDelete.filter(
  //   (id) =>
  //     state.uiTypes[state.sections[id].uiTypeId].type ===
  //     UITypeNameEnum.TERMINAL,
  // );
  removeSectionInfos(idsToDelete, state);
  // if (terminalIds) {
  //   route_delete_terminals({ sectionIds: terminalIds });
  // }
  removeActiveSectionIds(idsToDelete);
  deleteNodes(idsToDelete);
}

export function deleteChildrenFromSeries(
  isRoot: boolean,
  calledBy: string,
  numChildren: number,
) {
  useProjectState.setState((state) => {
    if (isRoot) {
      const impl = getEffectiveSectionImpl(state, calledBy);
      if (!isBaseParentSectionImpl(impl)) {
        throw new Error();
      }
      deleteSections(impl.children.slice(0, numChildren), state);
    } else {
      const impl = getEffectiveSectionImpl(state, calledBy);
      const { parentId } = impl;
      const parentImpl = getEffectiveSectionImpl(state, parentId);
      if (!isBaseParentSectionImpl(parentImpl)) {
        throw new Error();
      }
      const siblings = parentImpl.children;
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

function removeSectionInfos(ids: Array<string>, state: ZustandProjectState) {
  const idSet = new Set(ids);
  for (const id of idSet) {
    const impl = getEffectiveSectionImpl(state, id);
    const { parentId } = impl;
    if (parentId) {
      const implLayering = getSectionImplLayering(state, parentId);
      if (!isBaseParentSectionLayering(implLayering)) {
        throw new Error();
      }
      implLayering.modifier.children = (
        implLayering.modifier.children ?? []
      ).filter((x) => x !== id);
    }

    let isStillUsedInAnImpl = false;
    for (const implLayering of Object.values(state.sectionImplLayerings)) {
      const impl = state.sectionImpls[implLayering.impl];
      const modifier = implLayering.modifier;
      if (
        !impl ||
        !isBaseParentSectionImpl(impl) ||
        !isBaseParentSectionLayering(implLayering)
      ) {
        continue;
      }
      if (impl.children.includes(id) || modifier.children?.includes(id)) {
        isStillUsedInAnImpl = true;
        break;
      }
    }

    if (!isStillUsedInAnImpl) {
      // for (const variantId of state.sections[id].variantIds) {
      //   delete state.variants[variantId];
      // }
      delete state.sections[id];
    }
  }
}
