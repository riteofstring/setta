import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { moveSections } from "state/actions/sections/moveSections";
import { useProjectState } from "state/definitions";
import { getSectionType, getSectionVariant } from "../sectionInfos";

export function ungroupGroup(groupId, state) {
  if (getSectionType(groupId, state) !== UITypeNameEnum.GROUP) {
    return;
  }
  const childIds = getSectionVariant(groupId, state).children;
  const positions = {};
  childIds.forEach((id) => {
    const { x, y } = getSectionRect(id);
    positions[id] = { x, y };
  });

  moveSections({
    oldParentId: groupId,
    newParentId: null,
    sectionIds: childIds,
    positions,
    state,
  });

  // deleteSections([groupId], state);
}

export function ungroupActiveGroup() {
  useProjectState.setState((state) => {
    const ids = useProjectState.getState().projectConfig.activeIds;
    // TODO: support multiple groups
    if (ids.length === 1) {
      ungroupGroup(ids[0], state);
    }
  });
}
