import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import type { SectionContainerSectionBoundaryOnlyProps } from "./SectionContainerSectionBoundary";

vi.mock("./SectionContainerSectionBoundary", () => ({
  SectionContainerSectionBoundary: ({
    sectionId,
    isTopLevel,
    dragListeners,
  }: SectionContainerSectionBoundaryOnlyProps) => (
    <div
      data-testid="mock-section-container-section-boundary"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-drag-listeners={String(Boolean(dragListeners))}
    />
  ),
}));

describe("SectionContainerBoundary", () => {
  it("owns the top-level section handoff above the lifted section-container boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary sectionId="section-1" />,
    );

    expect(markup).toContain(
      'data-testid="mock-section-container-section-boundary"',
    );
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="false"');
  });

  it("still forwards drag listeners through the lifted top-level boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary
        sectionId="section-2"
        dragListeners={{ onPointerDown: "listener" }}
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-section-container-section-boundary"',
    );
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="true"');
  });
});
