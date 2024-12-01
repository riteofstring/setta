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

export function createDeck({ nodeIds, x, y }) {
  useSectionInfos.setState((state) => {
    const deckId = addSectionAtPosition({
      type: C.DECK,
      position: { x, y },
      state,
    });

    moveSections({
      oldParentId: null,
      newParentId: deckId,
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
    createDeck({ nodeIds, x, y });
    useReactFlow.setState({ nodesSelectionDims: null });
  }
}

export async function undeck(deckId) {
  const childIds = getSectionVariant(deckId).children;
  const positions = {};
  childIds.forEach((id) => {
    const { x, y } = getSectionRect(id);
    positions[id] = { x, y };
  });
  useSectionInfos.setState((state) => {
    moveSections({
      oldParentId: deckId,
      newParentId: null,
      sectionIds: childIds,
      positions,
      state,
    });
    deleteSections([deckId], state);
  });
}
