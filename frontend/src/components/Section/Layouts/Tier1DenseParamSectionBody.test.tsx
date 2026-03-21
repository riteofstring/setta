import { useReactFlow } from "forks/xyflow/core/store";
import { renderToStaticMarkup } from "react-dom/server";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { Tier1DenseParamSectionBody } from "./Tier1DenseParamSectionBody";

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: vi.fn(),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: vi.fn(),
}));

vi.mock("../SectionParts/Search", () => ({
  SectionSearch: ({ sectionId, callable }: { sectionId: string; callable: string }) => (
    <div data-testid="mock-section-search">{`${sectionId}:${callable}`}</div>
  ),
}));

vi.mock("../SectionParts/KwargsControls", () => ({
  KwargsControls: ({
    sectionId,
    showActionButtons = true,
  }: {
    sectionId: string;
    showActionButtons?: boolean;
  }) => (
    <div
      data-testid="mock-kwargs-controls"
      data-show-action-buttons={showActionButtons ? "true" : "false"}
    >
      {sectionId}
    </div>
  ),
}));

vi.mock("../../Params/GroupContainer", () => ({
  ParamGroupContainer: ({
    sectionId,
    bgColor,
    sectionTypeName,
  }: {
    sectionId: string;
    bgColor: string;
    sectionTypeName: string;
  }) => (
    <div data-testid="mock-param-group">{`${sectionId}:${bgColor}:${sectionTypeName}`}</div>
  ),
}));

describe("Tier1DenseParamSectionBody", () => {
  it("trims kwargs action buttons for inactive tier 1 sections during viewport motion", () => {
    vi.mocked(useReactFlow).mockImplementation((selector) =>
      selector({ viewportInteractionActive: true }),
    );
    vi.mocked(useIsSectionUIActive).mockReturnValue(false);

    const markup = renderToStaticMarkup(
      <Tier1DenseParamSectionBody
        sectionId="section-1"
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );

    expect(markup).toContain('data-testid="mock-kwargs-controls"');
    expect(markup).toContain('data-show-action-buttons="false"');
  });

  it("renders the callable search chrome and the shared param stack", () => {
    vi.mocked(useReactFlow).mockImplementation((selector) =>
      selector({ viewportInteractionActive: false }),
    );
    vi.mocked(useIsSectionUIActive).mockReturnValue(false);

    const markup = renderToStaticMarkup(
      <Tier1DenseParamSectionBody
        sectionId="section-1"
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Callable}
        callable="callable-1"
      />,
    );

    expect(markup).toContain('data-testid="mock-section-search"');
    expect(markup).toContain('data-testid="mock-kwargs-controls"');
    expect(markup).toContain('data-testid="mock-param-group"');
  });

  it("keeps the callable search visible when params are hidden", () => {
    vi.mocked(useReactFlow).mockImplementation((selector) =>
      selector({ viewportInteractionActive: false }),
    );
    vi.mocked(useIsSectionUIActive).mockReturnValue(false);

    const markup = renderToStaticMarkup(
      <Tier1DenseParamSectionBody
        sectionId="section-1"
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Callable}
        callable="callable-1"
        hideParams
      />,
    );

    expect(markup).toContain('data-testid="mock-section-search"');
    expect(markup).not.toContain('data-testid="mock-kwargs-controls"');
    expect(markup).not.toContain('data-testid="mock-param-group"');
  });

  it("renders dict and global-variables bodies without the callable-only search row", () => {
    vi.mocked(useReactFlow).mockImplementation((selector) =>
      selector({ viewportInteractionActive: false }),
    );
    vi.mocked(useIsSectionUIActive).mockReturnValue(false);

    const dictMarkup = renderToStaticMarkup(
      <Tier1DenseParamSectionBody
        sectionId="section-dict"
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );
    const globalsMarkup = renderToStaticMarkup(
      <Tier1DenseParamSectionBody
        sectionId="section-globals"
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.GlobalVariables}
      />,
    );

    expect(dictMarkup).not.toContain('data-testid="mock-section-search"');
    expect(dictMarkup).toContain('data-testid="mock-kwargs-controls"');
    expect(globalsMarkup).not.toContain('data-testid="mock-section-search"');
    expect(globalsMarkup).toContain('data-testid="mock-param-group"');
  });

  it("skips the heavy param stack while a minimized tier-1 section stays collapsed", () => {
    vi.mocked(useReactFlow).mockImplementation((selector) =>
      selector({ viewportInteractionActive: false }),
    );
    vi.mocked(useIsSectionUIActive).mockReturnValue(false);

    const markup = renderToStaticMarkup(
      <Tier1DenseParamSectionBody
        sectionId="section-1"
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
        isMinimized
      />,
    );

    expect(markup).not.toContain('data-testid="mock-kwargs-controls"');
    expect(markup).not.toContain('data-testid="mock-param-group"');
  });
});
