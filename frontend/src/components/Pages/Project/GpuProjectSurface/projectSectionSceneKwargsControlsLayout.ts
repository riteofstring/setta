import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";

export function getProjectSectionSceneKwargsControlsHeight(
  sectionImpl: BaseSectionImplUnion,
): number {
  if (sectionImpl.isMinimized) {
    return 0;
  }
  if (
    sectionImpl.type === SectionTypeEnum.Callable &&
    "hideParams" in sectionImpl &&
    Boolean(sectionImpl.hideParams)
  ) {
    return 0;
  }
  if (
    sectionImpl.type === SectionTypeEnum.Callable ||
    sectionImpl.type === SectionTypeEnum.Dict ||
    sectionImpl.type === SectionTypeEnum.GlobalVariables
  ) {
    return KWARGS_CONTROLS_SCENE_HEIGHT_PX;
  }
  return 0;
}
