import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { moveSections } from "state/actions/sections/moveSections";
import { useNodeInternals, useProjectState } from "state/definitions";
import { setActiveSectionIds } from "../activeSections";
import { getSectionType, getSectionVariant } from "../sectionInfos";
import { addSectionAtPosition } from "./createSections";

export function groupSections({ sectionIds, position, name }) {
  let groupId;
  useProjectState.setState((state) => {
    groupId = addSectionAtPosition({
      sectionProps: { name },
      type: UITypeNameEnum.GROUP,
      position,
      state,
    });

    moveSections({
      oldParentId: null,
      newParentId: groupId,
      sectionIds,
      state,
    });

    state.requestRenameRefactor = true;
  });

  setActiveSectionIds([groupId]);

  return groupId;
}

export async function groupActiveSections() {
  const activeSectionIds = useProjectState.getState().activeIds;
  const selectedNodes = [...useNodeInternals.getState().x].filter((x) =>
    activeSectionIds.includes(x[0]),
  );
  const numSelected = selectedNodes.length;
  if (numSelected > 0) {
    const nodeIds = selectedNodes.map((x) => x[1].id);
    const x = Math.min(...selectedNodes.map((x) => x[1].position.x));
    const y = Math.min(...selectedNodes.map((x) => x[1].position.y));
    groupSections({ nodeIds, position: { x, y } });
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

  state.requestRenameRefactor = true;
}

export function ungroupActiveGroup() {
  useProjectState.setState((state) => {
    const ids = useProjectState.getState().activeIds;
    // TODO: support multiple groups
    if (ids.length === 1) {
      ungroupGroup(ids[0], state);
    }
  });
}
