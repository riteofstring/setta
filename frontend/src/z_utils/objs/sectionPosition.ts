import { SectionPositionType } from "src/types/sectionPosition";

export function newSectionPosition({
  x,
  y,
  zIndex,
}: Partial<SectionPositionType>): SectionPositionType {
  return {
    x: x ?? 0,
    y: y ?? 0,
    zIndex: zIndex ?? 0,
  };
}
