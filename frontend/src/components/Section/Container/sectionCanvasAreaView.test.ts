import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildSectionCanvasAreaView } from "./sectionCanvasAreaView";

describe("buildSectionCanvasAreaView", () => {
  it("builds the on-canvas section area props with the section-layout chat host", () => {
    expect(
      buildSectionCanvasAreaView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: true,
      }),
    ).toEqual({
      sectionId: "section-1",
      sectionTypeName: SectionTypeEnum.Chat,
      bgColor: "bg-setta-50",
      isMinimized: false,
      isUserView: true,
      chatHost: "section_layout",
    });
  });
});
