import { addNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { addCodeInfoBatch } from "../codeInfo";
import { updateSectionVariants } from "../sectionVariants";
import { updateUITypeCols } from "../uiTypes/uiTypeCols";
import { updateUITypes } from "../uiTypes/uiTypes";
import { updateSections } from "./sectionInfos";

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

  updateStateWithSectionCopy({
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

export function updateStateWithSectionCopy({
  sections,
  uiTypes,
  sectionVariants,
  uiTypeCols,
  codeInfo,
}) {
  updateUITypes(uiTypes);
  updateSectionVariants({ sectionVariants });
  updateUITypeCols({ uiTypeCols });
  addCodeInfoBatch(codeInfo);
  updateSections(sections);
}
