import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { moveSections } from "state/actions/sections/moveSections";
import { useNodeInternals, useProjectState } from "state/definitions";
import { route_group_sections } from "utils/generatedEndpoints";
import { Position } from "utils/generatedTypes";
import {
  getCurrProjectConfigId,
  getSectionType,
  getSectionVariant,
} from "../sectionInfos";

export function groupSections(sectionIds: Array<string>, position: Position) {
  route_group_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds,
    position,
  });
}

export async function groupActiveSections() {
  const activeSectionIds = useProjectState.getState().projectConfig.activeIds;
  const selectedNodes = [...useNodeInternals.getState().x].filter((x) =>
    activeSectionIds.includes(x[0]),
  );
  const numSelected = selectedNodes.length;
  if (numSelected > 0) {
    const nodeIds = selectedNodes.map((x) => x[1].id);
    const x = Math.min(...selectedNodes.map((x) => x[1].position.x));
    const y = Math.min(...selectedNodes.map((x) => x[1].position.y));
    groupSections(nodeIds, { x, y });
    useReactFlow.setState({ nodesSelectionDims: null });
  }
}

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
