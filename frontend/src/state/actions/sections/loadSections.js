import { addNodes } from "state/actions/nodeInternals";
import { updateManyParamsAndCallables } from "state/actions/sections/sectionContents";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { addCodeInfoBatch } from "../codeInfo";
import { updateEVCols } from "../evCols";
import { updateUITypeCols } from "../uiTypes/uiTypeCols";
import { updateUITypes } from "../uiTypes/uiTypes";
import { updateSections } from "./sectionInfos";

export function loadSectionIntoState({
  sections,
  uiTypes,
  evCols,
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

  updateUITypes(uiTypes);
  updateEVCols({ evCols });
  updateUITypeCols({ uiTypeCols });
  addCodeInfoBatch(codeInfo);
  updateSections(sections);
  updateManyParamsAndCallables(Object.keys(sections));
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
