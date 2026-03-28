import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildSectionContainerCoreBodyView } from "./sectionContainerCoreBodyView";

describe("buildSectionContainerCoreBodyView", () => {
  it("keeps the live canvas body when the benchmark is inactive", () => {
    expect(
      buildSectionContainerCoreBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
        benchmarkActive: false,
        benchmarkStage: "full",
        renderSectionBody: true,
        renderFullSectionBody: true,
      }),
    ).toEqual({
      kind: "canvas",
      props: {
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
      },
    });
  });

  it("switches to the benchmark placeholder when the benchmark hides the body", () => {
    expect(
      buildSectionContainerCoreBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Code,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
        benchmarkActive: true,
        benchmarkStage: "header-only",
        renderSectionBody: false,
        renderFullSectionBody: false,
      }),
    ).toEqual({
      kind: "benchmark-placeholder",
      stage: "header-only",
    });
  });

  it("suppresses the benchmark placeholder for meta-control sections", () => {
    expect(
      buildSectionContainerCoreBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.MetaControl,
        bgColor: "bg-transparent",
        isMinimized: false,
        isUserView: false,
        benchmarkActive: true,
        benchmarkStage: "frame-only",
        renderSectionBody: false,
        renderFullSectionBody: false,
      }),
    ).toEqual({
      kind: "none",
    });
  });
});
