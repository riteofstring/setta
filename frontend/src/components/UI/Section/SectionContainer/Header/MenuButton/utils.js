import { useNodeInternals } from "models/info/nodeInternals";
import { createSectionInfo } from "thunks/sections/createSectionInfo";

export function creatAdjacentSection(sectionId, sectionProps) {
  const {
    x,
    y,
    width: sectionWidth,
  } = useNodeInternals.getState().x.get(sectionId);

  const position = {
    x: x + sectionWidth,
    y,
  };

  createSectionInfo({ sectionProps, position });
}
