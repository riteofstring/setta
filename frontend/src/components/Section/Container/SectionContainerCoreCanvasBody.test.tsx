import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";

let mockBenchmark = {
  active: false,
  stage: "full" as const,
  renderSectionBody: true,
  renderFullSectionBody: true,
};

vi.mock("components/Pages/Project/settingsAllSettingsBenchmark", () => ({
  useSettingsAllSettingsBenchmark: () => mockBenchmark,
}));

vi.mock("./SectionCanvasBody", () => ({
  SectionCanvasBody: ({
    sectionId,
    bgColor,
  }: {
    sectionId: string;
    bgColor: string;
  }) => (
    <div
      data-testid="mock-section-canvas-body"
      data-section-id={sectionId}
      data-bg-color={bgColor}
    />
  ),
}));

describe("SectionContainerCoreCanvasBody", () => {
  beforeEach(() => {
    mockBenchmark = {
      active: false,
      stage: "full",
      renderSectionBody: true,
      renderFullSectionBody: true,
    };
  });

  it("keeps the live canvas-body handoff when the benchmark is inactive", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerCoreCanvasBody
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Dict}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-canvas-body"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-bg-color="bg-setta-50"');
    expect(markup).not.toContain("data-settings-benchmark-placeholder");
  });

  it("switches to the benchmark placeholder when the benchmark hides the body", () => {
    mockBenchmark = {
      active: true,
      stage: "header-only",
      renderSectionBody: false,
      renderFullSectionBody: false,
    };

    const markup = renderToStaticMarkup(
      <SectionContainerCoreCanvasBody
        sectionId="section-2"
        sectionTypeName={SectionTypeEnum.Code}
        bgColor="bg-transparent"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-settings-benchmark-placeholder="header-only"');
    expect(markup).toContain("Header only");
    expect(markup).not.toContain('data-testid="mock-section-canvas-body"');
  });

  it("suppresses the placeholder for meta-control sections when the benchmark hides the body", () => {
    mockBenchmark = {
      active: true,
      stage: "frame-only",
      renderSectionBody: false,
      renderFullSectionBody: false,
    };

    const markup = renderToStaticMarkup(
      <SectionContainerCoreCanvasBody
        sectionId="section-3"
        sectionTypeName={SectionTypeEnum.MetaControl}
        bgColor="bg-transparent"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toBe("");
  });
});
