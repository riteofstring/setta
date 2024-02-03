import { createSectionInfo } from "thunks/sections/createSectionInfo";
import { REACT_FLOW_STORE } from "utils/constants";

export function creatAdjacentSection(sectionId, sectionProps) {
  const reactFlowStore = REACT_FLOW_STORE.store;
  const { position: sectionPosition, width: sectionWidth } = reactFlowStore
    .getState()
    .nodeInternals.get(sectionId);

  const position = {
    x: sectionPosition.x + sectionWidth,
    y: sectionPosition.y,
  };

  createSectionInfo({
    sectionProps: { ...sectionProps, position },
    isTopLevel: true,
  });
}
