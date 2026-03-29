import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildSectionContainerCoreResizableView } from "./sectionContainerCoreResizableView";

describe("buildSectionContainerCoreResizableView", () => {
  it("keeps the standard section header and incrementer on the normal live path", () => {
    expect(
      buildSectionContainerCoreResizableView({
        sectionTypeName: SectionTypeEnum.Group,
        textBlockMetaControlStyle: false,
        isUserView: false,
        positionAndSizeLocked: false,
        hideHeader: false,
        benchmarkActive: false,
        renderSectionHeader: true,
        renderFullSectionBody: true,
      }),
    ).toMatchObject({
      useMetaControlStyle: false,
      headerKind: "section-header",
      shouldRenderIncrementer: true,
      showMetaControlDragHandle: false,
    });
  });

  it("suppresses the header and incrementer when the benchmark hides the full body", () => {
    expect(
      buildSectionContainerCoreResizableView({
        sectionTypeName: SectionTypeEnum.Group,
        textBlockMetaControlStyle: false,
        isUserView: false,
        positionAndSizeLocked: false,
        hideHeader: false,
        benchmarkActive: true,
        renderSectionHeader: false,
        renderFullSectionBody: false,
      }),
    ).toMatchObject({
      headerKind: "none",
      shouldRenderIncrementer: false,
    });
  });

  it("switches meta-control sections onto the menu-driven chrome path", () => {
    expect(
      buildSectionContainerCoreResizableView({
        sectionTypeName: SectionTypeEnum.MetaControl,
        textBlockMetaControlStyle: false,
        isUserView: false,
        positionAndSizeLocked: false,
        hideHeader: false,
        benchmarkActive: false,
        renderSectionHeader: true,
        renderFullSectionBody: true,
      }),
    ).toMatchObject({
      useMetaControlStyle: true,
      headerKind: "meta-control-menu",
      layoutClassName: "grid-cols-1 grid-rows-1",
      showMetaControlDragHandle: true,
    });
  });
});
