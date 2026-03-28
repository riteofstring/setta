import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import type { SectionContainerSectionProps } from "./SectionContainerSection";

vi.mock("./SectionContainerSection", () => ({
  SectionContainerSection: ({
    sectionId,
    isTopLevel,
    dragListeners,
  }: SectionContainerSectionProps) => (
    <div
      data-testid="mock-section-container-section"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-drag-listeners={String(Boolean(dragListeners))}
    />
  ),
}));

describe("SectionContainerBoundary", () => {
  it("delegates the top-level section props into the lifted section-container boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary sectionId="section-1" isTopLevel={true} />,
    );

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="false"');
  });
});
