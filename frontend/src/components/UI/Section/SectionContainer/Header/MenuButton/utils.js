import { useNodeInternals } from "models/info/nodeInternals";
import { createSectionInfo } from "thunks/sections/createSectionInfo";

export function creatAdjacentSection(sectionId, sectionProps) {
  const { position: sectionPosition, width: sectionWidth } = useNodeInternals
    .getState()
    .x.get(sectionId);

  const position = {
    x: sectionPosition.x + sectionWidth,
    y: sectionPosition.y,
  };

  createSectionInfo({ sectionProps, position });
}
