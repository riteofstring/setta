import C from "constants/constants.json";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { moveSections } from "state/actions/sections/moveSections";
import {
  useActiveSection,
  useNodeInternals,
  useSectionInfos,
} from "state/definitions";
import { getSectionVariant } from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";
import { addSectionAtPosition } from "./createSections";
import { deleteSections } from "./deleteSections";

export function createGroup({ nodeIds, x, y }) {
  useSectionInfos.setState((state) => {
    const groupId = addSectionAtPosition({
      type: C.GROUP,
      position: { x, y },
      state,
    });

    moveSections({
      oldParentId: null,
      newParentId: groupId,
      sectionIds: nodeIds,
      state,
    });
  });

  maybeIncrementProjectStateVersion(true);
}

export function groupSections() {
  const activeSectionIds = useActiveSection.getState().ids;
  const selectedNodes = [...useNodeInternals.getState().x].filter((x) =>
    activeSectionIds.includes(x[0]),
  );
  const numSelected = selectedNodes.length;
  if (numSelected > 0) {
    const nodeIds = selectedNodes.map((x) => x[1].id);
    const x = Math.min(...selectedNodes.map((x) => x[1].position.x));
    const y = Math.min(...selectedNodes.map((x) => x[1].position.y));
    createGroup({ nodeIds, x, y });
    useReactFlow.setState({ nodesSelectionDims: null });
  }
}

export async function ungroup(groupId) {
  useSectionInfos.setState((state) => {
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
  });
}
