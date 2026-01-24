import _ from "lodash";
import { useProjectState, ZustandProjectState } from "state/definitions";
import { route_set_active_ids } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";

function optimisticActiveIdsUpdate(
  apply: (state: ZustandProjectState) => void,
) {
  return dispatchOptimisticProjectStateUpdate({
    apply,
    send: (frontendOpId) =>
      route_set_active_ids({
        projectConfigId: getCurrProjectConfigId(),
        activeIds: useProjectState.getState().projectConfig.activeIds,
        frontendOpId,
      }),
  });
}

export function setActiveSectionIds(ids: Array<string>) {
  const currentActiveIds = useProjectState.getState().projectConfig.activeIds;
  if (_.isEqual(currentActiveIds, ids)) {
    return;
  }
  optimisticActiveIdsUpdate((state) => {
    state.projectConfig.activeIds = ids;
  });
}

export function clearActiveSectionIds() {
  if (useProjectState.getState().projectConfig.activeIds.length === 0) {
    return;
  }
  optimisticActiveIdsUpdate((state) => {
    state.projectConfig.activeIds = [];
  });
}

export function selectAll() {
  const currActiveSections = useProjectState.getState().projectConfig.activeIds;

  // select all params within single active section
  if (currActiveSections.length === 1) {
    useProjectState.setState((state) => {
      const sectionId = currActiveSections[0];
      if (sectionId) {
        const ids = getAllVisibleParamsInSection(state, sectionId);
        //TODO set selected params:
        console.log("selectAll ids", ids);
      }
    });
  } else {
    // select all sections
    setActiveSectionIds(Object.keys(useProjectState.getState().sections));
  }
}

export function setTopLevelNonGroupSectionsAsActive() {
  const p = useProjectState.getState();
  const { topLevelSections } = p.projectConfig;
  const nonGroup: Array<string> = [];
  for (const sectionId of Object.keys(topLevelSections)) {
    if (
      getCurrEffectiveSectionImpl(p, sectionId).type !== SectionTypeEnum.Group
    ) {
      nonGroup.push(sectionId);
    }
  }
  setActiveSectionIds(nonGroup);
}
