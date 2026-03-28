import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import type { SectionContainerSectionBoundaryProps } from "./SectionContainerSection";

vi.mock("./SectionContainerSection", () => ({
  SectionContainerSection: ({
    sectionId,
    isTopLevel,
    dragListeners,
    renderCoreBody,
    renderNestedSections,
  }: SectionContainerSectionBoundaryProps) => (
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

vi.mock("./sectionContainerDefaultRenderers", () => ({
  renderDefaultSectionContainerCoreBody: () => null,
  renderDefaultSectionContainerNestedSections: () => null,
}));

describe("SectionContainerBoundary", () => {
  it("owns the default recursive renderers above the lifted top-level section boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary sectionId="section-1" />,
    );

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="false"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
  });

  it("still forwards drag listeners through the lifted top-level boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary
        sectionId="section-2"
        dragListeners={{ onPointerDown: "listener" }}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
  });
});
