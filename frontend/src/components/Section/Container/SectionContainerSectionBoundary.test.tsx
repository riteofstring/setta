import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  SectionContainerSectionBoundary,
  type SectionContainerSectionBoundaryOnlyProps,
} from "./SectionContainerSectionBoundary";

vi.mock("./SectionContainerCoreCanvasBody", () => ({
  SectionContainerCoreCanvasBody: () => null,
}));

vi.mock("./SectionContainerNestedSections", () => ({
  SectionContainerNestedSections: () => null,
}));

vi.mock("./SectionContainerSection", () => ({
  SectionContainerSection: ({
    sectionId,
    isTopLevel,
    dragListeners,
    renderCoreBody,
    renderNestedSections,
  }: SectionContainerSectionBoundaryOnlyProps & {
    renderCoreBody: unknown;
    renderNestedSections: unknown;
  }) => (
    <div
      data-testid="mock-section-container-section"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-drag-listeners={String(Boolean(dragListeners))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
}));

describe("SectionContainerSectionBoundary", () => {
  it("owns the default recursive section renderers above SectionContainerSection", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerSectionBoundary
        sectionId="section-1"
        isTopLevel={true}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="false"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
  });
});
