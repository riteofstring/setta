import { useProjectState } from "state/definitions";
import { route_delete_sections } from "utils/generatedEndpoints";
import { isBaseParentSectionImpl } from "utils/generatedTypes";
import { getEffectiveSectionImpl } from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

export function deleteChildrenFromSeries(
  isRoot: boolean,
  calledBy: string,
  numChildren: number,
) {
  const state = useProjectState.getState();
  const projectConfigId = state.projectConfig.id;
  let sectionIds: Array<string>;
  if (isRoot) {
    const impl = getEffectiveSectionImpl(state, calledBy);
    if (!isBaseParentSectionImpl(impl)) {
      throw new Error();
    }
    sectionIds = impl.children.slice(0, numChildren);
  } else {
    const impl = getEffectiveSectionImpl(state, calledBy);
    const { parentId } = impl;
    const parentImpl = getEffectiveSectionImpl(state, parentId);
    if (!isBaseParentSectionImpl(parentImpl)) {
      throw new Error();
    }
    const siblings = parentImpl.children;
    const startIdx = siblings.indexOf(calledBy) + 1;
    sectionIds = siblings.slice(startIdx, startIdx + numChildren);
  }

  route_delete_sections({ projectConfigId, sectionIds });
}

export function deleteAllActiveSections() {
  const sectionIds = useProjectState.getState().activeIds;
  useProjectState.setState((state) => {
    deleteSections(sectionIds, state);
  });
  maybeIncrementProjectStateVersion(true);
}
