import C from "constants/constants.json";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { moveSections } from "state/actions/sections/moveSections";
import {
  useActiveSection,
  useNodeInternals,
  useSectionInfos,
} from "state/definitions";
import { setActiveSectionIds } from "../activeSections";
import { getSectionType, getSectionVariant } from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";
import { addSectionAtPosition } from "./createSections";
import { deleteSections } from "./deleteSections";

/**
 * Set the values of multiple parameters in a particular section.
 * @SETTA_MCP_TOOL
 * @param {Array<ID>} sectionIds The ids of the sections to group together.
 * @param {SectionPosition} position The x,y position of the new group.
 * @param {string} [name] The name of the new group. If not specified, a random name will be created.
 * @return {ID} The id of the new group.
 */
export function groupSections({ sectionIds, position, name }) {
  let groupId;
  useSectionInfos.setState((state) => {
    groupId = addSectionAtPosition({
      sectionProps: { name },
      type: C.GROUP,
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

  maybeIncrementProjectStateVersion(true);

  return groupId;
}

export async function groupActiveSections() {
  const activeSectionIds = useActiveSection.getState().ids;
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
  if (getSectionType(groupId, state) !== C.GROUP) {
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

  deleteSections([groupId], state);

  state.requestRenameRefactor = true;
}

export function ungroupActiveGroup() {
  useSectionInfos.setState((state) => {
    const ids = useActiveSection.getState().ids;
    // TODO: support multiple groups
    if (ids.length === 1) {
      ungroupGroup(ids[0], state);
    }
  });
  maybeIncrementProjectStateVersion(true);
}

/**
 * Ungroup an existing group.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the group to ungroup.
 */
export function ungroupGroupMcp({ sectionId }) {
  useSectionInfos.setState((state) => {
    ungroupGroup(sectionId, state);
  });
}
