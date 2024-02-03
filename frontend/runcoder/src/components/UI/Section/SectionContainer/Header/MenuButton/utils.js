import { createSectionInfo } from "thunks/sections/createSectionInfo";
import { REACT_FLOW_STORE } from "utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

export function creatAdjacentSection(sectionId, sectionProps) {
  const reactFlowStore = REACT_FLOW_STORE.store;
  const { position: sectionPosition, width: sectionWidth } = reactFlowStore
    .getState()
    .nodeInternals.get(sectionId);

  createSectionInfo({
    sectionProps,
    topLevelPosition: newSectionPosition({
      x: sectionPosition.x + sectionWidth,
      y: sectionPosition.y,
    }),
  });
}
