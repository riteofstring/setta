import { addNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { updateSectionInfos } from "./sectionInfos";

export function loadSectionIntoState({
  sections,
  uiTypes,
  sectionVariants,
  uiTypeCols,
  codeInfo,
  relativePositions,
  topLevelIds,
  x,
  y,
  incrementVersion,
}) {
  const topLevelMapping = {};
  for (const i of topLevelIds) {
    topLevelMapping[i] = {
      x: x + relativePositions[i].x,
      y: y + relativePositions[i].y,
      zIndex: relativePositions[i].zIndex,
    };
  }

  updateSectionInfos({
    sections,
    uiTypes,
    sectionVariants,
    uiTypeCols,
    codeInfo,
  });

  const nodes = [];
  for (const [id, n] of Object.entries(topLevelMapping)) {
    nodes.push({
      id,
      position: { x: n.x, y: n.y },
      zIndex: n.zIndex,
      tempZIndex: n.zIndex,
    });
  }
  addNodes(nodes);
  maybeIncrementProjectStateVersion(incrementVersion);
}
