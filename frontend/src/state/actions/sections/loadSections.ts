import { addNodes } from "state/actions/nodeInternals";
import { useProjectState } from "state/definitions";
import { updateProjectState } from "../sectionInfos";

export function loadSectionIntoState({
  sections,
  variants,
  uiTypeCols,
  uiTypes,
  codeInfoCols,
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

  useProjectState.setState((state) => {
    updateProjectState({
      sections,
      variants,
      uiTypes,
      uiTypeCols,
      codeInfo,
      codeInfoCols,
      state,
    });
  });

  const nodes = [];
  for (const [id, n] of Object.entries(topLevelMapping)) {
    nodes.push({
      id,
      position: { x: n.x, y: n.y },
      zIndex: n.zIndex,
      tempZIndex: n.zIndex,
      visibility: sections[id].visibility,
    });
  }
  addNodes(nodes);
}
