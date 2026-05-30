import { renderToStaticMarkup } from "react-dom/server";
import {
  BARE_SECTION_NODE_MIN_HEIGHT,
  BARE_SECTION_NODE_MIN_WIDTH,
} from "utils/bareSectionNodes";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { BareSectionNodeSurface } from "./BareSectionNodeSurface";

vi.mock("components/Params/EdgesStrip", () => ({
  EdgesStrip: ({
    sectionId,
    bgColor,
    variant,
  }: {
    sectionId: string;
    bgColor: string;
    variant?: string;
  }) => (
    <div
      data-testid="mock-bare-edge-strip"
      data-bg-color={bgColor}
      data-section-id={sectionId}
      data-variant={variant ?? ""}
    />
  ),
}));

vi.mock("./BareSectionNodeHeader", () => ({
  BareSectionNodeHeader: ({
    sectionId,
    sectionTypeName,
  }: {
    sectionId: string;
    sectionTypeName: string;
  }) => (
    <header
      data-testid="mock-bare-section-node-header"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
    />
  ),
}));

describe("BareSectionNodeSurface", () => {
  it("renders the bare node header and data edge strip on non-minimized nodes", () => {
    const markup = renderToStaticMarkup(
      <BareSectionNodeSurface
        sectionId="callable-1"
        sectionTypeName={SectionTypeEnum.Callable}
        isInOtherProjectConfigs={false}
        hasSectionStyleTheme={false}
        bgColor="bg-setta-50"
        isMinimized={false}
      />,
    );

    expect(markup).toContain('data-testid="bare-section-node-surface"');
    expect(markup).toContain('data-testid="mock-bare-section-node-header"');
    expect(markup).toContain('data-section-type="Callable"');
    expect(markup).toContain('data-testid="mock-bare-edge-strip"');
    expect(markup).toContain('data-variant="bare-node"');
    expect(markup).toContain('data-bg-color="bg-setta-50"');
    expect(markup).toContain(`min-height:${BARE_SECTION_NODE_MIN_HEIGHT}px`);
    expect(markup).toContain(`min-width:${BARE_SECTION_NODE_MIN_WIDTH}px`);
  });

  it("keeps minimized bare nodes to the title surface", () => {
    const markup = renderToStaticMarkup(
      <BareSectionNodeSurface
        sectionId="dict-1"
        sectionTypeName={SectionTypeEnum.Dict}
        isInOtherProjectConfigs={false}
        hasSectionStyleTheme={false}
        bgColor="bg-setta-50"
        isMinimized={true}
      />,
    );

    expect(markup).toContain('data-testid="mock-bare-section-node-header"');
    expect(markup).not.toContain('data-testid="mock-bare-edge-strip"');
  });
});
