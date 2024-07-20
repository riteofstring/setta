import { useNodeInternals } from "state/definitions/nodeInternals";
import { createSectionInfo } from "state/actions/createSectionInfo";

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
