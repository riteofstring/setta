import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerSectionBoundaryProps } from "./SectionContainerSection";
import { SortableSectionSection } from "./SortableSectionSection";

vi.mock("./SectionContainerSection", () => ({
  SectionContainerSection: ({
    sectionId,
    isTopLevel,
    dragListeners,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: SectionContainerSectionBoundaryProps) => (
    <div
      data-testid="mock-section-container-section"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-drag-listeners={dragListeners ? "true" : "false"}
      data-has-section-boundary={String(Boolean(SectionBoundary))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
}));

describe("SortableSectionSection", () => {
  it("delegates the lifted sortable section props into the higher-level section wrapper", () => {
    const markup = renderToStaticMarkup(
      <SortableSectionSection
        sectionId="section-1"
        dragListeners={{ onPointerDown: "listener" }}
        renderCoreBody={() => null}
        renderNestedSections={() => null}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="false"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain('data-has-section-boundary="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
  });
});
