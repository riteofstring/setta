import { useProjectState } from "state/definitions";
import { isBaseParentSectionImpl } from "utils/generatedTypes";
import { getEffectiveSectionImpl } from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

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
