import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import {
  createCallableSectionImpl,
  createChatSectionImpl,
  createDictSectionImpl,
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { getProjectSectionSceneKwargsControlsHeight } from "./projectSectionSceneKwargsControlsLayout";

describe("project section scene kwargs controls layout", () => {
  it("derives visible kwargs chrome height from section type", () => {
    expect(
      getProjectSectionSceneKwargsControlsHeight(
        createDictSectionImpl({ id: "dict" }),
      ),
    ).toBe(KWARGS_CONTROLS_SCENE_HEIGHT_PX);
    expect(
      getProjectSectionSceneKwargsControlsHeight(
        createCallableSectionImpl({ id: "callable" }),
      ),
    ).toBe(KWARGS_CONTROLS_SCENE_HEIGHT_PX);
    expect(
      getProjectSectionSceneKwargsControlsHeight({
        isMinimized: false,
        type: SectionTypeEnum.GlobalVariables,
      } as BaseSectionImplUnion),
    ).toBe(KWARGS_CONTROLS_SCENE_HEIGHT_PX);
  });

  it("omits kwargs chrome for hidden, minimized, or unsupported sections", () => {
    expect(
      getProjectSectionSceneKwargsControlsHeight(
        createCallableSectionImpl({ hideParams: true, id: "callable" }),
      ),
    ).toBe(0);
    expect(
      getProjectSectionSceneKwargsControlsHeight(
        createDictSectionImpl({ id: "dict", isMinimized: true }),
      ),
    ).toBe(0);
    expect(
      getProjectSectionSceneKwargsControlsHeight(
        createChatSectionImpl({ id: "chat" }),
      ),
    ).toBe(0);
  });
});
