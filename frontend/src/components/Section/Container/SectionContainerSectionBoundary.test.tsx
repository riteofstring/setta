import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  SectionContainerSectionBoundary,
  type SectionContainerSectionBoundaryOnlyProps,
} from "./SectionContainerSectionBoundary";
import { SortableSectionSection } from "./SortableSectionSection";

const mockSectionContainerSection = vi.fn(
  ({
    sectionId,
    isTopLevel,
    dragListeners,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: SectionContainerSectionBoundaryOnlyProps & {
    SectionBoundary: unknown;
    renderCoreBody: unknown;
    renderNestedSections: unknown;
  }) => (
    <div
      data-testid="mock-section-container-section"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-drag-listeners={String(Boolean(dragListeners))}
      data-has-section-boundary={String(Boolean(SectionBoundary))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
);

vi.mock("./SectionContainerCoreCanvasBody", () => ({
  SectionContainerCoreCanvasBody: () => null,
}));

vi.mock("./SectionContainerNestedSections", () => ({
  SectionContainerNestedSections: () => null,
}));

vi.mock("./SectionContainerSection", () => ({
  SectionContainerSection: (
    props: Parameters<typeof mockSectionContainerSection>[0],
  ) => mockSectionContainerSection(props),
}));

vi.mock("./SortableSectionSection", () => ({
  SortableSectionSection: () => null,
}));

describe("SectionContainerSectionBoundary", () => {
  it("owns the default recursive section renderers above SectionContainerSection", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerSectionBoundary
        sectionId="section-1"
        isTopLevel={true}
      />,
    );
    const forwardedProps = mockSectionContainerSection.mock.calls[0]?.[0];

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="false"');
    expect(markup).toContain('data-has-section-boundary="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(forwardedProps?.SectionBoundary).toBe(SortableSectionSection);
  });
});
