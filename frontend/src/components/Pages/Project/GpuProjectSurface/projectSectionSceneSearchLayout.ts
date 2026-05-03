import { PROJECT_SECTION_SEARCH_HEIGHT_PX } from "components/Section/SectionParts/sectionSearchLayout";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";

export function getProjectSectionSceneSearchHeight(
  sectionImpl: BaseSectionImplUnion,
): number {
  if (
    sectionImpl.isMinimized ||
    sectionImpl.type !== SectionTypeEnum.Callable
  ) {
    return 0;
  }
  return PROJECT_SECTION_SEARCH_HEIGHT_PX;
}
