import type { SectionType } from "utils/generatedTypes";
import type { SectionContainerAreaProps } from "./sectionContainerAreaView";

export type SectionCanvasAreaProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  isUserView: boolean;
};

export function buildSectionCanvasAreaView({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  isUserView,
}: SectionCanvasAreaProps): SectionContainerAreaProps {
  return {
    sectionId,
    sectionTypeName,
    bgColor,
    isMinimized,
    isUserView,
    chatHost: "section_layout",
  };
}
