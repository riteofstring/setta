import C from "constants/constants.json";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { moveSections } from "state/actions/sections/moveSections";
import { useNodeInternals, useSectionInfos } from "state/definitions";
import { PANEID } from "utils/constants";
import { maybePreventDefault } from "utils/utils";
import { maybeIncrementProjectStateVersion } from "../undo";
import { onClickAddSection } from "./createSections";
import { deleteSections } from "./deleteSections";

export function createDeck({ nodeIds, x, y, projectXY }) {
  const deckId = onClickAddSection({
    type: C.DECK,
    x,
    y,
    projectXY,
    incrementVersion: false,
  });

  moveSections({
    oldParentId: PANEID,
    newParentId: deckId,
    sectionIds: nodeIds,
  });

  maybeIncrementProjectStateVersion(true);
}

export function groupSections(e) {
  maybePreventDefault(e);
  const selectedNodes = [...useNodeInternals.getState().x].filter(
    (x) => x[1].selected,
  );
  const numSelected = selectedNodes.length;
  if (numSelected > 0) {
    const nodeIds = selectedNodes.map((x) => x[1].id);
    const x = Math.min(...selectedNodes.map((x) => x[1].position.x));
    const y = Math.min(...selectedNodes.map((x) => x[1].position.y));
    createDeck({ nodeIds, x, y, projectXY: false });
  }
}

export function undeck(deckId) {
  const childIds = useSectionInfos.getState().x[deckId].children;
  const positions = {};
  childIds.forEach((id) => {
    const { x, y } = getSectionRect(id);
    positions[id] = { x, y };
  });
  moveSections({
    oldParentId: deckId,
    newParentId: PANEID,
    sectionIds: childIds,
    positions,
  });
  deleteSections({ sectionIds: [deckId], incrementVersion: true });
}
