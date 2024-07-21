import { createSectionInfo } from "state/actions/createSectionInfo";
import { useNodeInternals } from "state/definitions";

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
