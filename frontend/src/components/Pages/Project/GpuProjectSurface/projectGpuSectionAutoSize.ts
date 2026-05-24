import type { ZustandProjectState } from "state/definitions";
import type { BaseSectionImplUnion } from "utils/generatedTypes";
import {
  getProjectGpuParamAutoContentHeightForSection,
  getProjectGpuParamContentVerticalChromeHeightForSection,
} from "./projectGpuParamContentHeight";
import { getProjectSectionSceneHeaderHeight } from "./projectSectionSceneHeaderLayout";
import { getProjectSectionSceneKwargsControlsHeight } from "./projectSectionSceneKwargsControlsLayout";
import { getProjectSectionSceneSearchHeight } from "./projectSectionSceneSearchLayout";

export function resolveProjectGpuSectionAutoHeight({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): number | null {
  if (sectionImpl.size.height !== "auto") {
    return null;
  }
  const paramContentHeight = getProjectGpuParamAutoContentHeightForSection({
    projectState,
    sectionId,
    sectionImpl,
  });
  if (paramContentHeight === null) {
    return null;
  }
  const paramVerticalChromeHeight =
    getProjectGpuParamContentVerticalChromeHeightForSection({
      projectState,
      sectionId,
      sectionImpl,
    });
  if (paramVerticalChromeHeight === null) {
    return null;
  }
  return (
    getProjectSectionSceneHeaderHeight() +
    getProjectSectionSceneSearchHeight(sectionImpl) +
    getProjectSectionSceneKwargsControlsHeight(sectionImpl) +
    paramVerticalChromeHeight +
    paramContentHeight
  );
}
