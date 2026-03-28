import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildSectionCanvasBodyView } from "./sectionCanvasBodyView";

describe("buildSectionCanvasBodyView", () => {
  it("prefers the externalized window placeholder when the section is rebound into a window", () => {
    expect(
      buildSectionCanvasBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Code,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
        externalizedWindowId: "window-1",
      }),
    ).toEqual({
      kind: "placeholder",
      props: {
        instanceId: "window-1",
        sectionId: "section-1",
        dataTestId: "section-canvas-window-placeholder",
      },
    });
  });

  it("suppresses the body when the section stays on-canvas but is minimized", () => {
    expect(
      buildSectionCanvasBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        bgColor: "bg-setta-50",
        isMinimized: true,
        isUserView: false,
        externalizedWindowId: null,
      }),
    ).toEqual({
      kind: "none",
    });
  });

  it("builds the on-canvas section area props with the section-layout chat host", () => {
    expect(
      buildSectionCanvasBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: true,
        externalizedWindowId: null,
      }),
    ).toEqual({
      kind: "area",
      props: {
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: true,
        chatHost: "section_layout",
      },
    });
  });
});
